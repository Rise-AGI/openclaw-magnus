export interface MagnusAccountConfig {
  enabled?: boolean;
  name?: string;
  appSecret: string;
  magnusUrl: string;  // e.g. "https://your-server"，无末尾斜杠
}

export interface MagnusConfig {
  enabled?: boolean;
  // 简化配置（单账号，顶级字段）
  appSecret?: string;
  magnusUrl?: string;
  name?: string;
  // 多账号配置
  accounts?: Record<string, MagnusAccountConfig | undefined>;
}

export const MagnusConfigSchema = {
  type: "object" as const,
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    appSecret: { type: "string" },
    magnusUrl: { type: "string" },
    name: { type: "string" },
    accounts: {
      type: "object" as const,
      additionalProperties: {
        type: "object" as const,
        additionalProperties: true,
        properties: {
          enabled: { type: "boolean" },
          name: { type: "string" },
          appSecret: { type: "string" },
          magnusUrl: { type: "string" },
        },
        required: ["appSecret", "magnusUrl"],
      },
    },
  },
};
