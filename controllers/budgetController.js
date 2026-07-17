import Budget from '../models/Budget.js';
import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import { getModel, isGeminiReady } from '../config/gemini.js';

// Helper: compute the start of the current period for a budget
const getPeriodStart = (period) => {
    const now = new Date();
    if (period === 'weekly') {
        const day = now.getDay(); // 0 = Sunday
        const diff = now.getDate() - day;
        return new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
    }
    // monthly
    return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
};

// Helper: format budget with category data and spent amount
const formatBudget = (budget, cat, spent) => ({
    id: budget._id,
    user_id: budget.userId,
    category_id: cat._id,
    category_name: cat.name,
    category_icon: cat.icon,
    category_color: cat.color,
    amount: parseFloat(budget.amount).toFixed(2),
    spent: parseFloat(spent || 0).toFixed(2),
    period: budget.period,
    start_date: budget.startDate instanceof Date
        ? budget.startDate.toISOString().split('T')[0]
        : budget.startDate,
});

// @desc    Get all budgets for the user (with live spent calculation)
// @route   GET /api/budgets
// @access  Private
export const getBudgets = async (req, res) => {
    try {
        const budgets = await Budget.find({ userId: req.user._id }).populate('categoryId');

        const results = await Promise.all(
            budgets.map(async (budget) => {
                if (!budget.categoryId) return null;

                const periodStart = getPeriodStart(budget.period);

                // Sum all expenses in this category from the start of the period
                const agg = await Transaction.aggregate([
                    {
                        $match: {
                            userId: req.user._id,
                            categoryId: budget.categoryId._id,
                            type: 'expense',
                            transactionDate: { $gte: periodStart },
                        },
                    },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]);

                const spent = agg[0]?.total || 0;
                return formatBudget(budget, budget.categoryId, spent);
            })
        );

        res.json(results.filter(Boolean));
    } catch (error) {
        console.error('getBudgets error:', error);
        res.status(500).json({ message: 'Server error fetching budgets' });
    }
};

// @desc    Create a budget
// @route   POST /api/budgets
// @access  Private
export const createBudget = async (req, res) => {
    try {
        const { categoryId, amount, period } = req.body;

        if (!categoryId || !amount) {
            return res.status(400).json({ message: 'categoryId and amount are required' });
        }

        const cat = await Category.findOne({ _id: categoryId, userId: req.user._id });
        if (!cat) {
            return res.status(400).json({ message: 'Invalid category' });
        }

        // Check if budget already exists for this category
        const existing = await Budget.findOne({ userId: req.user._id, categoryId });
        if (existing) {
            return res.status(400).json({ message: 'A budget for this category already exists' });
        }

        const startDate = getPeriodStart(period || 'monthly');

        const budget = await Budget.create({
            userId: req.user._id,
            categoryId,
            amount: parseFloat(amount),
            period: period || 'monthly',
            startDate,
        });

        res.status(201).json(formatBudget(budget, cat, 0));
    } catch (error) {
        console.error('createBudget error:', error);
        res.status(500).json({ message: 'Server error creating budget' });
    }
};

// @desc    Update a budget (amount, period)
// @route   PUT /api/budgets/:id
// @access  Private
export const updateBudget = async (req, res) => {
    try {
        const budget = await Budget.findOne({ _id: req.params.id, userId: req.user._id }).populate('categoryId');
        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }

        const { amount, period } = req.body;
        if (amount !== undefined) budget.amount = parseFloat(amount);
        if (period !== undefined) {
            budget.period = period;
            budget.startDate = getPeriodStart(period);
        }

        await budget.save();

        const periodStart = getPeriodStart(budget.period);
        const agg = await Transaction.aggregate([
            {
                $match: {
                    userId: req.user._id,
                    categoryId: budget.categoryId._id,
                    type: 'expense',
                    transactionDate: { $gte: periodStart },
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);
        const spent = agg[0]?.total || 0;

        res.json(formatBudget(budget, budget.categoryId, spent));
    } catch (error) {
        console.error('updateBudget error:', error);
        res.status(500).json({ message: 'Server error updating budget' });
    }
};

// @desc    Delete a budget
// @route   DELETE /api/budgets/:id
// @access  Private
export const deleteBudget = async (req, res) => {
    try {
        const budget = await Budget.findOne({ _id: req.params.id, userId: req.user._id });
        if (!budget) {
            return res.status(404).json({ message: 'Budget not found' });
        }
        await budget.deleteOne();
        res.json({ message: 'Budget deleted' });
    } catch (error) {
        console.error('deleteBudget error:', error);
        res.status(500).json({ message: 'Server error deleting budget' });
    }
};

// @desc    Analyze all budgets with Gemini AI
// @route   POST /api/budgets/analyze
// @access  Private
export const analyzeBudgets = async (req, res) => {
    try {
        const budgets = await Budget.find({ userId: req.user._id }).populate('categoryId');

        if (budgets.length === 0) {
            return res.json({ analyses: [] });
        }

        // Compute spent for each budget
        const budgetData = await Promise.all(
            budgets.map(async (budget) => {
                if (!budget.categoryId) return null;
                const periodStart = getPeriodStart(budget.period);
                const agg = await Transaction.aggregate([
                    {
                        $match: {
                            userId: req.user._id,
                            categoryId: budget.categoryId._id,
                            type: 'expense',
                            transactionDate: { $gte: periodStart },
                        },
                    },
                    { $group: { _id: null, total: { $sum: '$amount' } } },
                ]);
                return {
                    budgetId: budget._id.toString(),
                    category: budget.categoryId.name,
                    limit: budget.amount,
                    spent: agg[0]?.total || 0,
                    period: budget.period,
                };
            })
        );

        const validBudgets = budgetData.filter(Boolean);

        if (!isGeminiReady()) {
            // Fallback: compute statuses locally
            const analyses = validBudgets.map((b) => {
                const pct = b.limit > 0 ? (b.spent / b.limit) * 100 : 0;
                const status = pct >= 100 ? 'concerning' : pct >= 80 ? 'caution' : 'good';
                const msg =
                    pct >= 100
                        ? `${b.category} has exceeded its $${b.limit.toFixed(2)} budget by $${(b.spent - b.limit).toFixed(2)}.`
                        : pct >= 80
                        ? `${b.category} is at ${pct.toFixed(0)}% of the $${b.limit.toFixed(2)} budget. Watch your spending.`
                        : `${b.category} is on track at $${b.spent.toFixed(2)} of $${b.limit.toFixed(2)}.`;
                return { budgetId: b.budgetId, status, message: msg };
            });
            return res.json({ analyses });
        }

        const summaryLines = validBudgets.map(
            (b) => `${b.category} (${b.period}): spent $${b.spent.toFixed(2)} of $${b.limit.toFixed(2)} budget`
        );

        const prompt = `
You are a personal finance assistant. Analyze the following budget data and return a JSON object with an "analyses" array.

Each element must have:
- "budgetId": the exact budget ID string provided
- "status": one of "good", "caution", or "concerning"
- "message": a short, actionable 1-2 sentence evaluation

Budget data:
${validBudgets.map((b, i) => `ID: ${b.budgetId} — ${summaryLines[i]}`).join('\n')}

Rules:
- "good": spent < 80% of limit
- "caution": 80% <= spent < 100%
- "concerning": spent >= 100%

Return ONLY raw JSON with no markdown. Format:
{"analyses": [{"budgetId": "...", "status": "...", "message": "..."}]}
        `.trim();

        const model = getModel();
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
        });

        const responseText = result.response.text();
        const parsed = JSON.parse(responseText);

        res.json(parsed);
    } catch (error) {
        console.error('analyzeBudgets error:', error);
        res.status(500).json({ message: 'AI budget analysis failed. Please try again.' });
    }
};
