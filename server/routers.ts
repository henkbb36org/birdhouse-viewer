import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { z } from "zod";
import * as db from "./db";
import { savePushSubscription, removePushSubscription, getVapidPublicKey } from "./notifications";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  devices: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserDevices(ctx.user.id);
    }),
    
    create: protectedProcedure
      .input(z.object({
        deviceId: z.string().min(1).max(64),
        name: z.string().min(1).max(255),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check if device already exists
        const existing = await db.getDeviceByDeviceId(input.deviceId);
        if (existing) {
          throw new Error("Device ID already registered");
        }
        
        await db.createDevice({
          ownerId: ctx.user.id,
          deviceId: input.deviceId,
          name: input.name,
          description: input.description,
        });
        
        return { success: true };
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Only owner can delete device
        const isOwner = await db.isDeviceOwner(ctx.user.id, input.id);
        if (!isOwner) {
          throw new Error("Only device owner can delete device");
        }
        
        await db.deleteDevice(input.id);
        return { success: true };
      }),
    
    startStream: protectedProcedure
      .input(z.object({ deviceId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        // Check if user has access (owner or shared)
        const hasAccess = await db.canUserAccessDevice(ctx.user.id, input.deviceId);
        if (!hasAccess) {
          throw new Error("Device not found or unauthorized");
        }
        
        // Check if there's already an active session
        const existingSession = await db.getActiveSession(input.deviceId, ctx.user.id);
        if (existingSession) {
          return { 
            success: true, 
            sessionId: existingSession.id,
            expiresAt: existingSession.expiresAt 
          };
        }
        
        // Create new session (60 seconds)
        const expiresAt = new Date(Date.now() + 60000);
        const result = await db.createSession({
          deviceId: input.deviceId,
          userId: ctx.user.id,
          expiresAt,
        });
        
        return { 
          success: true, 
          sessionId: result[0].insertId,
          expiresAt 
        };
      }),
    
    stopStream: protectedProcedure
      .input(z.object({ sessionId: z.number() }))
      .mutation(async ({ input }) => {
        await db.expireSession(input.sessionId);
        return { success: true };
      }),
  }),
  
  motion: router({
    getRecent: protectedProcedure
      .input(z.object({ deviceId: z.number(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        // Check if user has access (owner or shared)
        const hasAccess = await db.canUserAccessDevice(ctx.user.id, input.deviceId);
        if (!hasAccess) {
          throw new Error("Device not found or unauthorized");
        }
        
        return await db.getRecentMotionEvents(input.deviceId, input.limit);
      }),
  }),

  videos: router({
    // Get all videos for current user
    list: protectedProcedure
      .input(z.object({ limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        return await db.getAllMotionVideos(ctx.user.id, input.limit);
      }),
    
    // Get videos for specific device
    byDevice: protectedProcedure
      .input(z.object({ deviceId: z.number(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        // Check if user has access (owner or shared)
        const hasAccess = await db.canUserAccessDevice(ctx.user.id, input.deviceId);
        if (!hasAccess) {
          throw new Error("Device not found or unauthorized");
        }
        
        return await db.getMotionVideos(input.deviceId, input.limit);
      }),
    
    // Get video metadata by ID
    getById: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .query(async ({ ctx, input }) => {
        const video = await db.getMotionVideoById(input.videoId);
        if (!video) {
          throw new Error("Video not found");
        }
        
        // Verify user has access to the device
        const hasAccess = await db.canUserAccessDevice(ctx.user.id, video.deviceId);
        if (!hasAccess) {
          throw new Error("Unauthorized");
        }
        
        return video;
      }),
    
    // Delete video
    delete: protectedProcedure
      .input(z.object({ videoId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const video = await db.getMotionVideoById(input.videoId);
        if (!video) {
          throw new Error("Video not found");
        }
        
        // Verify user has access to the device
        const hasAccess = await db.canUserAccessDevice(ctx.user.id, video.deviceId);
        if (!hasAccess) {
          throw new Error("Unauthorized");
        }
        
        // Delete file
        const fs = await import('fs/promises');
        try {
          await fs.unlink(video.filepath);
        } catch (error) {
          console.error('Error deleting video file:', error);
        }
        
        // Delete database record
        await db.deleteMotionVideo(input.videoId);
        
        return { success: true };
      }),
  }),

  notifications: router({
    // Get VAPID public key for Web Push
    getPublicKey: publicProcedure.query(() => {
      return { publicKey: getVapidPublicKey() };
    }),

    // Subscribe to push notifications
    subscribe: protectedProcedure
      .input(z.object({
        endpoint: z.string(),
        keys: z.object({
          p256dh: z.string(),
          auth: z.string(),
        }),
      }))
      .mutation(async ({ ctx, input }) => {
        const success = await savePushSubscription(ctx.user.id, input);
        return { success };
      }),

    // Unsubscribe from push notifications
    unsubscribe: protectedProcedure
      .input(z.object({ endpoint: z.string() }))
      .mutation(async ({ input }) => {
        const success = await removePushSubscription(input.endpoint);
        return { success };
      }),
  }),

  sharing: router({    
    // Share device with another user by email
    shareDevice: protectedProcedure
      .input(z.object({
        deviceId: z.number(),
        email: z.string().email(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify user owns the device
        const isOwner = await db.isDeviceOwner(ctx.user.id, input.deviceId);
        if (!isOwner) {
          throw new Error("Only device owner can share device");
        }
        
        // Find user by email
        const targetUser = await db.getUserByEmail(input.email);
        if (!targetUser) {
          throw new Error("User with this email not found. They need to sign in first.");
        }
        
        // Don't allow sharing with self
        if (targetUser.id === ctx.user.id) {
          throw new Error("Cannot share device with yourself");
        }
        
        // Share the device
        try {
          await db.shareDevice(input.deviceId, targetUser.id, ctx.user.id);
          return { success: true, sharedWith: targetUser.name || targetUser.email };
        } catch (error: any) {
          throw new Error(error.message || "Failed to share device");
        }
      }),
    
    // Unshare device from a user
    unshareDevice: protectedProcedure
      .input(z.object({
        deviceId: z.number(),
        userId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify user owns the device
        const isOwner = await db.isDeviceOwner(ctx.user.id, input.deviceId);
        if (!isOwner) {
          throw new Error("Only device owner can unshare device");
        }
        
        await db.unshareDevice(input.deviceId, input.userId);
        return { success: true };
      }),
    
    // Get list of users device is shared with
    getSharedUsers: protectedProcedure
      .input(z.object({ deviceId: z.number() }))
      .query(async ({ ctx, input }) => {
        // Verify user owns the device
        const isOwner = await db.isDeviceOwner(ctx.user.id, input.deviceId);
        if (!isOwner) {
          throw new Error("Only device owner can view shared users");
        }
        
        return await db.getDeviceShares(input.deviceId);
      }),
  }),
});

export type AppRouter = typeof appRouter;

