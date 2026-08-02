import { goldCostAfterInventory, waitHoursToAfford, type Wallet } from "./afford";
import { MAX_AE_LEVEL, MAX_COMPANIES, concreteForNewCompany, steelForAeUpgrade } from "./costs";
import { dailyGoldFromFactories, hourlyGoldFromFactories, type GrowthFactory } from "./income";

export type GrowthPathMode = "cheapest" | "income_roi" | "upgrade_first";

/** Safety cap on greedy steps (heuristics are linear; this avoids infinite loops). */
export const DEFAULT_MAX_ITERATIONS = 2_000;

export type GrowthPlanInput = {
  factories: GrowthFactory[];
  goalAe7Count: number;
  mode: GrowthPathMode;
  wallet: Wallet;
  prices: { steel: number; concrete: number };
  extraGoldPerDay: number;
  newFactoryGoldPerAePerDay: number;
  /** Max greedy steps before marking incomplete (default {@link DEFAULT_MAX_ITERATIONS}). */
  maxIterations?: number;
};

export type GrowthPlanStep = {
  tHours: number;
  action: "buy" | "upgrade";
  factoryId: string;
  fromLevel: number;
  toLevel: number;
  dailyGoldAfter: number;
  deltaDailyGold: number;
  goldSpent: number;
};

export type GrowthPlanSeriesPoint = {
  tHours: number;
  dailyGold: number;
};

export type GrowthPlanResult = {
  complete: boolean;
  stuck: boolean;
  hitIterLimit: boolean;
  timeToGoalHours: number | null;
  steps: GrowthPlanStep[];
  series: GrowthPlanSeriesPoint[];
  finalFactories: GrowthFactory[];
};

type Candidate = {
  action: "buy" | "upgrade";
  factoryId: string;
  fromLevel: number;
  toLevel: number;
  goldNeeded: number;
  deltaDailyGold: number;
  nextFactories: GrowthFactory[];
  nextWalletAfterInventory: Wallet;
  /** Higher AE among upgrades — used by upgrade_first. */
  focusLevel: number;
};

function ae7Count(factories: GrowthFactory[]): number {
  let count = 0;
  for (const f of factories) {
    if (f.aeLevel === MAX_AE_LEVEL) count++;
  }
  return count;
}

function cloneFactories(factories: GrowthFactory[]): GrowthFactory[] {
  return factories.map((f) => ({ ...f }));
}

function listCandidates(
  factories: GrowthFactory[],
  wallet: Wallet,
  prices: { steel: number; concrete: number },
  extraGoldPerDay: number,
  newFactoryGoldPerAePerDay: number,
  mode: GrowthPathMode,
  goalAe7Count: number,
): Candidate[] {
  const dailyBefore = dailyGoldFromFactories(factories, extraGoldPerDay);
  const out: Candidate[] = [];
  const allMaxed = factories.every((f) => f.aeLevel >= MAX_AE_LEVEL);

  const pushUpgrade = (index: number) => {
    const f = factories[index]!;
    if (f.aeLevel >= MAX_AE_LEVEL) return;
    const steel = steelForAeUpgrade(f.aeLevel);
    const { goldNeeded, nextWallet } = goldCostAfterInventory(wallet, { steel }, prices);
    const nextFactories = cloneFactories(factories);
    const fromLevel = nextFactories[index]!.aeLevel;
    nextFactories[index] = { ...nextFactories[index]!, aeLevel: fromLevel + 1 };
    const dailyAfter = dailyGoldFromFactories(nextFactories, extraGoldPerDay);
    out.push({
      action: "upgrade",
      factoryId: nextFactories[index]!.id,
      fromLevel,
      toLevel: fromLevel + 1,
      goldNeeded,
      deltaDailyGold: dailyAfter - dailyBefore,
      nextFactories,
      nextWalletAfterInventory: nextWallet,
      focusLevel: fromLevel,
    });
  };

  const pushBuy = (cap: number) => {
    if (factories.length >= cap) return;
    const nextIndex = factories.length + 1;
    const concrete = concreteForNewCompany(nextIndex);
    const { goldNeeded, nextWallet } = goldCostAfterInventory(wallet, { concrete }, prices);
    const nextFactories = cloneFactories(factories);
    const factoryId = `new-${nextIndex}`;
    nextFactories.push({
      id: factoryId,
      aeLevel: 1,
      goldPerAePerDay: newFactoryGoldPerAePerDay,
    });
    const dailyAfter = dailyGoldFromFactories(nextFactories, extraGoldPerDay);
    out.push({
      action: "buy",
      factoryId,
      fromLevel: 0,
      toLevel: 1,
      goldNeeded,
      deltaDailyGold: dailyAfter - dailyBefore,
      nextFactories,
      nextWalletAfterInventory: nextWallet,
      focusLevel: 0,
    });
  };

  // Never buy past the goal — N×AE7 needs at most N company slots.
  const buyCap = Math.min(MAX_COMPANIES, goalAe7Count);

  if (mode === "upgrade_first") {
    if (!allMaxed) {
      for (let i = 0; i < factories.length; i++) pushUpgrade(i);
    } else {
      // All owned are AE7; buy only until we have enough slots for the goal.
      pushBuy(buyCap);
    }
  } else {
    for (let i = 0; i < factories.length; i++) pushUpgrade(i);
    // Cheapest / ROI may interleave buys, but only up to goal N.
    pushBuy(buyCap);
  }

  return out;
}

function pickCandidate(candidates: Candidate[], mode: GrowthPathMode): Candidate | null {
  if (candidates.length === 0) return null;

  if (mode === "cheapest") {
    return candidates.toSorted((a, b) => {
      if (a.goldNeeded !== b.goldNeeded) return a.goldNeeded - b.goldNeeded;
      if (a.action !== b.action) return a.action === "upgrade" ? -1 : 1;
      return b.focusLevel - a.focusLevel;
    })[0]!;
  }

  if (mode === "income_roi") {
    return candidates.toSorted((a, b) => {
      const roiA = a.goldNeeded <= 0 ? Number.POSITIVE_INFINITY : a.deltaDailyGold / a.goldNeeded;
      const roiB = b.goldNeeded <= 0 ? Number.POSITIVE_INFINITY : b.deltaDailyGold / b.goldNeeded;
      if (roiA !== roiB) return roiB - roiA;
      if (a.goldNeeded !== b.goldNeeded) return a.goldNeeded - b.goldNeeded;
      return b.deltaDailyGold - a.deltaDailyGold;
    })[0]!;
  }

  // upgrade_first: finish highest AE first (closest to AE7), then cheapest.
  return candidates.toSorted((a, b) => {
    if (a.action !== b.action) return a.action === "upgrade" ? -1 : 1;
    if (a.focusLevel !== b.focusLevel) return b.focusLevel - a.focusLevel;
    return a.goldNeeded - b.goldNeeded;
  })[0]!;
}

export function planGrowthPath(input: GrowthPlanInput): GrowthPlanResult {
  const maxSteps = input.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const startDaily = dailyGoldFromFactories(input.factories, input.extraGoldPerDay);

  let factories = cloneFactories(input.factories);
  let wallet: Wallet = { ...input.wallet };
  let time = 0;
  const steps: GrowthPlanStep[] = [];
  const series: GrowthPlanSeriesPoint[] = [{ tHours: 0, dailyGold: startDaily }];

  if (ae7Count(factories) >= input.goalAe7Count) {
    return {
      complete: true,
      stuck: false,
      hitIterLimit: false,
      timeToGoalHours: 0,
      steps: [],
      series,
      finalFactories: factories,
    };
  }

  let stuck = false;
  let hitIterLimit = false;

  for (let stepIdx = 0; stepIdx < maxSteps; stepIdx++) {
    if (ae7Count(factories) >= input.goalAe7Count) {
      return {
        complete: true,
        stuck: false,
        hitIterLimit: false,
        timeToGoalHours: time,
        steps,
        series,
        finalFactories: factories,
      };
    }

    const candidates = listCandidates(
      factories,
      wallet,
      input.prices,
      input.extraGoldPerDay,
      input.newFactoryGoldPerAePerDay,
      input.mode,
      input.goalAe7Count,
    );
    const chosen = pickCandidate(candidates, input.mode);
    const hourly = hourlyGoldFromFactories(factories, input.extraGoldPerDay);

    if (!chosen) {
      stuck = true;
      break;
    }

    const wait = waitHoursToAfford(chosen.goldNeeded, chosen.nextWalletAfterInventory.gold, hourly);
    if (!Number.isFinite(wait)) {
      stuck = true;
      break;
    }

    const goldAfterWait = chosen.nextWalletAfterInventory.gold + wait * hourly;
    time += wait;
    wallet = {
      gold: goldAfterWait - chosen.goldNeeded,
      steel: chosen.nextWalletAfterInventory.steel,
      concrete: chosen.nextWalletAfterInventory.concrete,
    };
    factories = chosen.nextFactories;
    const dailyGoldAfter = dailyGoldFromFactories(factories, input.extraGoldPerDay);
    steps.push({
      tHours: time,
      action: chosen.action,
      factoryId: chosen.factoryId,
      fromLevel: chosen.fromLevel,
      toLevel: chosen.toLevel,
      dailyGoldAfter,
      deltaDailyGold: chosen.deltaDailyGold,
      goldSpent: chosen.goldNeeded,
    });
    series.push({ tHours: time, dailyGold: dailyGoldAfter });
  }

  if (!stuck && ae7Count(factories) < input.goalAe7Count) {
    hitIterLimit = true;
  }

  return {
    complete: ae7Count(factories) >= input.goalAe7Count,
    stuck,
    hitIterLimit,
    timeToGoalHours: ae7Count(factories) >= input.goalAe7Count ? time : null,
    steps,
    series,
    finalFactories: factories,
  };
}
