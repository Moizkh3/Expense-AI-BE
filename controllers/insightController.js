import Insight from '../models/Insight.js';
import Transaction from '../models/Transaction.js';
import Budget from '../models/Budget.js';
import Notification from '../models/Notification.js';
import { getModel, isGeminiReady } from '../config/gemini.js';

// Fallback content when Gemini is not configured
const FALLBACK_INSIGHTS = {
    monthly_summary: {
        summary: 'Configure your GEMINI_API_KEY to receive personalized AI-generated insights about your monthly spending.',
        highlights: ['Set up Gemini AI for personalized analysis'],
        concerns: [],
        recommendations: [
            { title: 'Add your Gemini API Key', detail: 'Update GEMINI_API_KEY in server/.env to enable AI-powered insights.' },
        ],
        topSpendingCategory: 'N/A',
        estimatedMonthlySavings: 0,
        healthScore: 50,
    },
    savings_tips: {
        overallTip: 'Configure your GEMINI_API_KEY to get personalized savings tips based on your actual spending.',
        tips: [
            { category: 'General', title: 'Set up Gemini AI', detail: 'Add your GEMINI_API_KEY to get real AI-powered savings recommendations.', estimatedSavings: 0 },
        ],
    },
};

// Helper: get current month range
const currentMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { start, end };
};

// @desc    Get all insights for the user
// @route   GET /api/insights
// @access  Private
export const getInsights = async (req, res) => {
    try {
        const insights = await Insight.find({ userId: req.user._id }).sort({ createdAt: -1 });

        const formatted = insights.map((ins) => ({
            id: ins._id,
            insight_type: ins.insightType,
            period_start: ins.periodStart,
            period_end: ins.periodEnd,
            content_json: ins.contentJson,
            created_at: ins.createdAt,
        }));

        res.json(formatted);
    } catch (error) {
        console.error('getInsights error:', error);
        res.status(500).json({ message: 'Server error fetching insights' });
    }
};

// @desc    Generate an AI insight and persist it
// @route   POST /api/insights/generate
// @access  Private
export const generateInsight = async (req, res) => {
    try {
        const { type } = req.body;

        if (!type || !['monthly_summary', 'savings_tips'].includes(type)) {
            return res.status(400).json({ message: 'Invalid insight type. Must be monthly_summary or savings_tips.' });
        }

        const { start, end } = currentMonthRange();

        // Gather context data
        const [transactions, budgets] = await Promise.all([
            Transaction.find({ userId: req.user._id, transactionDate: { $gte: start, $lte: end } })
                .populate('categoryId', 'name')
                .sort({ transactionDate: -1 }),
            Budget.find({ userId: req.user._id }).populate('categoryId', 'name'),
        ]);

        const income = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
        const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
        const savingsRate = income > 0 ? (((income - expense) / income) * 100).toFixed(1) : 0;

        // Category spending summary
        const catSpend = {};
        transactions.filter((t) => t.type === 'expense').forEach((t) => {
            const name = t.categoryId?.name || 'Uncategorized';
            catSpend[name] = (catSpend[name] || 0) + t.amount;
        });
        const catLines = Object.entries(catSpend)
            .sort((a, b) => b[1] - a[1])
            .map(([cat, amt]) => `${cat}: $${amt.toFixed(2)}`)
            .join(', ');

        // Budget lines
        const budgetLines = budgets
            .map((b) => `${b.categoryId?.name || 'Unknown'}: limit $${b.amount.toFixed(2)}`)
            .join(', ');

        if (!isGeminiReady()) {
            const contentJson = FALLBACK_INSIGHTS[type];
            const insight = await Insight.create({
                userId: req.user._id,
                insightType: type,
                periodStart: start,
                periodEnd: end,
                contentJson,
            });

            // Create in-app notification
            const typeLabel = type === 'monthly_summary' ? 'Monthly Summary' : 'Savings Tips';
            await Notification.create({
                userId: req.user._id,
                title: `New AI Insight: ${typeLabel}`,
                message: `Your personalized ${typeLabel.toLowerCase()} is ready for viewing.`,
                type: 'success',
            });

            return res.json({
                id: insight._id,
                insight_type: insight.insightType,
                period_start: insight.periodStart,
                period_end: insight.periodEnd,
                content_json: insight.contentJson,
                created_at: insight.createdAt,
            });
        }

        let prompt = '';

        if (type === 'monthly_summary') {
            prompt = `
You are a personal finance advisor. Generate a monthly financial summary for a user with this data:

Income this month: $${income.toFixed(2)}
Expenses this month: $${expense.toFixed(2)}
Savings rate: ${savingsRate}%
Spending by category: ${catLines || 'No expenses yet'}
Active budgets: ${budgetLines || 'None set'}

Return ONLY a raw JSON object with NO markdown or code blocks. Use this exact structure:
{
  "summary": "2-3 sentence narrative overview",
  "highlights": ["highlight 1", "highlight 2", "highlight 3"],
  "concerns": ["concern 1", "concern 2"],
  "recommendations": [
    {"title": "Short title", "detail": "Actionable detail"},
    {"title": "Short title", "detail": "Actionable detail"}
  ],
  "topSpendingCategory": "Category name",
  "estimatedMonthlySavings": <number>,
  "healthScore": <number 0-100>
}
            `.trim();
        } else if (type === 'savings_tips') {
            prompt = `
You are a personal finance advisor. Generate personalized savings tips based on this spending data:

Spending by category this month: ${catLines || 'No expenses yet'}
Total expenses: $${expense.toFixed(2)}
Income: $${income.toFixed(2)}

Return ONLY a raw JSON object with NO markdown or code blocks. Use this exact structure:
{
  "overallTip": "One sentence top-level savings insight",
  "tips": [
    {
      "category": "Category name",
      "title": "Short actionable tip title",
      "detail": "2-3 sentence explanation",
      "estimatedSavings": <number>
    }
  ]
}

Provide 3-5 tips. estimatedSavings should be a realistic monthly dollar estimate.
            `.trim();
        }

        const model = getModel();
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
        });

        const responseText = result.response.text();
        const contentJson = JSON.parse(responseText);

        const insight = await Insight.create({
            userId: req.user._id,
            insightType: type,
            periodStart: start,
            periodEnd: end,
            contentJson,
        });

        // Create in-app notification
        const typeLabel = type === 'monthly_summary' ? 'Monthly Summary' : 'Savings Tips';
        await Notification.create({
            userId: req.user._id,
            title: `New AI Insight: ${typeLabel}`,
            message: `Your personalized ${typeLabel.toLowerCase()} is ready for viewing.`,
            type: 'success',
        });

        res.json({
            id: insight._id,
            insight_type: insight.insightType,
            period_start: insight.periodStart,
            period_end: insight.periodEnd,
            content_json: insight.contentJson,
            created_at: insight.createdAt,
        });
    } catch (error) {
        console.error('generateInsight error:', error);
        res.status(500).json({ message: 'AI insight generation failed. Please try again.' });
    }
};
