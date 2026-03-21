import type { ClawdbotConfig, RuntimeEnv } from "openclaw/plugin-sdk";
import { getMagnusRuntime } from "./runtime.js";
import { createMagnusReplyDispatcher } from "./reply-dispatcher.js";
import type { MagnusNewMessageEvent, ResolvedMagnusAccount } from "./types.js";
import { getWsClient } from "./ws-client.js";

// 消息去重
const processedMessages = new Map<string, number>();
const DEDUP_WINDOW_MS = 30 * 60 * 1000;
const DEDUP_MAX_SIZE = 1000;
const DEDUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

let lastCleanup = Date.now();

function tryRecordMessage(messageId: string): boolean {
  const now = Date.now();

  if (now - lastCleanup > DEDUP_CLEANUP_INTERVAL_MS) {
    lastCleanup = now;
    for (const [id, ts] of processedMessages) {
      if (now - ts > DEDUP_WINDOW_MS) processedMessages.delete(id);
    }
  }

  if (processedMessages.size >= DEDUP_MAX_SIZE) {
    const oldest = processedMessages.keys().next().value;
    if (oldest) processedMessages.delete(oldest);
  }

  if (processedMessages.has(messageId)) return false;
  processedMessages.set(messageId, now);
  return true;
}

export async function handleMagnusMessage(params: {
  cfg: ClawdbotConfig;
  event: MagnusNewMessageEvent;
  runtime?: RuntimeEnv;
  accountId: string;
  account: ResolvedMagnusAccount;
}): Promise<void> {
  const { cfg, event, runtime, accountId, account } = params;
  const msg = event.message;

  const log = runtime?.log ?? console.log;
  const error = runtime?.error ?? console.error;

  // 过滤 bot 自己发出的消息回显
  if (account.botUserId && msg.sender_id === account.botUserId) {
    return;
  }

  // 去重
  if (!tryRecordMessage(msg.id)) {
    log(`magnus[${accountId}]: skipping duplicate message ${msg.id}`);
    return;
  }

  // 只处理文本消息
  if (msg.message_type !== "text") {
    log(`magnus[${accountId}]: ignoring non-text message type: ${msg.message_type}`);
    return;
  }

  log(`magnus[${accountId}]: received message from ${msg.sender_id} in conversation ${event.conversation_id}`);

  try {
    const core = getMagnusRuntime();
    const peerId = event.conversation_id;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "magnus",
      accountId,
      peer: {
        kind: "group",
        id: peerId,
      },
    });

    const preview = msg.content.replace(/\s+/g, " ").slice(0, 160);
    core.system.enqueueSystemEvent(
      `Magnus[${accountId}] message in conversation ${peerId}: ${preview}`,
      {
        sessionKey: route.sessionKey,
        contextKey: `magnus:message:${peerId}:${msg.id}`,
      },
    );

    const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
    const speaker = msg.sender?.name || msg.sender_id;
    const messageBody = `${speaker}: ${msg.content}`;

    const body = core.channel.reply.formatAgentEnvelope({
      channel: "Magnus",
      from: `${peerId}:${msg.sender_id}`,
      timestamp: new Date(msg.created_at),
      envelope: envelopeOptions,
      body: messageBody,
    });

    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: body,
      RawBody: msg.content,
      CommandBody: msg.content,
      From: `magnus:${msg.sender_id}`,
      To: `conversation:${peerId}`,
      SessionKey: route.sessionKey,
      AccountId: route.accountId,
      ChatType: "group",
      GroupSubject: peerId,
      SenderName: speaker,
      SenderId: msg.sender_id,
      Provider: "magnus" as const,
      Surface: "magnus" as const,
      MessageSid: msg.id,
      Timestamp: Date.now(),
      WasMentioned: false,
      CommandAuthorized: true,
      OriginatingChannel: "magnus" as const,
      OriginatingTo: `conversation:${peerId}`,
    });

    const wsClient = getWsClient(accountId);
    if (!wsClient) {
      error(`magnus[${accountId}]: no active WS client for reply`);
      return;
    }

    const { dispatcher, replyOptions, markDispatchIdle } = createMagnusReplyDispatcher({
      cfg,
      agentId: route.agentId,
      runtime: runtime as RuntimeEnv,
      replyTo: peerId,
      accountId,
      wsClient,
    });

    log(`magnus[${accountId}]: dispatching to agent (session=${route.sessionKey})`);

    const { queuedFinal, counts } = await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();

    log(`magnus[${accountId}]: dispatch complete (queuedFinal=${queuedFinal}, replies=${counts.final})`);
  } catch (err) {
    error(`magnus[${accountId}]: failed to dispatch message: ${String(err)}`);
  }
}
