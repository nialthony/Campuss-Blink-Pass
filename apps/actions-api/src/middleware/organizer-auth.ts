import type { Request, Response, NextFunction } from "express";
import { config } from "../config.js";

export function organizerAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.header("x-api-key");
  if (!apiKey || apiKey !== config.organizerApiKey) {
    res.status(401).json({ error: "Unauthorized organizer access" });
    return;
  }

  next();
}

