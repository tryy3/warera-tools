# WarEra api2 procedures

Manual snapshot for agents. **Official = works on `https://api2.warera.io/trpc`.** Refresh when we add/change API usage or realmarijn/TRPC clearly grew. No generator.

| Column | Meaning |
| --- | --- |
| Docs source | `openapi` · `trpc-custom` · `explorer` (prefer openapi > trpc-custom > explorer) |
| Auth | `required` · `optional` · `unknown` — evidence only; in-app we still send `X-API-Key` when set |
| Used here | `yes` if `src/warera/` calls it |

Params/examples: https://warera.realmarijn.nl/api-explorer  
Custom vs OpenAPI: https://github.com/WarEraProjects/TRPC/tree/main/src/CustomEndpoints

## Catalog

| Procedure | Docs source | Auth | Used here |
| --- | --- | --- | --- |
| alliance.getById | trpc-custom | unknown | no |
| alliance.getByIds | trpc-custom | unknown | no |
| alliance.getManyPaginated | trpc-custom | unknown | no |
| article.getArticleById | openapi | unknown | no |
| article.getArticleLiteById | openapi | unknown | no |
| article.getArticlesPaginated | openapi | unknown | no |
| article.getWelcomeArticleByCountryId | explorer | unknown | no |
| battle.getBattles | openapi | unknown | yes |
| battle.getById | openapi | unknown | yes |
| battle.getLiveBattleData | openapi | unknown | no |
| battleLootSummary.getByBattleAndUser | openapi | unknown | yes |
| battleOrder.getByBattle | openapi | unknown | no |
| battleRanking.getRanking | openapi | unknown | no |
| company.getById | openapi | unknown | yes |
| company.getCompanies | openapi | unknown | yes |
| company.getProductionBonus | trpc-custom | unknown | yes |
| company.getRecommendedRegionIdsByItemCode | trpc-custom | required | yes |
| country.getAllCountries | openapi | optional | yes |
| country.getCountryById | openapi | unknown | no |
| country.getUnrestData | explorer | unknown | no |
| countryDiplomacy.getByCountry | explorer | unknown | no |
| donation.getManyPaginated | trpc-custom | required | yes |
| donation.getTotalDonations | trpc-custom | unknown | no |
| election.getElection | explorer | unknown | no |
| election.getElections | trpc-custom | unknown | no |
| event.getEventsPaginated | openapi | unknown | no |
| gameConfig.getDates | openapi | unknown | no |
| gameConfig.getGameConfig | openapi | unknown | no |
| gameStat.getEquipmentAvgByCode | trpc-custom | unknown | no |
| gameStat.getWorldDevelopment | explorer | unknown | no |
| giveaway.getManyPaginated | explorer | unknown | no |
| government.getByCountryId | openapi | unknown | no |
| inventory.fetchCurrentEquipment | openapi | unknown | no |
| itemOffer.getById | openapi | unknown | no |
| itemTrading.getPrices | openapi | unknown | yes |
| mercenaryContractAuction.getPaginatedAuctions | openapi | unknown | no |
| mu.getById | openapi | unknown | yes |
| mu.getManyPaginated | openapi | unknown | no |
| muMember.getByMu | trpc-custom | required | yes |
| party.getById | trpc-custom | unknown | no |
| party.getManyPaginated | trpc-custom | unknown | no |
| ranking.getRanking | openapi | unknown | no |
| region.getAll | explorer | unknown | no |
| region.getById | openapi | unknown | yes |
| region.getRegionsObject | openapi | unknown | no |
| round.getById | openapi | unknown | no |
| round.getLastHits | openapi | unknown | no |
| sanction.getPaginated | explorer | unknown | no |
| search.searchAnything | openapi | unknown | yes |
| search.searchMus | explorer | unknown | no |
| search.searchUsers | explorer | unknown | no |
| shop.getLastGifts | explorer | unknown | no |
| shop.getSubscribedUsers | explorer | unknown | no |
| shop.getTopGiftGivers | explorer | unknown | no |
| tournament.getById | explorer | unknown | no |
| tournament.getLastTournament | trpc-custom | unknown | no |
| tournament.getManyPaginated | explorer | unknown | no |
| tournamentTeam.getById | trpc-custom | unknown | no |
| tournamentTeam.getByTournamentId | trpc-custom | unknown | no |
| tradingOrder.getPublicOrdersByOwner | trpc-custom | unknown | no |
| tradingOrder.getTopOrders | openapi | unknown | yes |
| transaction.getPaginatedTransactions | openapi | required | yes |
| upgrade.getUpgradeByTypeAndEntity | openapi | unknown | no |
| user.getUserById | openapi | unknown | yes |
| user.getUserLite | openapi | unknown | yes |
| user.getUsersByCountry | openapi | unknown | no |
| war.getById | explorer | unknown | no |
| work.getStatsByCompany | trpc-custom | required | yes |
| work.getStatsByUserId | trpc-custom | unknown | no |
| work.getStatsByWorker | explorer | unknown | no |
| work.getStatsByWorkerAndCompany | trpc-custom | required | yes |
| workOffer.getById | openapi | unknown | no |
| workOffer.getWageStats | trpc-custom | unknown | no |
| workOffer.getWorkOfferByCompanyId | openapi | unknown | yes |
| workOffer.getWorkOffersPaginated | openapi | unknown | no |
| worker.getTotalWorkersCount | openapi | unknown | no |
| worker.getWorkers | openapi | unknown | yes |
