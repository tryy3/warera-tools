---
name: warera-game-mechanics
description: Documents WarEra game economy rules—companies/AE/storage, PP recipes, production bonus, wages/income tax, gear scrap tiers, market tax, and glossary. Use when calculating company or AE profit, PP, production bonus/region boost, wages, dismantle vs sell, scrap tiers, or when the user mentions WarEra mechanics, companies, factories, AE, PP, or gear tiers.
---

# WarEra Game Mechanics

Domain knowledge for WarEra economy math. Prefer these documented rules over re-deriving from chat.

API allowlist / tRPC → [warera-api](../warera-api/SKILL.md).

External wiki (mechanics detail):

- [Company](https://warera.wiki/en/company)
- [Country](https://warera.wiki/en/country)
- [Region](https://warera.wiki/en/region)

## Related resources

- [glossary.md](glossary.md) — AE, PP, production bonus, item name synonyms
- [companies.md](companies.md) — AE vs employees, recipes, production bonus, wages
- [gear-economy.md](gear-economy.md) — gear tiers, scrap, market tax vs dismantle

## Source of truth

| Topic | Prefer |
| --- | --- |
| Static rules (AE table, recipes, wage steps) | This skill + wiki |
| Production bonus % for a location | **Live API** (`region` / `country` / `company`) — do not hardcode |
| Income tax / occupation | Live country/region (changes with war/laws) |
| Market prices / Profit/PP | Hourly `price-poll` → `price_snapshots` (from `itemTrading.getPrices`); order book aggregates stored for later |
| Gear calc in this app | `src/calculator/` ↔ [gear-economy.md](gear-economy.md) |
| Company advisor | `src/economy/` + `company.*` (incl. recommended regions) |

Mark gaps as **unconfirmed**. Do not invent missing multipliers.

## Agent checklist

- [ ] AE idle math ≠ employee math — use the right formula
- [ ] Production bonus from API (or explicit user-provided %); strategic/deposit rules only for explanation
- [ ] Market listing prices are tax-inclusive unless stated otherwise
- [ ] Wage income tax ≠ market sell tax
- [ ] Use live prices for Profit/PP
- [ ] Update this skill when a mechanic is newly confirmed
