# Company Economy Advisor — Implementation Plan

**Date:** 2026-07-31  
**Design:** [2026-07-31-company-economy-advisor-design.md](../specs/2026-07-31-company-economy-advisor-design.md)

## Done (v1)

1. `price_polls` / `price_snapshots` + migration `0003_price_history`
2. Hourly `price-poll` job (`getPrices` + top-10 order aggregates)
3. Scraps + `/api/prices` read from history (no KV latest cache for market prices)
4. `src/economy` Profit/PP + AE daily + transfer payback
5. `/api/economy/search` + `/api/economy/advisor`
6. Economy WebUI tab (user search, companies, opportunities)
7. WarEra skill/README notes for explorer endpoints

## Follow-ups

- Tighten company/recommended-region parsers once live payloads are confirmed
- Historical charts / fluke detection
- Use buy/sell book for Profit/PP
- Wages / growth advisor
