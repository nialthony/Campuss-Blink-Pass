import { randomUUID } from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";

interface ActionAuditRecord {
  requestId: string;
  method: string;
  route: string;
  eventId?: string;
  wallet?: string;
  ip?: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
}

export function actionAuditLogger(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const requestId = randomUUID();
    const startedAt = Date.now();

    res.setHeader("x-request-id", requestId);

    res.on("finish", () => {
      const wallet = typeof req.body?.account === "string" ? req.body.account : undefined;
      const eventId = typeof req.params.eventId === "string" ? req.params.eventId : undefined;
      const record: ActionAuditRecord = {
        requestId,
        method: req.method,
        route: req.originalUrl,
        eventId,
        wallet,
        ip: req.ip,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
        timestamp: new Date().toISOString()
      };
      console.log(JSON.stringify(record));
    });

    next();
  };
}

