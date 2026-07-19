import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import connectDB from './config/db.js';
import initGemini from './config/gemini.js';
import authRoutes from './routes/authRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import transactionRoutes from './routes/transactionRoutes.js';
import budgetRoutes from './routes/budgetRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import insightRoutes from './routes/insightRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
app.use(
    cors({
        origin: true, // mirrors request origin — safe with JWT Bearer token auth
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: true,
        optionsSuccessStatus: 204,
    })
);
// Handle OPTIONS preflight before any route
app.options('*', cors());
app.use(express.json());

// ── DB connection — lazy singleton for Vercel cold starts ─────────────────────
let dbPromise = null;
const ensureDB = () => {
    if (!dbPromise) {
        dbPromise = connectDB().catch((err) => {
            // Reset so next request retries
            dbPromise = null;
            throw err;
        });
    }
    return dbPromise;
};

// Initialize Gemini once
initGemini();

// ── DB middleware — waits for connection on every cold start ──────────────────
app.use(async (req, res, next) => {
    try {
        await ensureDB();
        next();
    } catch (err) {
        console.error('❌ DB connection failed:', err.message);
        res.status(503).json({ message: 'Database unavailable, please retry' });
    }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/insights', insightRoutes);
app.use('/api/notifications', notificationRoutes);

// Root
app.get('/', (req, res) => {
    res.json({ message: 'ExpenseAI API is running 🚀' });
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err.message);
    const status = err.status || err.statusCode || 500;
    res.status(status).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

// ── Local dev server (Vercel ignores this) ────────────────────────────────────
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 8000;
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
}

export default app;
