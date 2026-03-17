/**
 * Server-Sent Events (SSE) endpoint for real-time sync progress.
 *
 * Route: GET /api/sync-stream/:teamNumber
 *
 * The client opens an EventSource to this URL. The server runs
 * syncTeamFullHistory with a progress callback that pushes SSE events.
 * When the sync is done (or errors), the server closes the connection.
 */

import type { Express, Request, Response } from "express";
import { syncTeamFullHistory } from "./browserScraper";

export function registerSyncStreamRoute(app: Express): void {
  app.get("/api/sync-stream/:teamNumber", async (req: Request, res: Response) => {
    const { teamNumber } = req.params;

    if (!teamNumber || teamNumber.length > 16) {
      res.status(400).json({ error: "Invalid team number" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
    res.flushHeaders();

    // Helper to send an SSE event
    const send = (data: object) => {
      if (res.writableEnded) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Keep-alive ping every 15 seconds to prevent proxy timeouts
    const pingInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": ping\n\n");
      }
    }, 15000);

    // Handle client disconnect
    req.on("close", () => {
      clearInterval(pingInterval);
    });

    try {
      await syncTeamFullHistory(teamNumber, (event) => {
        send(event);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      send({ type: "error", message });
    } finally {
      clearInterval(pingInterval);
      if (!res.writableEnded) {
        res.end();
      }
    }
  });
}
