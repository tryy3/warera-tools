export const queryKeys = {
  companies: (userId: string) => ["companies", userId] as const,
  growthBootstrap: (userId: string) => ["growth-bootstrap", userId] as const,
  skillsBootstrap: (userId: string) => ["skills-bootstrap", userId] as const,
};
