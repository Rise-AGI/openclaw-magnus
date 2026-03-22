export type { MagnusConfig, MagnusAccountConfig } from "./config-schema.js";

export type ResolvedMagnusAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  name?: string;
  appSecret: string;
  magnusUrl: string;
  wsUrl: string;       // ws(s)://host/ws/chat?app_secret=...
  botUserId?: string;  // 启动时从 GET /api/users/self 获取，用于过滤自消息
};

// Magnus WS 服务端推送的 new_message 事件
export type MagnusNewMessageEvent = {
  type: "new_message";
  conversation_id: string;
  message: {
    id: string;
    conversation_id: string;
    sender_id: string;
    content: string;
    message_type: string;  // "text" | "image" | "file" | "system"
    created_at: string;
    sender: {
      id: string;
      name: string;
      avatar_url?: string;
      email?: string;
    } | null;
  };
};
