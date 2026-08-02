export type Wallet = {
  gold: number;
  steel: number;
  concrete: number;
};

export type MaterialSpend = {
  steel?: number;
  concrete?: number;
};

export function goldCostAfterInventory(
  wallet: Wallet,
  spend: MaterialSpend,
  prices: { steel: number; concrete: number },
): { goldNeeded: number; nextWallet: Wallet } {
  let steel = wallet.steel;
  let concrete = wallet.concrete;
  let goldNeeded = 0;

  const needSteel = spend.steel ?? 0;
  if (needSteel > 0) {
    const fromInv = Math.min(steel, needSteel);
    steel -= fromInv;
    goldNeeded += (needSteel - fromInv) * prices.steel;
  }

  const needConcrete = spend.concrete ?? 0;
  if (needConcrete > 0) {
    const fromInv = Math.min(concrete, needConcrete);
    concrete -= fromInv;
    goldNeeded += (needConcrete - fromInv) * prices.concrete;
  }

  return {
    goldNeeded,
    nextWallet: { gold: wallet.gold, steel, concrete },
  };
}

export function waitHoursToAfford(goldNeeded: number, gold: number, goldPerHour: number): number {
  if (goldNeeded <= gold) return 0;
  if (goldPerHour <= 0) return Number.POSITIVE_INFINITY;
  return (goldNeeded - gold) / goldPerHour;
}
