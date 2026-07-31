# WarEra glossary

## Abbreviations

| Term | Meaning | Notes |
| --- | --- | --- |
| **PP** | Production Points | Stored in company; consumed on Produce. Also recipe cost. |
| **AE** | Automated Engine | Idle PP/h upgrade track (level 1–7 → 1–7 PP/h). |
| **Profit/PP** | Profit per production point | Market value attributable to one PP of output (live prices). |
| **G** / **Coins** | In-game currency | Listings and wages denominated in coins/gold. |
| **Wage/PP** | Coins paid per PP worked | Job-offer wage rate. |

## Synonyms / UI language

| Preferred in this project | Also heard / UI | Notes |
| --- | --- | --- |
| **Company** | Factory | Feature name is companies; icon looks like a factory. |
| **Production bonus** | Region boost | Wiki term; location % boost to PP gained. |
| **Mysterious Plant** | Magical plant | Same raw; wiki uses Mysterious Plant. |
| **Cooked Fish** | Fish steaks | Same processed fish item (wiki: Cooked Fish). |
| **Special resources** | Strategic resources | Country-wide production-bonus resources on regions. |
| **Incl. price** | Tax-inclusive listing | Buyer-facing market price. |
| **Excl. price** | Seller receive | `incl / (1 + taxRate)` for market VAT-style tax. |
| **Scraps** | Scrap | Dismantle output. |
| **Tier** | Color / quality | Gray → red; scrap yield by tier only. |

## Economy concepts (short)

| Concept | Meaning |
| --- | --- |
| **Production bonus** | % more PP from AE, self-work, and employees. Country strategic resources + optional +30% matching deposit. Fetch live via API. |
| **Ethics specialization bonus** | Play term; **unconfirmed** mapping to wiki fields — prefer API totals. |
| **Income tax** | Taken from employee wages into country treasury (location of company). Occupied regions can hijack part of tax. |
| **Market tax** | Separate from wage income tax; used in gear sell-vs-dismantle (`excl` from `incl`). |
| **AE level** | Automated Engine level (= base PP/h), not “storage level”. |
| **Dismantle value** | `scrapPrice × scrapAmount`. |
