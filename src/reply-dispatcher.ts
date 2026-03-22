import type { ClawdbotConfig, RuntimeEnv, ReplyPayload } from "openclaw/plugin-sdk";
import { createReplyPrefixContext } from "openclaw/plugin-sdk";
import { getMagnusRuntime } from "./runtime.js";
import type { MagnusWsClient } from "./ws-client.js";

export type CreateMagnusReplyDispatcherParams = {
  cfg: ClawdbotConfig;
  agentId: string;
  runtime: RuntimeEnv;
  replyTo: string;      // conversation_id
  accountId?: string;
  wsClient: MagnusWsClient;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type MagnusReplyDispatcherResult = { dispatcher: any; replyOptions: any; markDispatchIdle: () => void };

export function createMagnusReplyDispatcher(params: CreateMagnusReplyDispatcherParams): MagnusReplyDispatcherResult {
  const core = getMagnusRuntime();
  const { cfg, agentId, runtime, replyTo, accountId, wsClient } = params;

  const prefixContext = createReplyPrefixContext({ cfg, agentId });

  const textChunkLimit = core.channel.text.resolveTextChunkLimit(cfg, "magnus", accountId, { fallbackLimit: 4000 });
  const chunkMode = core.channel.text.resolveChunkMode(cfg, "magnus");

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
      deliver: async (payload: ReplyPayload) => {
        runtime.log?.(`magnus[${accountId}] deliver called: text=${payload.text?.slice(0, 100)}`);
        const text = payload.text ?? "";
        if (!text.trim()) {
          runtime.log?.(`magnus[${accountId}] deliver: empty text, skipping`);
          return;
        }

        const chunks = core.channel.text.chunkTextWithMode(text, textChunkLimit, chunkMode);
        runtime.log?.(`magnus[${accountId}] deliver: sending ${chunks.length} chunks to ${replyTo}`);

        for (const chunk of chunks) {
          try {
            wsClient.sendMessage(replyTo, chunk);
            runtime.log?.(`magnus[${accountId}] sendMessage success`);
          } catch (err) {
            runtime.error?.(`magnus[${accountId}] sendMessage failed: ${String(err)}`);
            throw err;
          }
        }
      },
      onError: (err, info) => {
        runtime.error?.(`magnus[${accountId}] ${info.kind} reply failed: ${String(err)}`);
      },
    });

  return {
    dispatcher,
    replyOptions: {
      ...replyOptions,
      onModelSelected: prefixContext.onModelSelected,
    },
    markDispatchIdle,
  };
}
