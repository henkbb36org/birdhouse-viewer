import { eq, desc, or, and, inArray } from "drizzle-orm";
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
  InsertMotionVideo,
  deviceShares,
  InsertDeviceShare
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
  
  // Get devices owned by user
  const ownedDevices = await db.select().from(devices).where(eq(devices.ownerId, userId));
  
  // Get devices shared with user
  const sharedDeviceIds = await db.select({ deviceId: deviceShares.deviceId })
    .from(deviceShares)
    .where(eq(deviceShares.userId, userId));
  
  if (sharedDeviceIds.length === 0) {
    return ownedDevices;
  }
  
  const sharedDevices = await db.select()
    .from(devices)
    .where(inArray(devices.id, sharedDeviceIds.map(s => s.deviceId)));
  
  // Combine and deduplicate
  const allDevices = [...ownedDevices, ...sharedDevices];
  const uniqueDevices = Array.from(new Map(allDevices.map(d => [d.id, d])).values());
  
  return uniqueDevices;
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
  
  // Get device IDs that user has access to (owned or shared)
  const userDevices = await getUserDevices(userId);
  const deviceIds = userDevices.map(d => d.id);
  
  if (deviceIds.length === 0) return [];
  
  // Get all videos from accessible devices
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
    .where(inArray(devices.id, deviceIds))
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

// ============================================
// DEVICE SHARING
// ============================================

export async function shareDevice(deviceId: number, userId: number, sharedBy: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  
  // Check if already shared
  const existing = await db.select()
    .from(deviceShares)
    .where(and(
      eq(deviceShares.deviceId, deviceId),
      eq(deviceShares.userId, userId)
    ))
    .limit(1);
  
  if (existing.length > 0) {
    throw new Error("Device already shared with this user");
  }
  
  const share: InsertDeviceShare = {
    deviceId,
    userId,
    role: "viewer",
    sharedBy,
    sharedAt: new Date(),
  };
  
  await db.insert(deviceShares).values(share);
}

export async function unshareDevice(deviceId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  
  await db.delete(deviceShares)
    .where(and(
      eq(deviceShares.deviceId, deviceId),
      eq(deviceShares.userId, userId)
    ));
}

export async function getDeviceShares(deviceId: number) {
  const db = await getDb();
  if (!db) return [];
  
  return await db.select({
    id: deviceShares.id,
    userId: deviceShares.userId,
    userName: users.name,
    userEmail: users.email,
    role: deviceShares.role,
    sharedAt: deviceShares.sharedAt,
  })
    .from(deviceShares)
    .innerJoin(users, eq(deviceShares.userId, users.id))
    .where(eq(deviceShares.deviceId, deviceId));
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  
  const result = await db.select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  
  return result.length > 0 ? result[0] : undefined;
}

export async function canUserAccessDevice(userId: number, deviceId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  // Check if user owns the device
  const device = await db.select()
    .from(devices)
    .where(and(
      eq(devices.id, deviceId),
      eq(devices.ownerId, userId)
    ))
    .limit(1);
  
  if (device.length > 0) return true;
  
  // Check if device is shared with user
  const share = await db.select()
    .from(deviceShares)
    .where(and(
      eq(deviceShares.deviceId, deviceId),
      eq(deviceShares.userId, userId)
    ))
    .limit(1);
  
  return share.length > 0;
}

export async function isDeviceOwner(userId: number, deviceId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  
  const device = await db.select()
    .from(devices)
    .where(and(
      eq(devices.id, deviceId),
      eq(devices.ownerId, userId)
    ))
    .limit(1);
  
  return device.length > 0;
}

export async function getUsersWithAccessToDevice(deviceId: number) {
  const db = await getDb();
  if (!db) return [];
  console.log(`[DEBUG] Getting users for deviceId: ${deviceId}`);
  // Get owner
  const device = await getDeviceById(deviceId);
  if (!device) return [];
  console.log(`[DEBUG] Device ${deviceId} not found`);  
  const ownerIds = [device.ownerId];
  
  // Get shared users
  const shares = await db.select({ userId: deviceShares.userId })
    .from(deviceShares)
    .where(eq(deviceShares.deviceId, deviceId));
  console.log(`[DEBUG] Found ${shares.length} shares:`, shares);
  const sharedUserIds = shares.map(s => s.userId);
  
  // Combine and deduplicate
  const allUserIds = Array.from(new Set([...ownerIds, ...sharedUserIds]));
  console.log(`[DEBUG] Total users with access: ${allUserIds.length}`, allUserIds);
  return allUserIds;
}
