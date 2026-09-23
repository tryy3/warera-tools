export const queryKeys = {
  battleBuildImport: (userId: string) => ["battle-build-import", userId] as const,
  companies: (userId: string) => ["companies", userId] as const,
  growthBootstrap: (userId: string) => ["growth-bootstrap", userId] as const,
  muFightDesk: (muId: string) => ["mu-fight-desk", muId] as const,
  user: (userId: string) => ["user", userId] as const,
};
