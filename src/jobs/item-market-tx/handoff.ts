let pollEnabled = false;
/** Once per process: commodity deepen walk reached chart max lookback. */
let commodityDeepenDone = false;

export function isItemMarketTxPollEnabled(): boolean {
  return pollEnabled;
}

export function enableItemMarketTxPoll(): void {
  pollEnabled = true;
}

export function isCommodityDeepenDone(): boolean {
  return commodityDeepenDone;
}

export function markCommodityDeepenDone(): void {
  commodityDeepenDone = true;
}

export function resetItemMarketTxHandoffForTests(): void {
  pollEnabled = false;
  commodityDeepenDone = false;
}
