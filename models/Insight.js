import mongoose from 'mongoose';

const insightSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        insightType: {
            type: String,
            enum: ['monthly_summary', 'savings_tips', 'budget_alert'],
            required: true,
        },
        periodStart: {
            type: Date,
            default: null,
        },
        periodEnd: {
            type: Date,
            default: null,
        },
        contentJson: {
            type: mongoose.Schema.Types.Mixed,
            required: true,
        },
    },
    { timestamps: true }
);

// Index for fast retrieval by user and type
insightSchema.index({ userId: 1, createdAt: -1 });

const Insight = mongoose.model('Insight', insightSchema);
export default Insight;
