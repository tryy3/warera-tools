export type WatchReason = "manual" | "follow_player";

export type PlayerReason = {
  reason: WatchReason;
  sourceId: string;
};

export type PlayerView = {
  playerId: string;
  username: string | null;
  muId: string | null;
  workplaceCompanyId: string | null;
  reasons: PlayerReason[];
};

export type MuReason = {
  reason: WatchReason;
  sourceId: string;
  sourceUsername: string | null;
};

export type MuView = {
  muId: string;
  name: string | null;
  reasons: MuReason[];
};

export type FollowPlayersResponse = {
  players: PlayerView[];
};

export type FollowPlayerResponse = {
  player: PlayerView;
};

export type FollowMusResponse = {
  mus: MuView[];
};

export type FollowMuResponse = {
  mu: MuView;
};

export type SearchUsersResponse = {
  users: { userId: string; username: string }[];
};

export type SearchMusResponse = {
  mus: { muId: string; name: string }[];
};
