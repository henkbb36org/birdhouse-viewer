/**
 * Authentication Bypass for Development/Testing
 * 
 * WARNING: This file disables authentication and should ONLY be used for
 * development and testing purposes. DO NOT use in production!
 * 
 * This creates a mock user that is automatically logged in, allowing you to
 * test the application features without implementing full authentication.
 */

import { Request, Response } from 'express';
import { User } from '../drizzle/schema';

/**
 * Mock user for testing
 * This user will be automatically created in the database if it doesn't exist
 */
export const MOCK_USER: Partial<User> = {
  openId: 'test-user-bypass',
  name: 'Test User',
  email: 'test@birdhouse.local',
  role: 'admin',
  loginMethod: 'bypass',
};

/**
 * Middleware to bypass authentication
 * Automatically creates and logs in a test user
 * 
 * This sets a mock user on the request object that will be picked up
 * by the context creation in tRPC
 */
export function authBypassMiddleware(req: Request, res: Response, next: Function) {
  // Skip for static assets
  if (req.path.startsWith('/assets') || req.path.startsWith('/favicon') || req.path.startsWith('/manifest')) {
    return next();
  }

  // Mock user is always authenticated
  // This will be picked up by createContext
  (req as any).mockUser = {
    id: 1,
    openId: MOCK_USER.openId!,
    name: MOCK_USER.name!,
    email: MOCK_USER.email!,
    role: MOCK_USER.role!,
    loginMethod: MOCK_USER.loginMethod!,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  next();
}

/**
 * Setup function to create the mock user in the database
 */
export async function setupMockUser(db: any) {
  try {
    const { users } = await import('../drizzle/schema');
    const { eq } = await import('drizzle-orm');
    
    // Check if mock user exists
    const existing = await db.select().from(users).where(eq(users.openId, MOCK_USER.openId!)).limit(1);
    
    if (existing.length === 0) {
      // Create mock user
      await db.insert(users).values({
        openId: MOCK_USER.openId!,
        name: MOCK_USER.name,
        email: MOCK_USER.email,
        role: MOCK_USER.role,
        loginMethod: MOCK_USER.loginMethod,
        lastSignedIn: new Date(),
      });
      console.log('[Auth Bypass] Mock user created');
    } else {
      console.log('[Auth Bypass] Mock user already exists');
    }
  } catch (error) {
    console.error('[Auth Bypass] Error setting up mock user:', error);
  }
}
