import Transaction from '../models/Transaction.js';
import Category from '../models/Category.js';
import Budget from '../models/Budget.js';
import Notification from '../models/Notification.js';
import { getModel, isGeminiReady } from '../config/gemini.js';

// Helper: check budget thresholds and create notification if necessary
const checkBudgetNotification = async (userId, categoryId) => {
    try {
        if (!categoryId) return;

        // Find the active budget for this category
        const budget = await Budget.findOne({ userId, categoryId }).populate('categoryId');
        if (!budget) return;

        // Calculate start of period (monthly or weekly)
        const now = new Date();
        let periodStart;
        if (budget.period === 'weekly') {
            const day = now.getDay();
            const diff = now.getDate() - day;
            periodStart = new Date(now.getFullYear(), now.getMonth(), diff, 0, 0, 0, 0);
        } else {
            periodStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        }

        // Sum expenses in this category for this period
        const agg = await Transaction.aggregate([
            {
                $match: {
                    userId,
                    categoryId: budget.categoryId._id,
                    type: 'expense',
                    transactionDate: { $gte: periodStart },
                },
            },
            { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const spent = agg[0]?.total || 0;
        const limit = budget.amount;
        if (limit <= 0) return;

        const pct = (spent / limit) * 100;
        const catName = budget.categoryId.name;

        // Check if we already notified in the last 12 hours to prevent duplicate spam
        const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);

        if (pct >= 100) {
            const title = `Budget Exceeded: ${catName}`;
            const message = `You've spent $${spent.toFixed(2)} of your $${limit.toFixed(2)} budget in ${catName}.`;
            
            const alreadySent = await Notification.findOne({
                userId,
                title,
                createdAt: { $gte: twelveHoursAgo }
            });

            if (!alreadySent) {
                await Notification.create({
                    userId,
                    title,
                    message,
                    type: 'warning',
                });
            }
        } else if (pct >= 80) {
            const title = `Approaching Budget Limit: ${catName}`;
            const message = `You've spent $${spent.toFixed(2)} (${pct.toFixed(0)}%) of your $${limit.toFixed(2)} budget in ${catName}.`;

            const alreadySent = await Notification.findOne({
                userId,
                title: { $in: [`Budget Exceeded: ${catName}`, title] },
                createdAt: { $gte: twelveHoursAgo }
            });

            if (!alreadySent) {
                await Notification.create({
                    userId,
                    title,
                    message,
                    type: 'warning',
                });
            }
        }
    } catch (err) {
        console.error('checkBudgetNotification helper error:', err);
    }
};

// Helper: format a transaction document with category details
const formatTransaction = (t) => ({
    id: t._id,
    user_id: t.userId,
    category_id: t.categoryId?._id || t.categoryId || null,
    category_name: t.categoryId?.name || null,
    category_icon: t.categoryId?.icon || null,
    category_color: t.categoryId?.color || null,
    amount: parseFloat(t.amount).toFixed(2),
    type: t.type,
    description: t.description || null,
    notes: t.notes || null,
    transaction_date: t.transactionDate instanceof Date
        ? t.transactionDate.toISOString().split('T')[0]
        : t.transactionDate,
    created_at: t.createdAt,
});

// @desc    Get all transactions for the user (with filters)
// @route   GET /api/transactions
// @access  Private
export const getTransactions = async (req, res) => {
    try {
        const { search, categoryId, type, limit } = req.query;

        const query = { userId: req.user._id };

        if (type && ['income', 'expense'].includes(type)) {
            query.type = type;
        }

        if (categoryId) {
            query.categoryId = categoryId;
        }

        let dbQuery = Transaction.find(query)
            .populate('categoryId', 'name icon color')
            .sort({ transactionDate: -1, createdAt: -1 });

        if (limit) {
            dbQuery = dbQuery.limit(parseInt(limit, 10));
        }

        let transactions = await dbQuery;

        // Apply search filter in-memory (description + notes)
        if (search) {
            const q = search.toLowerCase();
            transactions = transactions.filter(
                (t) =>
                    (t.description || '').toLowerCase().includes(q) ||
                    (t.notes || '').toLowerCase().includes(q)
            );
        }

        res.json(transactions.map(formatTransaction));
    } catch (error) {
        console.error('getTransactions error:', error);
        res.status(500).json({ message: 'Server error fetching transactions' });
    }
};

// @desc    Get a single transaction by ID
// @route   GET /api/transactions/:id
// @access  Private
export const getTransactionById = async (req, res) => {
    try {
        const transaction = await Transaction.findOne({
            _id: req.params.id,
            userId: req.user._id,
        }).populate('categoryId', 'name icon color');

        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        res.json(formatTransaction(transaction));
    } catch (error) {
        console.error('getTransactionById error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Create a transaction
// @route   POST /api/transactions
// @access  Private
export const createTransaction = async (req, res) => {
    try {
        const { type, amount, categoryId, description, notes, transactionDate } = req.body;

        if (!type || !amount || !transactionDate) {
            return res.status(400).json({ message: 'type, amount, and transactionDate are required' });
        }

        // Validate category belongs to user (if provided)
        if (categoryId) {
            const cat = await Category.findOne({ _id: categoryId, userId: req.user._id });
            if (!cat) {
                return res.status(400).json({ message: 'Invalid category' });
            }
        }

        const transaction = await Transaction.create({
            userId: req.user._id,
            type,
            amount: parseFloat(amount),
            categoryId: categoryId || null,
            description: description || null,
            notes: notes || null,
            transactionDate: new Date(transactionDate),
        });

        // Trigger budget check in background
        if (transaction.type === 'expense' && transaction.categoryId) {
            checkBudgetNotification(transaction.userId, transaction.categoryId);
        }

        const populated = await Transaction.findById(transaction._id).populate('categoryId', 'name icon color');
        res.status(201).json(formatTransaction(populated));
    } catch (error) {
        console.error('createTransaction error:', error);
        res.status(500).json({ message: 'Server error creating transaction' });
    }
};

// @desc    Update a transaction
// @route   PUT /api/transactions/:id
// @access  Private
export const updateTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }

        const { type, amount, categoryId, description, notes, transactionDate } = req.body;

        if (type !== undefined) transaction.type = type;
        if (amount !== undefined) transaction.amount = parseFloat(amount);
        if (description !== undefined) transaction.description = description || null;
        if (notes !== undefined) transaction.notes = notes || null;
        if (transactionDate !== undefined) transaction.transactionDate = new Date(transactionDate);
        if (categoryId !== undefined) {
            if (categoryId) {
                const cat = await Category.findOne({ _id: categoryId, userId: req.user._id });
                if (!cat) return res.status(400).json({ message: 'Invalid category' });
            }
            transaction.categoryId = categoryId || null;
        }

        await transaction.save();

        // Trigger budget check in background
        if (transaction.type === 'expense' && transaction.categoryId) {
            checkBudgetNotification(transaction.userId, transaction.categoryId);
        }

        const populated = await Transaction.findById(transaction._id).populate('categoryId', 'name icon color');
        res.json(formatTransaction(populated));
    } catch (error) {
        console.error('updateTransaction error:', error);
        res.status(500).json({ message: 'Server error updating transaction' });
    }
};

// @desc    Delete a transaction
// @route   DELETE /api/transactions/:id
// @access  Private
export const deleteTransaction = async (req, res) => {
    try {
        const transaction = await Transaction.findOne({ _id: req.params.id, userId: req.user._id });
        if (!transaction) {
            return res.status(404).json({ message: 'Transaction not found' });
        }
        await transaction.deleteOne();
        res.json({ message: 'Transaction deleted' });
    } catch (error) {
        console.error('deleteTransaction error:', error);
        res.status(500).json({ message: 'Server error deleting transaction' });
    }
};

// @desc    Analyze transactions with Gemini AI
// @route   POST /api/transactions/analyze
// @access  Private
export const analyzeTransactions = async (req, res) => {
    try {
        const { transactionIds } = req.body;

        let transactions;
        if (transactionIds && transactionIds.length > 0) {
            transactions = await Transaction.find({
                _id: { $in: transactionIds },
                userId: req.user._id,
            }).populate('categoryId', 'name');
        } else {
            transactions = await Transaction.find({ userId: req.user._id })
                .populate('categoryId', 'name')
                .sort({ transactionDate: -1 })
                .limit(50);
        }

        if (transactions.length === 0) {
            return res.json({ insight: 'No transactions found to analyze.', highlight: 'No data' });
        }

        if (!isGeminiReady()) {
            return res.json({
                insight: 'Your spending appears stable. Please configure GEMINI_API_KEY for real AI analysis.',
                highlight: 'AI not configured',
            });
        }

        const summaryLines = transactions.map((t) => {
            const catName = t.categoryId?.name || 'Uncategorized';
            const dateStr = t.transactionDate.toISOString().split('T')[0];
            return `${dateStr} | ${t.type} | ${catName} | $${t.amount.toFixed(2)} | ${t.description || ''}`;
        });

        const prompt = `
You are a personal finance analyst. Analyze the following list of financial transactions and return a JSON object with:
- "insight": A 2-3 sentence narrative summary of the user's spending patterns, top categories, and any notable trends.
- "highlight": A very short 3-5 word title or phrase summarizing the overall pattern (e.g., "Stable spending habits").

Transactions (date | type | category | amount | description):
${summaryLines.join('\n')}

Return ONLY raw JSON with no markdown, no code blocks. Format:
{"insight": "...", "highlight": "..."}
        `.trim();

        const model = getModel();
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
        });

        const responseText = result.response.text();
        const analysis = JSON.parse(responseText);

        res.json(analysis);
    } catch (error) {
        console.error('analyzeTransactions error:', error);
        res.status(500).json({ message: 'AI analysis failed. Please try again.' });
    }
};
