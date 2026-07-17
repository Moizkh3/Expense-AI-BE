import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Category from '../models/Category.js';

// Default categories cloned for every new user
const DEFAULT_CATEGORIES = [
    // Income
    { name: 'Salary',        type: 'income',  icon: 'briefcase',      color: '#10B981', is_default: true },
    { name: 'Freelance',     type: 'income',  icon: 'laptop',         color: '#22C55E', is_default: true },
    { name: 'Investments',   type: 'income',  icon: 'trending-up',    color: '#14B8A6', is_default: true },
    { name: 'Gifts',         type: 'income',  icon: 'gift',           color: '#06B6D4', is_default: true },
    { name: 'Other Income',  type: 'income',  icon: 'plus-circle',    color: '#0EA5E9', is_default: true },
    // Expense
    { name: 'Food & Dining',   type: 'expense', icon: 'utensils',       color: '#F59E0B', is_default: true },
    { name: 'Groceries',       type: 'expense', icon: 'shopping-cart',  color: '#EAB308', is_default: true },
    { name: 'Transportation',  type: 'expense', icon: 'car',            color: '#EF4444', is_default: true },
    { name: 'Rent',            type: 'expense', icon: 'home',           color: '#F43F5E', is_default: true },
    { name: 'Utilities',       type: 'expense', icon: 'zap',            color: '#EC4899', is_default: true },
    { name: 'Entertainment',   type: 'expense', icon: 'film',           color: '#A855F7', is_default: true },
    { name: 'Shopping',        type: 'expense', icon: 'shopping-bag',   color: '#8B5CF6', is_default: true },
    { name: 'Healthcare',      type: 'expense', icon: 'heart',          color: '#3B82F6', is_default: true },
    { name: 'Education',       type: 'expense', icon: 'book-open',      color: '#6366F1', is_default: true },
    { name: 'Travel',          type: 'expense', icon: 'plane',          color: '#F97316', is_default: true },
    { name: 'Personal Care',   type: 'expense', icon: 'sparkles',       color: '#D946EF', is_default: true },
    { name: 'Other Expense',   type: 'expense', icon: 'more-horizontal',color: '#64748B', is_default: true },
];

const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
export const register = async (req, res) => {
    try {
        const { name, email, password, currency } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Please provide name, email, and password' });
        }

        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'User with that email already exists' });
        }

        const user = await User.create({ name, email, password, currency: currency || 'USD' });

        // Clone the default categories for the new user
        const categoryDocs = DEFAULT_CATEGORIES.map((cat) => ({
            ...cat,
            userId: user._id,
        }));
        await Category.insertMany(categoryDocs);

        const token = generateToken(user._id);

        res.status(201).json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                currency: user.currency,
            },
            token,
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ message: 'Server error during registration' });
    }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Please provide email and password' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const token = generateToken(user._id);

        res.json({
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                currency: user.currency,
            },
            token,
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Server error during login' });
    }
};

// @desc    Get current logged-in user
// @route   GET /api/auth/me
// @access  Private
export const getMe = async (req, res) => {
    try {
        const user = req.user;
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            currency: user.currency,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};
