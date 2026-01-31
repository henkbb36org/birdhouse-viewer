import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { 
  InsertUser, 
  users, 
  devices, 
  InsertDevice, 
  deviceSessions, 
  InsertDeviceSession,
  motionEvents,
  InsertMotionEvent,
  motionVideos,
  InsertMotionVideo
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Device management queries
export async function createDevice(device: InsertDevice) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(devices).values(device);
  return result;
}

export async function getUserDevices(userId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select().from(devices).where(eq(devices.userId, userId));
}

export async function getDeviceById(deviceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getDeviceByDeviceId(deviceId: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select().from(devices).where(eq(devices.deviceId, deviceId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateDeviceLastSeen(deviceId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(devices)
    .set({ lastSeen: new Date() })
    .where(eq(devices.id, deviceId));
}

export async function deleteDevice(deviceId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(devices).where(eq(devices.id, deviceId));
}

// Device session management
export async function createSession(session: InsertDeviceSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(deviceSessions).values(session);
  return result;
}

export async function getActiveSession(deviceId: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  
  const now = new Date();
  const result = await db.select()
    .from(deviceSessions)
    .where(
      eq(deviceSessions.deviceId, deviceId)
    )
    .limit(1);
  
  if (result.length === 0) return undefined;
  
  const session = result[0];
  if (session.expiresAt < now || session.isActive === 0) {
    return undefined;
  }
  
  return session;
}

export async function expireSession(sessionId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(deviceSessions)
    .set({ isActive: 0 })
    .where(eq(deviceSessions.id, sessionId));
}

// Motion event management
export async function createMotionEvent(event: InsertMotionEvent) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  const result = await db.insert(motionEvents).values(event);
  return result;
}

export async function getRecentMotionEvents(deviceId: number, limit: number = 10) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(motionEvents)
    .where(eq(motionEvents.deviceId, deviceId))
    .orderBy(desc(motionEvents.detectedAt))
    .limit(limit);
}

export async function markNotificationSent(eventId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.update(motionEvents)
    .set({ notificationSent: 1 })
    .where(eq(motionEvents.id, eventId));
}

// ============================================
// MOTION VIDEOS
// ============================================

export async function getMotionVideos(deviceId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select()
    .from(motionVideos)
    .where(eq(motionVideos.deviceId, deviceId))
    .orderBy(desc(motionVideos.capturedAt))
    .limit(limit);
}

export async function getAllMotionVideos(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  
  // Get all videos from user's devices
  return await db.select({
    id: motionVideos.id,
    deviceId: motionVideos.deviceId,
    deviceName: devices.name,
    filename: motionVideos.filename,
    filepath: motionVideos.filepath,
    duration: motionVideos.duration,
    filesize: motionVideos.filesize,
    capturedAt: motionVideos.capturedAt,
  })
    .from(motionVideos)
    .innerJoin(devices, eq(motionVideos.deviceId, devices.id))
    .where(eq(devices.userId, userId))
    .orderBy(desc(motionVideos.capturedAt))
    .limit(limit);
}

export async function getMotionVideoById(videoId: number) {
  const db = await getDb();
  if (!db) return null;
  
  const results = await db.select()
    .from(motionVideos)
    .where(eq(motionVideos.id, videoId))
    .limit(1);
  
  return results.length > 0 ? results[0] : null;
}

export async function deleteMotionVideo(videoId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(motionVideos)
    .where(eq(motionVideos.id, videoId));
}
