import express from 'express';
import {
    getNotifications,
    markAsRead,
    markAllAsRead,
} from '../controllers/notificationController.js';
import protect from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

// Put /read-all before /:id/read to avoid route parameter collision
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);
router.get('/', getNotifications);

export default router;
