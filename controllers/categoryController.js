import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';

// @desc    Get all categories for the logged-in user
// @route   GET /api/categories
// @access  Private
export const getCategories = async (req, res) => {
    try {
        const categories = await Category.find({ userId: req.user._id }).sort({ type: 1, name: 1 });

        const formatted = categories.map((c) => ({
            id: c._id,
            name: c.name,
            type: c.type,
            icon: c.icon,
            color: c.color,
            is_default: c.is_default,
        }));

        res.json(formatted);
    } catch (error) {
        console.error('getCategories error:', error);
        res.status(500).json({ message: 'Server error fetching categories' });
    }
};

// @desc    Create a custom category
// @route   POST /api/categories
// @access  Private
export const createCategory = async (req, res) => {
    try {
        const { name, type, icon, color } = req.body;

        if (!name || !type) {
            return res.status(400).json({ message: 'Name and type are required' });
        }

        const category = await Category.create({
            userId: req.user._id,
            name,
            type,
            icon: icon || 'tag',
            color: color || '#64748B',
            is_default: false,
        });

        res.status(201).json({
            id: category._id,
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
            is_default: category.is_default,
        });
    } catch (error) {
        console.error('createCategory error:', error);
        res.status(500).json({ message: 'Server error creating category' });
    }
};

// @desc    Update a category (name, icon, color only)
// @route   PUT /api/categories/:id
// @access  Private
export const updateCategory = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, userId: req.user._id });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        const { name, icon, color } = req.body;
        if (name !== undefined) category.name = name;
        if (icon !== undefined) category.icon = icon;
        if (color !== undefined) category.color = color;

        await category.save();

        res.json({
            id: category._id,
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
            is_default: category.is_default,
        });
    } catch (error) {
        console.error('updateCategory error:', error);
        res.status(500).json({ message: 'Server error updating category' });
    }
};

// @desc    Delete a category and nullify its transactions
// @route   DELETE /api/categories/:id
// @access  Private
export const deleteCategory = async (req, res) => {
    try {
        const category = await Category.findOne({ _id: req.params.id, userId: req.user._id });
        if (!category) {
            return res.status(404).json({ message: 'Category not found' });
        }

        // Nullify transactions that belonged to this category
        await Transaction.updateMany(
            { userId: req.user._id, categoryId: category._id },
            { $set: { categoryId: null } }
        );

        await category.deleteOne();

        res.json({ message: 'Category deleted' });
    } catch (error) {
        console.error('deleteCategory error:', error);
        res.status(500).json({ message: 'Server error deleting category' });
    }
};
