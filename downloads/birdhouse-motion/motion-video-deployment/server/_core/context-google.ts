import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

/**
 * Create context for tRPC with Passport authentication
 * 
 * This reads the user from the Passport session (req.user)
 * instead of using the Manus SDK
 */
export async function createContextWithPassport(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Passport stores the authenticated user in req.user
  const user = (opts.req as any).user as User | undefined;

  return {
    req: opts.req,
    res: opts.res,
    user: user || null,
  };
}
