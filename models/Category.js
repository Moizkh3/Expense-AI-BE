import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        name: {
            type: String,
            required: [true, 'Category name is required'],
            trim: true,
        },
        type: {
            type: String,
            enum: ['income', 'expense'],
            required: [true, 'Category type is required'],
        },
        icon: {
            type: String,
            required: true,
            default: 'tag',
        },
        color: {
            type: String,
            required: true,
            default: '#64748B',
        },
        is_default: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const Category = mongoose.model('Category', categorySchema);
export default Category;
