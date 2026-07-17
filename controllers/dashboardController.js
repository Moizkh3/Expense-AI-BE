import Transaction from '../models/Transaction.js';

// Helper: get start and end of current month
const getMonthRange = (year, month) => {
    const start = new Date(year, month, 1, 0, 0, 0, 0);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    return { start, end };
};

// @desc    Get dashboard summary (income, expenses, balance, savings rate, deltas)
// @route   GET /api/dashboard/summary
// @access  Private
export const getSummary = async (req, res) => {
    try {
        const now = new Date();
        const currYear = now.getFullYear();
        const currMonth = now.getMonth();
        const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
        const prevYear = currMonth === 0 ? currYear - 1 : currYear;

        const { start: currStart, end: currEnd } = getMonthRange(currYear, currMonth);
        const { start: prevStart, end: prevEnd } = getMonthRange(prevYear, prevMonth);

        const aggregate = async (start, end) => {
            const results = await Transaction.aggregate([
                {
                    $match: {
                        userId: req.user._id,
                        transactionDate: { $gte: start, $lte: end },
                    },
                },
                {
                    $group: {
                        _id: '$type',
                        total: { $sum: '$amount' },
                    },
                },
            ]);
            const income = results.find((r) => r._id === 'income')?.total || 0;
            const expense = results.find((r) => r._id === 'expense')?.total || 0;
            return { income, expense };
        };

        const curr = await aggregate(currStart, currEnd);
        const prev = await aggregate(prevStart, prevEnd);

        const balance = curr.income - curr.expense;
        const savingsRate = curr.income > 0 ? ((curr.income - curr.expense) / curr.income) * 100 : 0;

        const delta = (curr, prev) => {
            if (prev === 0) return curr > 0 ? 100 : 0;
            return parseFloat((((curr - prev) / prev) * 100).toFixed(1));
        };

        res.json({
            incomeThisMonth: curr.income,
            expenseThisMonth: curr.expense,
            balance,
            savingsRate: parseFloat(savingsRate.toFixed(1)),
            incomeDelta: delta(curr.income, prev.income),
            expenseDelta: delta(curr.expense, prev.expense),
        });
    } catch (error) {
        console.error('getSummary error:', error);
        res.status(500).json({ message: 'Server error fetching summary' });
    }
};

// @desc    Get monthly trend (income vs expense, last 6 months)
// @route   GET /api/dashboard/monthly-trend
// @access  Private
export const getMonthlyTrend = async (req, res) => {
    try {
        const now = new Date();
        const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);

        const results = await Transaction.aggregate([
            {
                $match: {
                    userId: req.user._id,
                    transactionDate: { $gte: sixMonthsAgo },
                },
            },
            {
                $group: {
                    _id: {
                        year: { $year: '$transactionDate' },
                        month: { $month: '$transactionDate' },
                        type: '$type',
                    },
                    total: { $sum: '$amount' },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        // Build a map of all 6 months
        const monthMap = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            monthMap[key] = { month: key, income: 0, expense: 0 };
        }

        results.forEach((r) => {
            const key = `${r._id.year}-${String(r._id.month).padStart(2, '0')}`;
            if (monthMap[key]) {
                monthMap[key][r._id.type] = r.total;
            }
        });

        const trend = Object.values(monthMap).map((m) => ({
            month: m.month,
            income: m.income.toFixed(2),
            expense: m.expense.toFixed(2),
        }));

        res.json(trend);
    } catch (error) {
        console.error('getMonthlyTrend error:', error);
        res.status(500).json({ message: 'Server error fetching monthly trend' });
    }
};

// @desc    Get category breakdown (current month expenses)
// @route   GET /api/dashboard/category-breakdown
// @access  Private
export const getCategoryBreakdown = async (req, res) => {
    try {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

        const results = await Transaction.aggregate([
            {
                $match: {
                    userId: req.user._id,
                    type: 'expense',
                    transactionDate: { $gte: monthStart },
                    categoryId: { $ne: null },
                },
            },
            {
                $group: {
                    _id: '$categoryId',
                    total: { $sum: '$amount' },
                    transaction_count: { $sum: 1 },
                },
            },
            {
                $lookup: {
                    from: 'categories',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'category',
                },
            },
            { $unwind: '$category' },
            { $sort: { total: -1 } },
            { $limit: 10 },
        ]);

        const breakdown = results.map((r) => ({
            category_id: r._id,
            category_name: r.category.name,
            category_icon: r.category.icon,
            category_color: r.category.color,
            total: r.total.toFixed(2),
            transaction_count: r.transaction_count,
        }));

        res.json(breakdown);
    } catch (error) {
        console.error('getCategoryBreakdown error:', error);
        res.status(500).json({ message: 'Server error fetching category breakdown' });
    }
};
