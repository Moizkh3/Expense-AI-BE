import express from 'express';
import {
    getTransactions,
    getTransactionById,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    analyzeTransactions,
} from '../controllers/transactionController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// NOTE: /analyze must be registered BEFORE /:id to avoid route conflict
router.post('/analyze', analyzeTransactions);

router.get('/', getTransactions);
router.post('/', createTransaction);
router.get('/:id', getTransactionById);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

export default router;
