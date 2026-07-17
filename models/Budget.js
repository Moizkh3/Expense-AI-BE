import mongoose from 'mongoose';

const budgetSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, 'Category is required for a budget'],
        },
        amount: {
            type: Number,
            required: [true, 'Budget amount is required'],
            min: [0.01, 'Budget amount must be positive'],
        },
        period: {
            type: String,
            enum: ['monthly', 'weekly'],
            default: 'monthly',
        },
        startDate: {
            type: Date,
            required: [true, 'Start date is required'],
        },
    },
    { timestamps: true }
);

// Prevent duplicate budgets for the same category per user
budgetSchema.index({ userId: 1, categoryId: 1 }, { unique: true });

const Budget = mongoose.model('Budget', budgetSchema);
export default Budget;
