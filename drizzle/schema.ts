import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  float,
  bigint,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── VEX IQ Domain Tables ───────────────────────────────────────────────────

/** One row per team (Elementary, 2025-2026 season) */
export const teams = mysqlTable(
  "teams",
  {
    id: int("id").autoincrement().primaryKey(),
    teamNumber: varchar("teamNumber", { length: 16 }).notNull().unique(),
    teamName: text("teamName"),
    organization: text("organization"),
    eventRegion: varchar("eventRegion", { length: 128 }),
    country: varchar("country", { length: 128 }),
    /** Overall skills rank (global) */
    skillsRank: int("skillsRank"),
    /** Combined skills score = driverScore + autoScore */
    skillsScore: int("skillsScore"),
    /** Best driver skills score */
    driverScore: int("driverScore"),
    /** Best autonomous coding skills score */
    autoScore: int("autoScore"),
    /** Timestamp of best driver score attempt */
    driverScoreAt: timestamp("driverScoreAt"),
    /** Timestamp of best auto score attempt */
    autoScoreAt: timestamp("autoScoreAt"),
    /** When match history was last scraped from RobotEvents */
    lastSyncedAt: timestamp("lastSyncedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (t) => [index("idx_teams_teamNumber").on(t.teamNumber)]
);

export type Team = typeof teams.$inferSelect;
export type InsertTeam = typeof teams.$inferInsert;

/** One row per event a team participated in */
export const teamEvents = mysqlTable(
  "team_events",
  {
    id: int("id").autoincrement().primaryKey(),
    teamNumber: varchar("teamNumber", { length: 16 }).notNull(),
    /** RobotEvents event code e.g. RE-VIQRC-25-0853 */
    eventCode: varchar("eventCode", { length: 32 }),
    eventName: text("eventName").notNull(),
    eventDate: timestamp("eventDate"),
    /** Skills rank at this specific event */
    eventRank: int("eventRank"),
    /** Driver skills score at this event */
    driverScore: int("driverScore"),
    /** Auto skills score at this event */
    autoScore: int("autoScore"),
    /** Combined skills score at this event */
    skillsScore: int("skillsScore"),
    /** Teamwork match rank at this event */
    teamworkRank: int("teamworkRank"),
    /** Average teamwork score at this event */
    avgTeamworkScore: float("avgTeamworkScore"),
    /** Finalist ranking at this event (from the Finalist Ranking table) */
    finalistRank: int("finalistRank"),
    /** Score in the final round (from the Finalist Ranking table) */
    finalistScore: int("finalistScore"),
    /** Win/Autonomous/Points record e.g. "5/2/1" */
    wpApSp: varchar("wpApSp", { length: 32 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_team_events_teamNumber").on(t.teamNumber),
    uniqueIndex("uniq_team_events_team_event").on(t.teamNumber, t.eventCode),
  ]
);

export type TeamEvent = typeof teamEvents.$inferSelect;
export type InsertTeamEvent = typeof teamEvents.$inferInsert;

/** One row per match a team played */
export const teamMatches = mysqlTable(
  "team_matches",
  {
    id: int("id").autoincrement().primaryKey(),
    teamNumber: varchar("teamNumber", { length: 16 }).notNull(),
    /** RobotEvents event code e.g. RE-VIQRC-25-0853 */
    eventCode: varchar("eventCode", { length: 32 }),
    eventName: text("eventName").notNull(),
    matchName: varchar("matchName", { length: 64 }),
    matchDate: timestamp("matchDate"),
    /** Partner team number */
    partnerTeam: varchar("partnerTeam", { length: 16 }),
    /** Score for this team's alliance */
    allianceScore: int("allianceScore"),
    /** Score for the opposing alliance */
    opponentScore: int("opponentScore"),
    /** Whether this team's alliance won */
    won: boolean("won"),
    /** Whether the match was a tie */
    tied: boolean("tied"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_team_matches_teamNumber").on(t.teamNumber),
    index("idx_team_matches_eventCode").on(t.eventCode),
  ]
);

export type TeamMatch = typeof teamMatches.$inferSelect;
export type InsertTeamMatch = typeof teamMatches.$inferInsert;

/** Awards won by a team at a specific event */
export const teamAwards = mysqlTable(
  "team_awards",
  {
    id: int("id").autoincrement().primaryKey(),
    teamNumber: varchar("teamNumber", { length: 16 }).notNull(),
    /** RobotEvents event code e.g. RE-VIQRC-25-0853 */
    eventCode: varchar("eventCode", { length: 32 }).notNull(),
    eventName: text("eventName").notNull(),
    /** Award name e.g. "Excellence Award (VIQRC)" */
    awardName: varchar("awardName", { length: 128 }).notNull(),
    /** What the award qualifies for e.g. "World Championship" */
    qualifiesFor: varchar("qualifiesFor", { length: 512 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_team_awards_teamNumber").on(t.teamNumber),
    index("idx_team_awards_eventCode").on(t.eventCode),
    uniqueIndex("uniq_team_awards").on(t.teamNumber, t.eventCode, t.awardName),
  ]
);

export type TeamAward = typeof teamAwards.$inferSelect;
export type InsertTeamAward = typeof teamAwards.$inferInsert;

/**
 * Tracks per-team background scrape jobs.
 * One row per team — upserted on each sync attempt.
 */
export const teamSyncJobs = mysqlTable(
  "team_sync_jobs",
  {
    id: int("id").autoincrement().primaryKey(),
    teamNumber: varchar("teamNumber", { length: 16 }).notNull(),
    /** "pending" | "running" | "done" | "error" */
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** Number of events found during last sync */
    eventsFound: int("eventsFound").default(0),
    /** Number of match records saved */
    matchRecords: int("matchRecords").default(0),
    /** Number of awards saved */
    awardsFound: int("awardsFound").default(0),
    errorMessage: text("errorMessage"),
    startedAt: timestamp("startedAt"),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("uniq_team_sync_jobs_teamNumber").on(t.teamNumber),
  ]
);

export type TeamSyncJob = typeof teamSyncJobs.$inferSelect;
export type InsertTeamSyncJob = typeof teamSyncJobs.$inferInsert;

/** Tracks when data was last synced */
export const syncLog = mysqlTable("sync_log", {
  id: int("id").autoincrement().primaryKey(),
  syncType: varchar("syncType", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["running", "success", "error"]).notNull(),
  recordsProcessed: int("recordsProcessed").default(0),
  errorMessage: text("errorMessage"),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type SyncLog = typeof syncLog.$inferSelect;
export type InsertSyncLog = typeof syncLog.$inferInsert;

// ─── Invite System ──────────────────────────────────────────────────────────

/** Shareable invite tokens — anyone with the link can join after logging in */
export const invitations = mysqlTable(
  "invitations",
  {
    id: int("id").autoincrement().primaryKey(),
    /** Cryptographically random token (32 hex bytes = 64 chars) */
    token: varchar("token", { length: 64 }).notNull().unique(),
    /** Display label set by the creator, e.g. "For Coach Smith" */
    label: varchar("label", { length: 128 }),
    /** openId of the user who created this invite */
    createdByOpenId: varchar("createdByOpenId", { length: 64 }).notNull(),
    /** Display name of the creator */
    createdByName: text("createdByName"),
    /** "active" | "revoked" */
    status: mysqlEnum("status", ["active", "revoked"]).notNull().default("active"),
    /** How many times this link has been used */
    useCount: int("useCount").notNull().default(0),
    /** Optional expiry — null means never expires */
    expiresAt: timestamp("expiresAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_invitations_token").on(t.token),
    index("idx_invitations_createdBy").on(t.createdByOpenId),
  ]
);
export type Invitation = typeof invitations.$inferSelect;
export type InsertInvitation = typeof invitations.$inferInsert;

/** Tracks which users accepted which invite */
export const inviteUses = mysqlTable(
  "invite_uses",
  {
    id: int("id").autoincrement().primaryKey(),
    invitationId: int("invitationId").notNull(),
    /** openId of the user who accepted */
    acceptedByOpenId: varchar("acceptedByOpenId", { length: 64 }).notNull(),
    acceptedByName: text("acceptedByName"),
    acceptedAt: timestamp("acceptedAt").defaultNow().notNull(),
  },
  (t) => [
    index("idx_invite_uses_invitationId").on(t.invitationId),
    uniqueIndex("uniq_invite_uses").on(t.invitationId, t.acceptedByOpenId),
  ]
);
export type InviteUse = typeof inviteUses.$inferSelect;
export type InsertInviteUse = typeof inviteUses.$inferInsert;
