import { constructSortFn } from "@tanstack/react-table";

function isSortableNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Ascending compare; null / non-finite values sort after finite numbers. */
export const nullsLastSortingFn = constructSortFn({
  sort: (a, b) => {
    const aOk = isSortableNumber(a);
    const bOk = isSortableNumber(b);
    if (!aOk && !bOk) return 0;
    if (!aOk) return 1;
    if (!bOk) return -1;
    return a === b ? 0 : a < b ? -1 : 1;
  },
});
