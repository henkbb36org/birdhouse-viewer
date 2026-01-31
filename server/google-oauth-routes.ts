/**
 * Google OAuth Routes
 * 
 * Handles authentication flow with Google OAuth 2.0
 */

import { Express, Request, Response } from 'express';
import passport from 'passport';

/**
 * Register Google OAuth routes
 */
export function registerGoogleOAuthRoutes(app: Express) {
  // Initiate Google OAuth flow
  app.get('/auth/google', passport.authenticate('google', {
    scope: ['profile', 'email']
  }));

  // Google OAuth callback
  app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/login-failed' }),
    (req: Request, res: Response) => {
      // Successful authentication
      // Redirect to home page or dashboard
      res.redirect('/');
    }
  );

  // Login failed page
  app.get('/login-failed', (req: Request, res: Response) => {
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

  // Logout route
  app.get('/auth/logout', (req: Request, res: Response) => {
    req.logout((err) => {
      if (err) {
        console.error('[Google OAuth] Logout error:', err);
      }
      res.redirect('/');
    });
  });

  console.log('[Google OAuth] Routes registered');
}
