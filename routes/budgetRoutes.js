import express from 'express';
import {
    getBudgets,
    createBudget,
    updateBudget,
    deleteBudget,
    analyzeBudgets,
} from '../controllers/budgetController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// NOTE: /analyze must be registered BEFORE /:id
router.post('/analyze', analyzeBudgets);

router.get('/', getBudgets);
router.post('/', createBudget);
router.put('/:id', updateBudget);
router.delete('/:id', deleteBudget);

export default router;
