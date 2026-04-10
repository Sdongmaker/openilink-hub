export const queryKeys = {
  user: () => ["user"] as const,

  admin: {
    astrBotBots: () => ["admin", "astrbot-bots"] as const,
    astrBotHealth: () => ["admin", "astrbot-health"] as const,
  },

  passkeys: () => ["passkeys"] as const,
  oauthAccounts: () => ["oauth-accounts"] as const,
  oauthProviders: () => ["oauth-providers"] as const,
} as const;
