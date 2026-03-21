import type { MagnusNewMessageEvent } from "./types.js";

export type WsClientCallbacks = {
  onMessage: (event: MagnusNewMessageEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  log?: (msg: string) => void;
  error?: (msg: string) => void;
};

// 模块级客户端注册表，供 outbound.sendText 取用
const _registry = new Map<string, MagnusWsClient>();

export function registerWsClient(accountId: string, client: MagnusWsClient) {
  _registry.set(accountId, client);
}

export function unregisterWsClient(accountId: string) {
  _registry.delete(accountId);
}

export function getWsClient(accountId: string): MagnusWsClient | undefined {
  return _registry.get(accountId);
}

export class MagnusWsClient {
  private wsUrl: string;
  private accountId: string;
  private callbacks: WsClientCallbacks;
  private abortSignal?: AbortSignal;

  private ws: WebSocket | null = null;
  private stopped = false;
  private attempt = 0;
  private connectedAt = 0;

  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: {
    wsUrl: string;
    accountId: string;
    callbacks: WsClientCallbacks;
    abortSignal?: AbortSignal;
  }) {
    this.wsUrl = opts.wsUrl;
    this.accountId = opts.accountId;
    this.callbacks = opts.callbacks;
    this.abortSignal = opts.abortSignal;
  }

  start(): { stop(): void } {
    this.connect();
    this.abortSignal?.addEventListener("abort", () => this.stop());
    return { stop: () => this.stop() };
  }

  private connect() {
    if (this.stopped) return;

    const log = this.callbacks.log ?? (() => {});
    log(`magnus[${this.accountId}]: connecting (attempt ${this.attempt})`);

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch (err) {
      this.callbacks.error?.(`magnus[${this.accountId}]: failed to create WebSocket: ${String(err)}`);
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      log(`magnus[${this.accountId}]: connected`);
      // 若上次连接稳定超过 30s，则重置退避计数
      if (this.connectedAt && Date.now() - this.connectedAt > 30000) {
        this.attempt = 0;
      }
      this.connectedAt = Date.now();
      this.startPing();
      this.callbacks.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      let data: any;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        return;
      }

      if (data.type === "pong") {
        if (this.pongTimeout) {
          clearTimeout(this.pongTimeout);
          this.pongTimeout = null;
        }
        return;
      }

      if (data.type === "new_message") {
        this.callbacks.onMessage(data as MagnusNewMessageEvent);
      }
    };

    this.ws.onclose = () => {
      log(`magnus[${this.accountId}]: disconnected`);
      this.clearTimers();
      this.callbacks.onDisconnect?.();
      this.scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      this.callbacks.error?.(`magnus[${this.accountId}]: WebSocket error: ${String(err)}`);
    };
  }

  private startPing() {
    this.clearPingTimers();
    this.pingTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.ws.send(JSON.stringify({ type: "ping" }));
      // 10s 内没收到 pong 则断开重连
      this.pongTimeout = setTimeout(() => {
        this.callbacks.error?.(`magnus[${this.accountId}]: pong timeout, reconnecting`);
        this.ws?.close();
      }, 10000);
    }, 25000);
  }

  private clearPingTimers() {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    if (this.pongTimeout) { clearTimeout(this.pongTimeout); this.pongTimeout = null; }
  }

  private clearTimers() {
    this.clearPingTimers();
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }

  private scheduleReconnect() {
    if (this.stopped) return;
    const jitter = Math.floor(Math.random() * 1000);
    const delay = Math.min(1000 * Math.pow(2, this.attempt), 60000) + jitter;
    this.attempt++;
    this.callbacks.log?.(`magnus[${this.accountId}]: reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  stop() {
    this.stopped = true;
    this.clearTimers();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  sendMessage(conversationId: string, content: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`magnus[${this.accountId}]: not connected`);
    }
    this.ws.send(JSON.stringify({
      type: "send_message",
      conversation_id: conversationId,
      content,
    }));
  }
}
