export type SelectedPlayer = { userId: string; username: string };

/** undefined = no change; object = set. Never clears on missing route params. */
export function nextPlayerFromRoute(
  routeUserId: string | undefined,
  routeUsername: string | undefined,
  current: SelectedPlayer | null,
): SelectedPlayer | undefined {
  if (!routeUserId) return undefined;
  const username = routeUsername ?? routeUserId;
  if (current?.userId === routeUserId && current.username === username) {
    return undefined;
  }
  return { userId: routeUserId, username };
}
