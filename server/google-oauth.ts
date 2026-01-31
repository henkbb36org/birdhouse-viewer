/**
 * Google OAuth 2.0 Authentication
 * 
 * This module configures Passport.js with Google OAuth strategy
 * for user authentication.
 */

import passport from 'passport';
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from 'passport-google-oauth20';
import { upsertUser, getUserByOpenId } from './db';
import { User } from '../drizzle/schema';

// Environment variables for Google OAuth
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback';

/**
 * Configure Passport with Google OAuth strategy
 */
export function configureGoogleOAuth() {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.warn('[Google OAuth] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    console.warn('[Google OAuth] Authentication will not work until these are configured');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
        scope: ['profile', 'email'],
      },
      async (accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) => {
        try {
          // Use Google ID as openId
          const openId = `google:${profile.id}`;
          
          // Extract user information from Google profile
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : undefined;
          const name = profile.displayName || profile.username || 'Unknown User';
          
          // Upsert user in database
          await upsertUser({
            openId,
            name,
            email,
            loginMethod: 'google',
            lastSignedIn: new Date(),
          });
          
          // Fetch the complete user record
          const user = await getUserByOpenId(openId);
          
          if (!user) {
            return done(new Error('Failed to create or retrieve user'));
          }
          
          return done(null, user);
        } catch (error) {
          console.error('[Google OAuth] Error during authentication:', error);
          return done(error as Error);
        }
      }
    )
  );

  // Serialize user to session
  passport.serializeUser((user: any, done) => {
    done(null, user.openId);
  });

  // Deserialize user from session
  passport.deserializeUser(async (openId: string, done) => {
    try {
      const user = await getUserByOpenId(openId);
      done(null, user || null);
    } catch (error) {
      done(error);
    }
  });

  console.log('[Google OAuth] Configured successfully');
}

/**
 * Get authentication status
 */
export function isGoogleOAuthConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}
