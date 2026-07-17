import Notification from '../models/Notification.js';

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);

        const formatted = notifications.map((n) => ({
            id: n._id,
            title: n.title,
            message: n.message,
            type: n.type,
            read: n.read,
            created_at: n.createdAt,
        }));

        res.json(formatted);
    } catch (error) {
        console.error('getNotifications error:', error);
        res.status(500).json({ message: 'Server error fetching notifications' });
    }
};

// @desc    Mark a notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
export const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOne({
            _id: req.params.id,
            userId: req.user._id,
        });

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        notification.read = true;
        await notification.save();

        res.json({
            id: notification._id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            read: notification.read,
            created_at: notification.createdAt,
        });
    } catch (error) {
        console.error('markAsRead error:', error);
        res.status(500).json({ message: 'Server error marking notification as read' });
    }
};

// @desc    Mark all user notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
export const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: req.user._id, read: false },
            { $set: { read: true } }
        );

        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        console.error('markAllAsRead error:', error);
        res.status(500).json({ message: 'Server error marking all as read' });
    }
};
