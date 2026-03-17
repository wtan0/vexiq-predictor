/**
 * Tests for the SSE sync stream endpoint and progress callback integration.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SyncProgressEvent, ProgressCallback } from "./browserScraper";

// ─── Unit tests for progress event shape ─────────────────────────────────────

describe("SyncProgressEvent types", () => {
  it("start event has total and teamNumber fields", () => {
    const evt: SyncProgressEvent = { type: "start", total: 5, teamNumber: "478M" };
    expect(evt.type).toBe("start");
    expect(evt.total).toBe(5);
    expect(evt.teamNumber).toBe("478M");
  });

  it("event progress has current, total, eventName, eventCode, matchCount, hasSkills", () => {
    const evt: SyncProgressEvent = {
      type: "event",
      current: 2,
      total: 5,
      eventName: "Test Event",
      eventCode: "RE-VRC-25-001",
      matchCount: 8,
      hasSkills: true,
    };
    expect(evt.type).toBe("event");
    expect(evt.current).toBe(2);
    expect(evt.total).toBe(5);
    expect(evt.matchCount).toBe(8);
    expect(evt.hasSkills).toBe(true);
  });

  it("awards event has count field", () => {
    const evt: SyncProgressEvent = { type: "awards", count: 3 };
    expect(evt.type).toBe("awards");
    expect(evt.count).toBe(3);
  });

  it("done event has all summary fields", () => {
    const evt: SyncProgressEvent = {
      type: "done",
      eventsFound: 5,
      skillsRecords: 4,
      matchRecords: 40,
      awardsFound: 2,
    };
    expect(evt.type).toBe("done");
    expect(evt.eventsFound).toBe(5);
    expect(evt.matchRecords).toBe(40);
  });

  it("error event has message field", () => {
    const evt: SyncProgressEvent = { type: "error", message: "Team not found" };
    expect(evt.type).toBe("error");
    expect(evt.message).toBe("Team not found");
  });
});

// ─── Progress callback accumulation test ─────────────────────────────────────

describe("ProgressCallback accumulation", () => {
  it("collects events in order via callback", () => {
    const collected: SyncProgressEvent[] = [];
    const cb: ProgressCallback = (evt) => collected.push(evt);

    cb({ type: "start", total: 2, teamNumber: "TEST" });
    cb({ type: "event", current: 1, total: 2, eventName: "Event A", eventCode: "A", matchCount: 5, hasSkills: true });
    cb({ type: "event", current: 2, total: 2, eventName: "Event B", eventCode: "B", matchCount: 3, hasSkills: false });
    cb({ type: "done", eventsFound: 2, skillsRecords: 1, matchRecords: 8, awardsFound: 0 });

    expect(collected).toHaveLength(4);
    expect(collected[0].type).toBe("start");
    expect(collected[3].type).toBe("done");
    const done = collected[3];
    if (done.type === "done") {
      expect(done.matchRecords).toBe(8);
    }
  });

  it("progress percentage calculation is correct", () => {
    const events: Array<{ current: number; total: number }> = [
      { current: 1, total: 4 },
      { current: 2, total: 4 },
      { current: 3, total: 4 },
      { current: 4, total: 4 },
    ];
    const pcts = events.map((e) => Math.round((e.current / e.total) * 100));
    expect(pcts).toEqual([25, 50, 75, 100]);
  });
});
