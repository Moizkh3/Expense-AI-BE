import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        categoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Category',
            default: null,
        },
        amount: {
            type: Number,
            required: [true, 'Amount is required'],
            min: [0.01, 'Amount must be positive'],
        },
        type: {
            type: String,
            enum: ['income', 'expense'],
            required: [true, 'Transaction type is required'],
        },
        description: {
            type: String,
            trim: true,
            default: null,
        },
        notes: {
            type: String,
            trim: true,
            default: null,
        },
        transactionDate: {
            type: Date,
            required: [true, 'Transaction date is required'],
        },
    },
    { timestamps: true }
);

// Index for common queries
transactionSchema.index({ userId: 1, transactionDate: -1 });
transactionSchema.index({ userId: 1, type: 1 });

const Transaction = mongoose.model('Transaction', transactionSchema);
export default Transaction;
