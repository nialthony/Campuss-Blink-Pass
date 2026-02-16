import type { Request, Response, NextFunction, RequestHandler } from "express";

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createIpRateLimiter(options: RateLimitOptions): RequestHandler {
  const bucket = new Map<string, RateLimitEntry>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const current = bucket.get(key);

    if (!current || now > current.resetAt) {
      bucket.set(key, {
        count: 1,
        resetAt: now + options.windowMs
      });
      next();
      return;
    }

    if (current.count >= options.maxRequests) {
      const retryAfterSeconds = Math.ceil((current.resetAt - now) / 1000);
      res.setHeader("Retry-After", String(Math.max(retryAfterSeconds, 1)));
      res.status(429).json({ error: "Too many requests. Try again later." });
      return;
    }

    current.count += 1;
    bucket.set(key, current);

    if (bucket.size > 5000) {
      for (const [entryKey, entry] of bucket.entries()) {
        if (entry.resetAt < now) {
          bucket.delete(entryKey);
        }
      }
    }

    next();
  };
}

