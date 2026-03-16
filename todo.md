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
