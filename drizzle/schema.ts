import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Devices table - stores ESP32-CAM device registrations
 */
export const devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: varchar("deviceId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: int("isActive").default(1).notNull(),
  lastSeen: timestamp("lastSeen"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Device = typeof devices.$inferSelect;
export type InsertDevice = typeof devices.$inferInsert;

/**
 * Device sessions table - tracks active streaming sessions
 */
export const deviceSessions = mysqlTable("deviceSessions", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => devices.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isActive: int("isActive").default(1).notNull(),
});

export type DeviceSession = typeof deviceSessions.$inferSelect;
export type InsertDeviceSession = typeof deviceSessions.$inferInsert;

/**
 * Motion events table - stores motion detection history
 */
export const motionEvents = mysqlTable("motionEvents", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => devices.id, { onDelete: "cascade" }),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  notificationSent: int("notificationSent").default(0).notNull(),
});

export type MotionEvent = typeof motionEvents.$inferSelect;
export type InsertMotionEvent = typeof motionEvents.$inferInsert;

/**
 * Push subscriptions table - stores Web Push notification subscriptions
 */
export const pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type InsertPushSubscription = typeof pushSubscriptions.$inferInsert;

/**
 * Motion videos table - stores 5-second video clips captured on motion detection
 */
export const motionVideos = mysqlTable("motionVideos", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => devices.id, { onDelete: "cascade" }),
  motionEventId: int("motionEventId").references(() => motionEvents.id, { onDelete: "set null" }),
  filename: varchar("filename", { length: 255 }).notNull().unique(),
  filepath: varchar("filepath", { length: 512 }).notNull(),
  duration: int("duration").default(5).notNull(), // Duration in seconds
  filesize: int("filesize").notNull(), // File size in bytes
  capturedAt: timestamp("capturedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MotionVideo = typeof motionVideos.$inferSelect;
export type InsertMotionVideo = typeof motionVideos.$inferInsert;

/**
 * Device shares table - tracks which users have access to which devices
 * Implements many-to-many relationship between users and devices
 */
export const deviceShares = mysqlTable("deviceShares", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => devices.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["owner", "viewer"]).default("viewer").notNull(),
  sharedBy: int("sharedBy").notNull().references(() => users.id, { onDelete: "cascade" }),
  sharedAt: timestamp("sharedAt").defaultNow().notNull(),
});

export type DeviceShare = typeof deviceShares.$inferSelect;
export type InsertDeviceShare = typeof deviceShares.$inferInsert;
