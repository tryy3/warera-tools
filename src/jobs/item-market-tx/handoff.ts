let pollEnabled = false;

export function isItemMarketTxPollEnabled(): boolean {
  return pollEnabled;
}

export function enableItemMarketTxPoll(): void {
  pollEnabled = true;
}

export function resetItemMarketTxHandoffForTests(): void {
  pollEnabled = false;
}
