import { Router } from 'express';
import { sendPushNotificationToUser, sendPushNotificationForDevice } from './notifications';

const router = Router();

/**
 * POST /api/notify
 * Send push notification to user(s)
 * Called by the Python motion detection handler
 * 
 * Supports two modes:
 * 1. userId: Send to specific user (legacy)
 * 2. deviceId: Send to all users with access to device (owner + shared users)
 */
router.post('/notify', async (req, res) => {
  try {
    const { userId, deviceId, title, body, data } = req.body;

    // Validate request - need either userId or deviceId
    if ((!userId && !deviceId) || !title || !body) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: (userId OR deviceId), title, body',
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

    const payload = {
      title,
      body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      data: data || {},
    };

    let result;
    
    // If deviceId is provided, send to all users with access to the device
    if (deviceId) {
      result = await sendPushNotificationForDevice(deviceId, payload);
      return res.status(200).json({
        success: result.success,
        totalSent: result.totalSent,
        totalFailed: result.totalFailed,
      });
    }
    
    // Otherwise, send to specific user (legacy mode)
    result = await sendPushNotificationToUser(userId, payload);
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
