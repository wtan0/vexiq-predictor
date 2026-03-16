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
    qualifiesFor: varchar("qualifiesFor", { length: 128 }),
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
