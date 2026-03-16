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
