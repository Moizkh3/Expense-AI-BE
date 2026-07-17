import express from 'express';
import { getSummary, getMonthlyTrend, getCategoryBreakdown } from '../controllers/dashboardController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/summary', getSummary);
router.get('/monthly-trend', getMonthlyTrend);
router.get('/category-breakdown', getCategoryBreakdown);

export default router;
