import { goldCostAfterInventory, waitHoursToAfford, type Wallet } from "./afford";
import {
  MAX_AE_LEVEL,
  MAX_COMPANIES,
  concreteForNewCompany,
  steelForAeUpgrade,
} from "./costs";
import {
  dailyGoldFromFactories,
  hourlyGoldFromFactories,
  type GrowthFactory,
} from "./income";

export type GrowthPathMode = "optimal" | "upgrades_only";

export type GrowthPlanInput = {
  factories: GrowthFactory[];
  goalAe7Count: number;
  mode: GrowthPathMode;
  wallet: Wallet;
  prices: { steel: number; concrete: number };
  extraGoldPerDay: number;
  newFactoryGoldPerAePerDay: number;
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

class MinHeap<T> {
  private items: { priority: number; value: T }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(priority: number, value: T): void {
    this.items.push({ priority, value });
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;
    const top = this.items[0]!.value;
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.items[parent]!.priority <= this.items[index]!.priority) break;
      const tmp = this.items[parent]!;
      this.items[parent] = this.items[index]!;
      this.items[index] = tmp;
      index = parent;
    }
  }

  private bubbleDown(index: number): void {
    const n = this.items.length;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < n && this.items[left]!.priority < this.items[smallest]!.priority) {
        smallest = left;
      }
      if (right < n && this.items[right]!.priority < this.items[smallest]!.priority) {
        smallest = right;
      }
      if (smallest === index) break;
      const tmp = this.items[index]!;
      this.items[index] = this.items[smallest]!;
      this.items[smallest] = tmp;
      index = smallest;
    }
  }
}

function stateKey(factories: GrowthFactory[]): string {
  return factories
    .map((f) => f.aeLevel)
    .toSorted((a, b) => a - b)
    .join("|");
}

function ae7Count(factories: GrowthFactory[]): number {
  let count = 0;
  for (const f of factories) {
    if (f.aeLevel === 7) count++;
  }
  return count;
}

function cloneFactories(factories: GrowthFactory[]): GrowthFactory[] {
  return factories.map((f) => ({ ...f }));
}

export function planGrowthPath(input: GrowthPlanInput): GrowthPlanResult {
  const maxCompanies =
    input.mode === "optimal"
      ? MAX_COMPANIES
      : Math.max(input.factories.length, input.goalAe7Count);
  const maxIterations = input.maxIterations ?? 200_000;

  const startDaily = dailyGoldFromFactories(input.factories, input.extraGoldPerDay);
  if (ae7Count(input.factories) >= input.goalAe7Count) {
    return {
      complete: true,
      stuck: false,
      hitIterLimit: false,
      timeToGoalHours: 0,
      steps: [],
      series: [{ tHours: 0, dailyGold: startDaily }],
      finalFactories: cloneFactories(input.factories),
    };
  }

  type Node = {
    time: number;
    factories: GrowthFactory[];
    wallet: Wallet;
    steps: GrowthPlanStep[];
    series: GrowthPlanSeriesPoint[];
  };

  const heap = new MinHeap<Node>();
  const visited = new Set<string>();
  heap.push(0, {
    time: 0,
    factories: cloneFactories(input.factories),
    wallet: { ...input.wallet },
    steps: [],
    series: [{ tHours: 0, dailyGold: startDaily }],
  });

  let iter = 0;
  let stuck = false;
  let hitIterLimit = false;
  let bestIncomplete: Node | null = null;

  while (heap.size > 0 && iter < maxIterations) {
    iter++;
    const node = heap.pop()!;
    const key = stateKey(node.factories);
    if (visited.has(key)) continue;
    visited.add(key);
    bestIncomplete = node;

    if (ae7Count(node.factories) >= input.goalAe7Count) {
      return {
        complete: true,
        stuck: false,
        hitIterLimit: false,
        timeToGoalHours: node.time,
        steps: node.steps,
        series: node.series,
        finalFactories: node.factories,
      };
    }

    const hourly = hourlyGoldFromFactories(node.factories, input.extraGoldPerDay);
    const dailyBefore = dailyGoldFromFactories(node.factories, input.extraGoldPerDay);
    let anyNeighbor = false;

    const tryApply = (
      spend: { steel?: number; concrete?: number },
      apply: (factories: GrowthFactory[]) => {
        factories: GrowthFactory[];
        action: GrowthPlanStep["action"];
        factoryId: string;
        fromLevel: number;
        toLevel: number;
      },
    ) => {
      const { goldNeeded, nextWallet } = goldCostAfterInventory(
        node.wallet,
        spend,
        input.prices,
      );
      const wait = waitHoursToAfford(goldNeeded, nextWallet.gold, hourly);
      if (!Number.isFinite(wait)) return;
      anyNeighbor = true;
      const goldAfterWait = nextWallet.gold + wait * hourly;
      const paid: Wallet = {
        gold: goldAfterWait - goldNeeded,
        steel: nextWallet.steel,
        concrete: nextWallet.concrete,
      };
      const applied = apply(cloneFactories(node.factories));
      const tHours = node.time + wait;
      const dailyGoldAfter = dailyGoldFromFactories(applied.factories, input.extraGoldPerDay);
      const step: GrowthPlanStep = {
        tHours,
        action: applied.action,
        factoryId: applied.factoryId,
        fromLevel: applied.fromLevel,
        toLevel: applied.toLevel,
        dailyGoldAfter,
        deltaDailyGold: dailyGoldAfter - dailyBefore,
        goldSpent: goldNeeded,
      };
      heap.push(tHours, {
        time: tHours,
        factories: applied.factories,
        wallet: paid,
        steps: [...node.steps, step],
        series: [...node.series, { tHours, dailyGold: dailyGoldAfter }],
      });
    };

    for (let i = 0; i < node.factories.length; i++) {
      const f = node.factories[i]!;
      if (f.aeLevel >= MAX_AE_LEVEL) continue;
      const steel = steelForAeUpgrade(f.aeLevel);
      tryApply({ steel }, (factories) => {
        const fromLevel = factories[i]!.aeLevel;
        factories[i] = { ...factories[i]!, aeLevel: fromLevel + 1 };
        return {
          factories,
          action: "upgrade",
          factoryId: factories[i]!.id,
          fromLevel,
          toLevel: fromLevel + 1,
        };
      });
    }

    if (node.factories.length < maxCompanies) {
      const nextIndex = node.factories.length + 1;
      const concrete = concreteForNewCompany(nextIndex);
      tryApply({ concrete }, (factories) => {
        const factoryId = `new-${nextIndex}`;
        factories.push({
          id: factoryId,
          aeLevel: 1,
          goldPerAePerDay: input.newFactoryGoldPerAePerDay,
        });
        return { factories, action: "buy", factoryId, fromLevel: 0, toLevel: 1 };
      });
    }

    if (!anyNeighbor && hourly <= 0) stuck = true;
  }

  if (iter >= maxIterations) hitIterLimit = true;
  return {
    complete: false,
    stuck,
    hitIterLimit,
    timeToGoalHours: null,
    steps: bestIncomplete?.steps ?? [],
    series: bestIncomplete?.series ?? [{ tHours: 0, dailyGold: startDaily }],
    finalFactories: bestIncomplete?.factories ?? cloneFactories(input.factories),
  };
}
