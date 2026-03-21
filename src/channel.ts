import type { ChannelPlugin, ClawdbotConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID } from "openclaw/plugin-sdk";
import type { ResolvedMagnusAccount, MagnusConfig, MagnusAccountConfig } from "./types.js";
import { MagnusConfigSchema } from "./config-schema.js";
import { MagnusWsClient, registerWsClient, unregisterWsClient } from "./ws-client.js";
import { handleMagnusMessage } from "./bot.js";

const PLUGIN_META = {
  id: "magnus",
  label: "Magnus",
  selectionLabel: "Magnus Chat",
  docsPath: "/channels/magnus",
  docsLabel: "magnus",
  blurb: "Magnus platform chat channel via WebSocket",
  order: 70,
} as const;

function buildWsUrl(magnusUrl: string, appId: string, appSecret: string): string {
  const wsBase = magnusUrl.replace(/^http/, "ws");
  return `${wsBase}/ws/chat?app_id=${encodeURIComponent(appId)}&app_secret=${encodeURIComponent(appSecret)}`;
}

async function resolveMagnusAccount({
  cfg,
  accountId,
}: {
  cfg: ClawdbotConfig;
  accountId: string;
}): Promise<ResolvedMagnusAccount> {
  const magnusCfg = cfg.channels?.magnus as MagnusConfig | undefined;
  const isDefault = accountId === DEFAULT_ACCOUNT_ID;

  let accountCfg: MagnusAccountConfig | undefined;
  let enabled: boolean;

  if (isDefault) {
    accountCfg = {
      appId: magnusCfg?.appId || "",
      appSecret: magnusCfg?.appSecret || "",
      magnusUrl: magnusCfg?.magnusUrl || "",
      name: magnusCfg?.name,
      ...magnusCfg?.accounts?.default,
    };
    enabled = accountCfg.enabled ?? magnusCfg?.enabled ?? true;
  } else {
    accountCfg = magnusCfg?.accounts?.[accountId];
    enabled = accountCfg?.enabled ?? true;
  }

  if (!accountCfg?.appId) {
    throw new Error(
      `缺少 App ID 配置。\n` +
        `请配置: openclaw config set channels.magnus.appId "bot_xxxx"`,
    );
  }

  if (!accountCfg?.appSecret) {
    throw new Error(
      `缺少 App Secret 配置。\n` +
        `请配置: openclaw config set channels.magnus.appSecret "your-secret"`,
    );
  }

  if (!accountCfg?.magnusUrl) {
    throw new Error(
      `缺少 Magnus URL 配置。\n` +
        `请配置: openclaw config set channels.magnus.magnusUrl "https://your-server"`,
    );
  }

  const magnusUrl = accountCfg.magnusUrl.replace(/\/$/, "");

  return {
    accountId,
    enabled,
    configured: true,
    name: accountCfg.name,
    appId: accountCfg.appId,
    appSecret: accountCfg.appSecret,
    magnusUrl,
    wsUrl: buildWsUrl(magnusUrl, accountCfg.appId, accountCfg.appSecret),
  };
}

function listMagnusAccountIds(cfg: ClawdbotConfig): string[] {
  const magnusCfg = cfg.channels?.magnus as MagnusConfig | undefined;

  if (magnusCfg?.appId) {
    return [DEFAULT_ACCOUNT_ID];
  }

  const accounts = magnusCfg?.accounts;
  if (!accounts) return [];

  return Object.keys(accounts).filter((id) => accounts[id]?.enabled !== false);
}

export const magnusPlugin: ChannelPlugin<ResolvedMagnusAccount> = {
  id: "magnus",

  meta: PLUGIN_META,

  capabilities: {
    chatTypes: ["direct", "channel"],
    polls: false,
    threads: false,
    media: false,
    reactions: false,
    edit: false,
    reply: false,
  },

  agentPrompt: {
    messageToolHints: () => [
      "- Magnus targeting: use the conversation ID as the peer ID (e.g., `<conversation_id>`).",
      "- Magnus supports text messages only.",
    ],
  },

  configSchema: {
    schema: MagnusConfigSchema,
  },

  config: {
    listAccountIds: (cfg) => listMagnusAccountIds(cfg),

    resolveAccount: (cfg, accountId) => resolveMagnusAccount({ cfg, accountId }),

    defaultAccountId: (cfg) => {
      const ids = listMagnusAccountIds(cfg);
      return ids[0] || DEFAULT_ACCOUNT_ID;
    },

    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const magnusCfg = cfg.channels?.magnus as MagnusConfig | undefined;
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            magnus: { ...magnusCfg, enabled },
          },
        };
      }

      const account = magnusCfg?.accounts?.[accountId];
      if (!account) throw new Error(`Account ${accountId} not found`);

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          magnus: {
            ...magnusCfg,
            accounts: {
              ...magnusCfg?.accounts,
              [accountId]: { ...account, enabled },
            },
          },
        },
      };
    },

    deleteAccount: ({ cfg, accountId }) => {
      const magnusCfg = cfg.channels?.magnus as MagnusConfig | undefined;
      const isDefault = accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        const next = { ...cfg } as ClawdbotConfig;
        const nextChannels = { ...cfg.channels };
        delete (nextChannels as Record<string, unknown>).magnus;
        if (Object.keys(nextChannels).length > 0) {
          next.channels = nextChannels;
        } else {
          delete next.channels;
        }
        return next;
      }

      const accounts = { ...magnusCfg?.accounts };
      delete accounts[accountId];

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          magnus: {
            ...magnusCfg,
            accounts: Object.keys(accounts).length > 0 ? accounts : undefined,
          },
        },
      };
    },

    isConfigured: () => true,

    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name || account.accountId,
    }),

    resolveAllowFrom: () => [],
    formatAllowFrom: ({ allowFrom }) => allowFrom.map(String),
  },

  security: {
    collectWarnings: () => [],
  },

  setup: {
    resolveAccountId: () => DEFAULT_ACCOUNT_ID,

    applyAccountConfig: ({ cfg, accountId }) => {
      const magnusCfg = cfg.channels?.magnus as MagnusConfig | undefined;
      const isDefault = !accountId || accountId === DEFAULT_ACCOUNT_ID;

      if (isDefault) {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            magnus: { ...magnusCfg, enabled: true },
          },
        };
      }

      return {
        ...cfg,
        channels: {
          ...cfg.channels,
          magnus: {
            ...magnusCfg,
            accounts: {
              ...magnusCfg?.accounts,
              [accountId]: {
                ...magnusCfg?.accounts?.[accountId],
                enabled: true,
              },
            },
          },
        },
      };
    },
  },

  messaging: {
    normalizeTarget: (target) => {
      // Magnus uses conversation IDs directly
      return { type: "channel", id: target };
    },

    targetResolver: {
      looksLikeId: (id) => id.length >= 16 && /^[0-9a-f]+$/.test(id),
      hint: "<conversation_id>",
    },
  },

  directory: {
    self: async () => null,

    listPeers: async () => {
      // Magnus REST API 暂不支持 bot 鉴权，返回空列表
      return [];
    },

    listGroups: async () => {
      // Magnus REST API 暂不支持 bot 鉴权，返回空列表
      return [];
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      port: null,
    },

    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      port: snapshot.port ?? null,
    }),

    probeAccount: async ({ cfg, accountId }) => {
      try {
        const account = await resolveMagnusAccount({ cfg, accountId });
        // 尝试 HTTP 探测 Magnus 服务是否可达
        const resp = await fetch(`${account.magnusUrl}/api/users/self?app_id=${encodeURIComponent(account.appId)}&app_secret=${encodeURIComponent(account.appSecret)}`);
        if (resp.ok) {
          const data = await resp.json();
          return { ok: true, botUserId: data.id };
        }
        return { ok: false, error: `HTTP ${resp.status}` };
      } catch (err: any) {
        return { ok: false, error: err.message };
      }
    },

    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: account.configured,
      name: account.name,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      port: runtime?.port ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const { cfg, accountId, abortSignal, setStatus, log } = ctx;
      const account = await resolveMagnusAccount({ cfg, accountId });

      log?.info(`Starting Magnus account: ${accountId}`);
      log?.info(`Magnus URL: ${account.magnusUrl}`);

      // 获取 bot 自身 user_id，用于过滤自消息回显
      try {
        const resp = await fetch(
          `${account.magnusUrl}/api/users/self?app_id=${encodeURIComponent(account.appId)}&app_secret=${encodeURIComponent(account.appSecret)}`,
        );
        if (resp.ok) {
          const data = await resp.json();
          account.botUserId = data.id;
          log?.info(`Bot user ID: ${account.botUserId}`);
        } else {
          log?.warn(`Failed to fetch bot self (HTTP ${resp.status}), self-message filtering disabled`);
        }
      } catch (err) {
        log?.warn(`Failed to fetch bot self: ${String(err)}, self-message filtering disabled`);
      }

      const wsClient = new MagnusWsClient({
        wsUrl: account.wsUrl,
        accountId,
        callbacks: {
          onMessage: (event) => {
            handleMagnusMessage({
              cfg,
              event,
              runtime: ctx.runtime,
              accountId,
              account,
            }).catch((err) => {
              log?.error(`Failed to handle Magnus message: ${String(err)}`);
            });
          },
          onConnect: () => {
            setStatus({ accountId, running: true });
            log?.info(`Magnus account ${accountId} connected`);
          },
          onDisconnect: () => {
            log?.warn(`Magnus account ${accountId} disconnected, will reconnect`);
          },
          log: (msg) => log?.info(msg),
          error: (msg) => log?.error(msg),
        },
        abortSignal,
      });

      registerWsClient(accountId, wsClient);
      const { stop } = wsClient.start();
      setStatus({ accountId, running: true });

      return {
        async stop() {
          stop();
          unregisterWsClient(accountId);
          setStatus({ accountId, running: false });
        },
      };
    },
  },

  outbound: {
    async sendText({ cfg, to, text, accountId }) {
      const { getWsClient } = await import("./ws-client.js");
      const wsClient = getWsClient(accountId);
      if (!wsClient) {
        throw new Error(`magnus[${accountId}]: no active connection`);
      }
      wsClient.sendMessage(to.id, text);
      return {
        channel: "magnus",
        messageId: "",
        timestamp: Date.now(),
      };
    },
  },
};
