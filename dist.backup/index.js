// server/_core/index-google.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import session from "express-session";
import passport3 from "passport";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/_core/notification.ts
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z2 } from "zod";

// server/db.ts
import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";
var users = mysqlTable("users", {
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
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
});
var devices = mysqlTable("devices", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceId: varchar("deviceId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  isActive: int("isActive").default(1).notNull(),
  lastSeen: timestamp("lastSeen"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var deviceSessions = mysqlTable("deviceSessions", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => devices.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  isActive: int("isActive").default(1).notNull()
});
var motionEvents = mysqlTable("motionEvents", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId").notNull().references(() => devices.id, { onDelete: "cascade" }),
  detectedAt: timestamp("detectedAt").defaultNow().notNull(),
  notificationSent: int("notificationSent").default(0).notNull()
});
var pushSubscriptions = mysqlTable("pushSubscriptions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["name", "email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function createDevice(device) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(devices).values(device);
  return result;
}
async function getUserDevices(userId) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(devices).where(eq(devices.userId, userId));
}
async function getDeviceById(deviceId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(devices).where(eq(devices.id, deviceId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getDeviceByDeviceId(deviceId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(devices).where(eq(devices.deviceId, deviceId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function deleteDevice(deviceId) {
  const db = await getDb();
  if (!db) return;
  await db.delete(devices).where(eq(devices.id, deviceId));
}
async function createSession(session2) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(deviceSessions).values(session2);
  return result;
}
async function getActiveSession(deviceId, userId) {
  const db = await getDb();
  if (!db) return void 0;
  const now = /* @__PURE__ */ new Date();
  const result = await db.select().from(deviceSessions).where(
    eq(deviceSessions.deviceId, deviceId)
  ).limit(1);
  if (result.length === 0) return void 0;
  const session2 = result[0];
  if (session2.expiresAt < now || session2.isActive === 0) {
    return void 0;
  }
  return session2;
}
async function expireSession(sessionId) {
  const db = await getDb();
  if (!db) return;
  await db.update(deviceSessions).set({ isActive: 0 }).where(eq(deviceSessions.id, sessionId));
}
async function getRecentMotionEvents(deviceId, limit = 10) {
  const db = await getDb();
  if (!db) return [];
  return await db.select().from(motionEvents).where(eq(motionEvents.deviceId, deviceId)).orderBy(desc(motionEvents.detectedAt)).limit(limit);
}

// server/notifications.ts
import webpush from "web-push";
import { eq as eq2 } from "drizzle-orm";
var VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
var VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
var VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn("[Notifications] VAPID keys not configured");
}
async function sendPushNotificationToUser(userId, payload) {
  const db = await getDb();
  if (!db) {
    console.error("[Notifications] Database not available");
    return { success: false, sent: 0, failed: 0 };
  }
  try {
    const subscriptions = await db.select().from(pushSubscriptions).where(eq2(pushSubscriptions.userId, userId));
    if (subscriptions.length === 0) {
      console.warn(`[Notifications] No subscriptions found for user ${userId}`);
      return { success: true, sent: 0, failed: 0 };
    }
    console.log(`[Notifications] Sending to ${subscriptions.length} subscription(s) for user ${userId}`);
    let sent = 0;
    let failed = 0;
    const failedSubscriptionIds = [];
    for (const sub of subscriptions) {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };
        await webpush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );
        sent++;
        console.log(`[Notifications] Sent to subscription ${sub.id}`);
      } catch (error) {
        failed++;
        console.error(`[Notifications] Failed to send to subscription ${sub.id}:`, error.message);
        if (error.statusCode === 410 || error.statusCode === 404) {
          failedSubscriptionIds.push(sub.id);
        }
      }
    }
    if (failedSubscriptionIds.length > 0) {
      for (const id of failedSubscriptionIds) {
        await db.delete(pushSubscriptions).where(eq2(pushSubscriptions.id, id));
      }
      console.log(`[Notifications] Removed ${failedSubscriptionIds.length} invalid subscription(s)`);
    }
    return { success: sent > 0, sent, failed };
  } catch (error) {
    console.error("[Notifications] Error sending push notifications:", error);
    return { success: false, sent: 0, failed: 0 };
  }
}
async function savePushSubscription(userId, subscription) {
  const db = await getDb();
  if (!db) {
    console.error("[Notifications] Database not available");
    return false;
  }
  try {
    const existing = await db.select().from(pushSubscriptions).where(eq2(pushSubscriptions.endpoint, subscription.endpoint)).limit(1);
    if (existing.length > 0) {
      await db.update(pushSubscriptions).set({
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq2(pushSubscriptions.endpoint, subscription.endpoint));
      console.log(`[Notifications] Updated existing subscription for user ${userId}`);
    } else {
      await db.insert(pushSubscriptions).values({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      });
      console.log(`[Notifications] Saved new subscription for user ${userId}`);
    }
    return true;
  } catch (error) {
    console.error("[Notifications] Error saving subscription:", error);
    return false;
  }
}
async function removePushSubscription(endpoint) {
  const db = await getDb();
  if (!db) {
    console.error("[Notifications] Database not available");
    return false;
  }
  try {
    await db.delete(pushSubscriptions).where(eq2(pushSubscriptions.endpoint, endpoint));
    console.log(`[Notifications] Removed subscription: ${endpoint}`);
    return true;
  } catch (error) {
    console.error("[Notifications] Error removing subscription:", error);
    return false;
  }
}
function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY;
}

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  devices: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await getUserDevices(ctx.user.id);
    }),
    create: protectedProcedure.input(z2.object({
      deviceId: z2.string().min(1).max(64),
      name: z2.string().min(1).max(255),
      description: z2.string().optional()
    })).mutation(async ({ ctx, input }) => {
      const existing = await getDeviceByDeviceId(input.deviceId);
      if (existing) {
        throw new Error("Device ID already registered");
      }
      await createDevice({
        userId: ctx.user.id,
        deviceId: input.deviceId,
        name: input.name,
        description: input.description
      });
      return { success: true };
    }),
    delete: protectedProcedure.input(z2.object({ id: z2.number() })).mutation(async ({ ctx, input }) => {
      const device = await getDeviceById(input.id);
      if (!device || device.userId !== ctx.user.id) {
        throw new Error("Device not found or unauthorized");
      }
      await deleteDevice(input.id);
      return { success: true };
    }),
    startStream: protectedProcedure.input(z2.object({ deviceId: z2.number() })).mutation(async ({ ctx, input }) => {
      const device = await getDeviceById(input.deviceId);
      if (!device || device.userId !== ctx.user.id) {
        throw new Error("Device not found or unauthorized");
      }
      const existingSession = await getActiveSession(input.deviceId, ctx.user.id);
      if (existingSession) {
        return {
          success: true,
          sessionId: existingSession.id,
          expiresAt: existingSession.expiresAt
        };
      }
      const expiresAt = new Date(Date.now() + 6e4);
      const result = await createSession({
        deviceId: input.deviceId,
        userId: ctx.user.id,
        expiresAt
      });
      return {
        success: true,
        sessionId: result[0].insertId,
        expiresAt
      };
    }),
    stopStream: protectedProcedure.input(z2.object({ sessionId: z2.number() })).mutation(async ({ input }) => {
      await expireSession(input.sessionId);
      return { success: true };
    })
  }),
  motion: router({
    getRecent: protectedProcedure.input(z2.object({ deviceId: z2.number(), limit: z2.number().optional() })).query(async ({ ctx, input }) => {
      const device = await getDeviceById(input.deviceId);
      if (!device || device.userId !== ctx.user.id) {
        throw new Error("Device not found or unauthorized");
      }
      return await getRecentMotionEvents(input.deviceId, input.limit);
    })
  }),
  notifications: router({
    // Get VAPID public key for Web Push
    getPublicKey: publicProcedure.query(() => {
      return { publicKey: getVapidPublicKey() };
    }),
    // Subscribe to push notifications
    subscribe: protectedProcedure.input(z2.object({
      endpoint: z2.string(),
      keys: z2.object({
        p256dh: z2.string(),
        auth: z2.string()
      })
    })).mutation(async ({ ctx, input }) => {
      const success = await savePushSubscription(ctx.user.id, input);
      return { success };
    }),
    // Unsubscribe from push notifications
    unsubscribe: protectedProcedure.input(z2.object({ endpoint: z2.string() })).mutation(async ({ input }) => {
      const success = await removePushSubscription(input.endpoint);
      return { success };
    })
  })
});

// server/_core/vite.ts
import express from "express";
import fs from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/google-oauth.ts
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
var GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
var GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
var GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:3000/auth/google/callback";
function configureGoogleOAuth() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn("[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET");
    console.warn("[Google OAuth] Authentication will not work until these are configured");
    return;
  }
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ["profile", "email"]
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const openId = `google:${profile.id}`;
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : void 0;
          const name = profile.displayName || profile.username || "Unknown User";
          await upsertUser({
            openId,
            name,
            email,
            loginMethod: "google",
            lastSignedIn: /* @__PURE__ */ new Date()
          });
          const user = await getUserByOpenId(openId);
          if (!user) {
            return done(new Error("Failed to create or retrieve user"));
          }
          return done(null, user);
        } catch (error) {
          console.error("[Google OAuth] Error during authentication:", error);
          return done(error);
        }
      }
    )
  );
  passport.serializeUser((user, done) => {
    done(null, user.openId);
  });
  passport.deserializeUser(async (openId, done) => {
    try {
      const user = await getUserByOpenId(openId);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });
  console.log("[Google OAuth] Configured successfully");
}
function isGoogleOAuthConfigured() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

// server/google-oauth-routes.ts
import passport2 from "passport";
function registerGoogleOAuthRoutes(app) {
  app.get("/auth/google", passport2.authenticate("google", {
    scope: ["profile", "email"]
  }));
  app.get(
    "/auth/google/callback",
    passport2.authenticate("google", { failureRedirect: "/login-failed" }),
    (req, res) => {
      res.redirect("/");
    }
  );
  app.get("/login-failed", (req, res) => {
    res.status(401).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Login Failed</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: #f5f5f5;
          }
          .container {
            text-align: center;
            padding: 2rem;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            max-width: 400px;
          }
          h1 { color: #d32f2f; margin-bottom: 1rem; }
          p { color: #666; margin-bottom: 1.5rem; }
          a {
            display: inline-block;
            padding: 0.75rem 1.5rem;
            background: #1976d2;
            color: white;
            text-decoration: none;
            border-radius: 4px;
          }
          a:hover { background: #1565c0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Login Failed</h1>
          <p>We couldn't log you in with Google. Please try again.</p>
          <a href="/">Return to Home</a>
        </div>
      </body>
      </html>
    `);
  });
  app.get("/auth/logout", (req, res) => {
    req.logout((err) => {
      if (err) {
        console.error("[Google OAuth] Logout error:", err);
      }
      res.redirect("/");
    });
  });
  console.log("[Google OAuth] Routes registered");
}

// server/_core/context-google.ts
async function createContextWithPassport(opts) {
  const user = opts.req.user;
  return {
    req: opts.req,
    res: opts.res,
    user: user || null
  };
}

// server/notificationApi.ts
import { Router } from "express";
var router2 = Router();
router2.post("/notify", async (req, res) => {
  try {
    const { userId, title, body, data } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: userId, title, body"
      });
    }
    const apiKey = req.headers.authorization?.replace("Bearer ", "");
    const expectedApiKey = process.env.NOTIFICATION_API_KEY;
    if (expectedApiKey && expectedApiKey !== "your-api-key-here") {
      if (!apiKey || apiKey !== expectedApiKey) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized"
        });
      }
    }
    const result = await sendPushNotificationToUser(userId, {
      title,
      body,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      data: data || {}
    });
    return res.status(200).json({
      success: result.success,
      sent: result.sent,
      failed: result.failed
    });
  } catch (error) {
    console.error("[Notification API] Error:", error);
    return res.status(500).json({
      success: false,
      error: error.message || "Internal server error"
    });
  }
});
var notificationApi_default = router2;

// server/_core/index-google.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  const SESSION_SECRET = process.env.JWT_SECRET || "your-secret-key-change-this";
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false,
        // Set to true when using HTTPS
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1e3,
        // 24 hours
        sameSite: "lax"
        // Helps with OAuth redirects
      }
    })
  );
  app.use(passport3.initialize());
  app.use(passport3.session());
  configureGoogleOAuth();
  if (!isGoogleOAuthConfigured()) {
    console.log("\n" + "=".repeat(70));
    console.log("\u26A0\uFE0F  WARNING: Google OAuth NOT configured");
    console.log("=".repeat(70));
    console.log("Please set the following environment variables:");
    console.log("  - GOOGLE_CLIENT_ID");
    console.log("  - GOOGLE_CLIENT_SECRET");
    console.log("  - GOOGLE_CALLBACK_URL");
    console.log("See deployment/GOOGLE_OAUTH.md for setup instructions");
    console.log("=".repeat(70) + "\n");
  } else {
    console.log("\n" + "=".repeat(70));
    console.log("\u2713 Google OAuth configured successfully");
    console.log("=".repeat(70) + "\n");
  }
  registerGoogleOAuthRoutes(app);
  app.use("/api", notificationApi_default);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext: createContextWithPassport
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
