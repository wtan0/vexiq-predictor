# VEX IQ Championship Predictor - TODO

## Database & Backend
- [x] Database schema: teams, skills_records, match_records, events tables
- [x] Data scraper: download skills standings CSV from RobotEvents
- [x] Data scraper: scrape team match history from public team pages
- [x] Data caching system with refresh timestamps
- [x] Statistical analysis engine (skills scoring, match win rates, partner performance)
- [x] tRPC: team search by number or name
- [x] tRPC: team detail with full season stats
- [x] tRPC: head-to-head comparison with winning odds
- [x] tRPC: season progress data (per-event breakdown)
- [x] tRPC: world finals predictor (top teams ranked by probability)
- [x] tRPC: trigger data refresh/sync

## Frontend
- [x] Design system: dark theme, VEX IQ brand colors, modern dashboard style
- [x] Landing page with hero, feature highlights, quick team search
- [x] Team search page with autocomplete
- [x] Head-to-head comparison page with odds visualization
- [x] Individual team profile page with season progress charts
- [x] World finals predictor page with ranked leaderboard
- [x] Navigation header with links to all sections
- [x] Loading states and error handling throughout
- [x] Responsive design (mobile + desktop)

## Testing
- [x] Unit tests for statistical analysis engine
- [x] Unit tests for tRPC procedures

## Match Records (New Feature)
- [x] Investigate RobotEvents team page HTML structure for match data
- [x] Improve match scraper to reliably parse event names, match scores, partner teams, and outcomes
- [x] Add batch match sync endpoint (sync top N teams by skills rank)
- [x] Add per-team match sync trigger from team profile page
- [x] Display match history table on team profile (event, match #, score, partner, result)
- [x] Display season progress timeline chart (scores over time by event)
- [x] Update head-to-head to use cooperative metrics (Avg TW Score, not win rate)
- [ ] Add sync status indicator showing last sync time and match count

## Frontend Improvements (Session 2)
- [x] Replace wins/losses bar chart with Avg + Best Match Score chart (ComposedChart)
- [x] Add Best Match Score column to event history table
- [x] Add Partner Teams column to event history table (clickable badges)
- [x] Update HeadToHead radar chart: replace Win Rate with Avg TW Score
- [x] Update HeadToHead team cards: show Avg TW Score instead of Win Rate
- [x] Update WorldFinals table: replace Win Rate column with Avg TW Score
- [x] Add Sync Top 5 button on WorldFinals page
- [x] Fix prediction methodology note to reflect cooperative VEX IQ model

## Match History Fix (Session 3)
- [x] Inspect RobotEvents 478M page to understand events/matches/awards structure
- [x] Fix scraper to paginate through all pages of Match Results tab (was only reading page 1)
- [x] Add awards scraping from Awards tab on team page
- [x] Add team_awards table to DB schema with migration
- [x] Add tRPC endpoint for fetching team awards
- [x] Display awards section on Team Profile (grouped by event, color-coded by qualification level)
- [ ] Re-sync team 478M to populate all 7 events and awards (user action required)

## Session 4 Features
- [x] Add per-event re-sync button (refresh single event without full re-scrape)
- [x] Add expandable match detail rows per event (show individual matches with partner, score, link)
- [x] Add World Qualifier badge on team profile header

## Session 5 Features
- [x] Add World Qualifiers filter toggle on World Finals page (show only confirmed World Championship qualifier teams)

## Session 6 Bug Fixes
- [ ] Fix scraper pagination: iterate through ALL pages of Match Results tab (not just page 1)

## Session 6 — Pre-scrape World Qualifiers
- [x] Fix scraper pagination: use .page-link selector, trim whitespace from » button text
- [x] Fix qualifiesFor column length (128 → 512) to prevent DB truncation errors
- [x] Add sync_jobs table to track background scrape progress per team
- [x] Add syncAllQualifiers endpoint: scrapes all World qualifier teams in background
- [x] Add getSyncProgress endpoint: returns per-team sync status
- [x] Add "Sync All Qualifiers" button + live progress panel on World Finals page

## Session 7 Bug Fixes
- [x] Fix podium: #1 should have highest win probability; fix podium layout and rank labels

## Session 8 Bug Fixes
- [x] Fix scraper pagination: reliably iterate ALL pages for teams with multi-page match records (e.g. 81777A)
  - Root cause: "»" is the LAST PAGE button (not next page) — was skipping page 2 and jumping to last
  - Fix: click numbered page link (e.g. "2") first; fall back to "›" single chevron only

## Session 9 Features
- [x] Add lastSyncedAt column to teams table (migration)
- [x] Update syncTeamHistory to stamp lastSyncedAt on completion
- [x] Show "Last synced X ago" on team profile header (with "Never synced" warning)
- [x] Add nightly cron job (3:00 AM) that re-runs syncAllQualifiers automatically
- [x] Startup pre-scrape: on boot, auto-sync any qualifier teams with lastSyncedAt IS NULL

## Session 10 Features
- [x] Add sparkline chart in expanded event rows (match score trend per event)

## Session 11 Bug Fixes
- [ ] Scrape final teamwork ranking from the Rankings tab on each event page and display it in event history

## Session 11 Features
- [x] Highlight the final round match (highest-numbered TeamWork match) in expanded match rows and sparkline

## Session 12 Features
- [x] Add finalistRank + finalistScore columns to team_events table
- [x] Update scraper to capture Finalist Ranking table (Rank|Team|Name|Score, 4-col exact match)
- [x] Display finalist rank/score in event history row (gold/silver/bronze badges + score)

## Session 13 Bug Fixes
- [x] Fix final round detection: use "Match #X-Y" pattern (e.g. "Match #1-9") — these are the playoff finals
