import { Router } from 'express';
import { sendPushNotificationToUser } from './notifications';

const router = Router();

/**
 * POST /api/notify
 * Send push notification to a user
 * Called by the Python motion detection handler
 */
router.post('/notify', async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;

    // Validate request
    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, title, body',
      });
    }

    // Optional: Check API key if configured
    const apiKey = req.headers.authorization?.replace('Bearer ', '');
    const expectedApiKey = process.env.NOTIFICATION_API_KEY;
    
    if (expectedApiKey && expectedApiKey !== 'your-api-key-here') {
      if (!apiKey || apiKey !== expectedApiKey) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }
    }

    // Send notification
    const result = await sendPushNotificationToUser(userId, {
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: data || {},
    });

    return res.status(200).json({
      success: result.success,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error: any) {
    console.error('[Notification API] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
});

export default router;
