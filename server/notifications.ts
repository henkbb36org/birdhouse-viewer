import webpush from 'web-push';
import { eq } from 'drizzle-orm';
import { getDb } from './db';
import { pushSubscriptions } from '../drizzle/schema';

// Configure web-push with VAPID keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn('[Notifications] VAPID keys not configured');
}

export interface PushNotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: Record<string, any>;
}

/**
 * Send push notification to a specific user
 */
export async function sendPushNotificationToUser(
  userId: number,
  payload: PushNotificationPayload
): Promise<{ success: boolean; sent: number; failed: number }> {
  const db = await getDb();
  if (!db) {
    console.error('[Notifications] Database not available');
    return { success: false, sent: 0, failed: 0 };
  }

  try {
    // Get all push subscriptions for this user
    const subscriptions = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));

    if (subscriptions.length === 0) {
      console.warn(`[Notifications] No subscriptions found for user ${userId}`);
      return { success: true, sent: 0, failed: 0 };
    }

    console.log(`[Notifications] Sending to ${subscriptions.length} subscription(s) for user ${userId}`);

    let sent = 0;
    let failed = 0;
    const failedSubscriptionIds: number[] = [];

    // Send to all subscriptions
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );

        sent++;
        console.log(`[Notifications] Sent to subscription ${sub.id}`);
      } catch (error: any) {
        failed++;
        console.error(`[Notifications] Failed to send to subscription ${sub.id}:`, error.message);

        // If subscription is invalid (410 Gone or 404 Not Found), mark for deletion
        if (error.statusCode === 410 || error.statusCode === 404) {
          failedSubscriptionIds.push(sub.id);
        }
      }
    }

    // Clean up invalid subscriptions
    if (failedSubscriptionIds.length > 0) {
      for (const id of failedSubscriptionIds) {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
      }
      console.log(`[Notifications] Removed ${failedSubscriptionIds.length} invalid subscription(s)`);
    }

    return { success: sent > 0, sent, failed };
  } catch (error) {
    console.error('[Notifications] Error sending push notifications:', error);
    return { success: false, sent: 0, failed: 0 };
  }
}

/**
 * Save a push subscription for a user
 */
export async function savePushSubscription(
  userId: number,
  subscription: {
    endpoint: string;
    keys: {
      p256dh: string;
      auth: string;
    };
  }
): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.error('[Notifications] Database not available');
    return false;
  }

  try {
    // Check if subscription already exists
    const existing = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
      .limit(1);

    if (existing.length > 0) {
      // Update existing subscription
      await db
        .update(pushSubscriptions)
        .set({
          userId,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          updatedAt: new Date(),
        })
        .where(eq(pushSubscriptions.endpoint, subscription.endpoint));

      console.log(`[Notifications] Updated existing subscription for user ${userId}`);
    } else {
      // Insert new subscription
      await db.insert(pushSubscriptions).values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      });

      console.log(`[Notifications] Saved new subscription for user ${userId}`);
    }

    return true;
  } catch (error) {
    console.error('[Notifications] Error saving subscription:', error);
    return false;
  }
}

/**
 * Remove a push subscription
 */
export async function removePushSubscription(endpoint: string): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.error('[Notifications] Database not available');
    return false;
  }

  try {
    await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
    console.log(`[Notifications] Removed subscription: ${endpoint}`);
    return true;
  } catch (error) {
    console.error('[Notifications] Error removing subscription:', error);
    return false;
  }
}

/**
 * Get VAPID public key for client
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

/**
 * Send push notification to all users who have access to a device (owner + shared users)
 */
export async function sendPushNotificationForDevice(
  deviceId: number,
  payload: PushNotificationPayload
): Promise<{ success: boolean; totalSent: number; totalFailed: number }> {
  // Import here to avoid circular dependency
  const { getUsersWithAccessToDevice } = await import('./db');
  
  try {
    // Get all users with access to this device
    const userIds = await getUsersWithAccessToDevice(deviceId);
    
    if (userIds.length === 0) {
      console.warn(`[Notifications] No users have access to device ${deviceId}`);
      return { success: true, totalSent: 0, totalFailed: 0 };
    }
    
    console.log(`[Notifications] Sending notification for device ${deviceId} to ${userIds.length} user(s)`);
    
    let totalSent = 0;
    let totalFailed = 0;
    
    // Send notification to each user
    for (const userId of userIds) {
      const result = await sendPushNotificationToUser(userId, payload);
      totalSent += result.sent;
      totalFailed += result.failed;
    }
    
    return {
      success: totalSent > 0,
      totalSent,
      totalFailed,
    };
  } catch (error) {
    console.error('[Notifications] Error sending device notifications:', error);
    return { success: false, totalSent: 0, totalFailed: 0 };
  }
}
