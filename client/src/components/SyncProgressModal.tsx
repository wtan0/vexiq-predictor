/**
 * SyncProgressModal
 *
 * Opens a modal dialog and connects to the SSE endpoint at
 * /api/sync-stream/:teamNumber to stream real-time sync progress.
 *
 * Usage:
 *   const [syncing, setSyncing] = useState(false);
 *   <SyncProgressModal
 *     teamNumber="478M"
 *     open={syncing}
 *     onClose={() => setSyncing(false)}
 *     onDone={() => { setSyncing(false); refetch(); }}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, Loader2, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ─── Types (mirrored from server/browserScraper.ts) ──────────────────────────

type SyncProgressEvent =
  | { type: "start"; total: number; teamNumber: string }
  | { type: "event"; current: number; total: number; eventName: string; eventCode: string; matchCount: number; hasSkills: boolean }
  | { type: "awards"; count: number }
  | { type: "done"; eventsFound: number; skillsRecords: number; matchRecords: number; awardsFound: number }
  | { type: "error"; message: string };

// ─── Log entry ────────────────────────────────────────────────────────────────

interface LogEntry {
  id: number;
  icon: "check" | "loading" | "award" | "error";
  text: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SyncProgressModalProps {
  teamNumber: string;
  open: boolean;
  onClose: () => void;
  onDone: (result: { eventsFound: number; matchRecords: number; awardsFound: number }) => void;
}

export function SyncProgressModal({
  teamNumber,
  open,
  onClose,
  onDone,
}: SyncProgressModalProps) {
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<"connecting" | "running" | "done" | "error">("connecting");
  const [errorMsg, setErrorMsg] = useState("");
  const [doneResult, setDoneResult] = useState<{ eventsFound: number; matchRecords: number; awardsFound: number } | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const logIdRef = useRef(0);

  const addLog = (icon: LogEntry["icon"], text: string) => {
    const id = ++logIdRef.current;
    setLog((prev) => [...prev.slice(-49), { id, icon, text }]);
  };

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // Start SSE stream when modal opens
  useEffect(() => {
    if (!open) return;

    // Reset state
    setProgress(0);
    setTotal(0);
    setLog([]);
    setStatus("connecting");
    setErrorMsg("");
    setDoneResult(null);
    logIdRef.current = 0;

    const es = new EventSource(`/api/sync-stream/${encodeURIComponent(teamNumber)}`);
    esRef.current = es;

    es.onmessage = (e) => {
      let event: SyncProgressEvent;
      try {
        event = JSON.parse(e.data) as SyncProgressEvent;
      } catch {
        return;
      }

      if (event.type === "start") {
        setStatus("running");
        setTotal(event.total);
        addLog("loading", `Found ${event.total} events for ${event.teamNumber} — syncing…`);
      } else if (event.type === "awards") {
        addLog("award", `Saved ${event.count} award${event.count !== 1 ? "s" : ""}`);
      } else if (event.type === "event") {
        setProgress(event.current);
        setTotal(event.total);
        const shortName =
          event.eventName.length > 42
            ? event.eventName.slice(0, 42) + "…"
            : event.eventName;
        const detail = [
          event.matchCount > 0 ? `${event.matchCount} matches` : null,
          event.hasSkills ? "skills" : null,
        ]
          .filter(Boolean)
          .join(", ");
        addLog("check", `${shortName}${detail ? ` — ${detail}` : ""}`);
      } else if (event.type === "done") {
        setStatus("done");
        setProgress(event.eventsFound);
        setTotal(event.eventsFound);
        const result = {
          eventsFound: event.eventsFound,
          matchRecords: event.matchRecords,
          awardsFound: event.awardsFound,
        };
        setDoneResult(result);
        addLog(
          "check",
          `Done — ${event.eventsFound} events, ${event.matchRecords} matches, ${event.awardsFound} awards`
        );
        es.close();
        onDone(result);
      } else if (event.type === "error") {
        setStatus("error");
        setErrorMsg(event.message);
        addLog("error", `Error: ${event.message}`);
        es.close();
      }
    };

    es.onerror = () => {
      if (status !== "done") {
        setStatus("error");
        setErrorMsg("Connection lost. The sync may still be running in the background.");
        es.close();
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamNumber]);

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;
  const isDone = status === "done";
  const isError = status === "error";
  const isRunning = status === "running" || status === "connecting";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && !isRunning) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-lg bg-card border-border"
        onInteractOutside={(e) => {
          if (isRunning) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            {isRunning && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
            {isDone && <CheckCircle2 className="h-5 w-5 text-green-500" />}
            {isError && <AlertCircle className="h-5 w-5 text-destructive" />}
            {isRunning
              ? `Syncing ${teamNumber}…`
              : isDone
              ? `Sync complete — ${teamNumber}`
              : `Sync failed — ${teamNumber}`}
          </DialogTitle>
        </DialogHeader>

        {/* Progress bar */}
        <div className="space-y-1.5 mt-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {isRunning
                ? total > 0
                  ? `Event ${progress} of ${total}`
                  : "Connecting to RobotEvents API…"
                : isDone
                ? `${doneResult?.eventsFound ?? 0} events synced`
                : "Sync stopped"}
            </span>
            <span>{pct}%</span>
          </div>
          <Progress
            value={pct}
            className={cn(
              "h-2 transition-all",
              isDone && "[&>div]:bg-green-500",
              isError && "[&>div]:bg-destructive"
            )}
          />
        </div>

        {/* Scrollable log */}
        <div className="mt-3 max-h-52 overflow-y-auto rounded-md bg-background border border-border p-3 space-y-1.5 text-xs font-mono">
          {log.length === 0 && (
            <p className="text-muted-foreground">Waiting for server…</p>
          )}
          {log.map((entry) => (
            <div key={entry.id} className="flex items-start gap-2">
              {entry.icon === "check" && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
              )}
              {entry.icon === "loading" && (
                <Loader2 className="h-3.5 w-3.5 text-primary animate-spin mt-0.5 shrink-0" />
              )}
              {entry.icon === "award" && (
                <Trophy className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
              )}
              {entry.icon === "error" && (
                <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
              )}
              <span
                className={cn(
                  "leading-snug",
                  entry.icon === "error" ? "text-destructive" : "text-foreground/80"
                )}
              >
                {entry.text}
              </span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Error message */}
        {isError && errorMsg && (
          <p className="text-xs text-destructive mt-1 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 shrink-0" />
            {errorMsg}
          </p>
        )}

        {/* Action buttons */}
        <div className="flex justify-end gap-2 mt-2">
          {isRunning && (
            <p className="text-xs text-muted-foreground self-center mr-auto">
              Please wait — sync is in progress
            </p>
          )}
          {(isDone || isError) && (
            <Button size="sm" variant="outline" onClick={onClose}>
              Close
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
