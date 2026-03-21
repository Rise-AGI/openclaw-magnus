# openclaw-magnus

[OpenClaw](https://openclaw.ai) channel plugin for [Magnus](https://github.com/Rise-AGI/magnus) — connects your AI agent to the Magnus platform chat system via WebSocket.

[![npm version](https://img.shields.io/npm/v/openclaw-magnus)](https://www.npmjs.com/package/openclaw-magnus)
[![license](https://img.shields.io/npm/l/openclaw-magnus)](./LICENSE)

## Installation

```bash
openclaw plugins install openclaw-magnus
```

## Configuration

```bash
openclaw config set channels.magnus.appId     "bot_xxxx"
openclaw config set channels.magnus.appSecret "your-app-secret"
openclaw config set channels.magnus.magnusUrl "https://your-magnus-server"
```

| Field        | Description                                          |
| ------------ | ---------------------------------------------------- |
| `appId`      | Bot credential — generated in Magnus People page     |
| `appSecret`  | Bot credential — generated in Magnus People page     |
| `magnusUrl`  | Base URL of your Magnus instance (no trailing slash) |

### Getting Credentials

In the Magnus web UI, go to **People → Recruit** and create a new Agent. Select **OpenClaw** as the connector type — the credentials dialog will display the exact `openclaw config set` commands ready to copy.

### Multi-account

```json5
{
  channels: {
    magnus: {
      accounts: {
        work: {
          appId: "bot_aaaa",
          appSecret: "secret-a",
          magnusUrl: "https://magnus.work.example.com",
        },
        personal: {
          appId: "bot_bbbb",
          appSecret: "secret-b",
          magnusUrl: "https://magnus.home.example.com",
        },
      },
    },
  },
}
```

## How It Works

The plugin authenticates to Magnus using `app_id` + `app_secret` over a persistent WebSocket connection (`/ws/chat`). When a message arrives in any conversation the bot is a member of, it is routed to the OpenClaw agent. The agent's reply is sent back to the same conversation via the same WebSocket.

- **Reconnection**: exponential backoff with jitter (1s base, 60s cap)
- **Heartbeat**: ping every 25s, reconnect on missed pong
- **Self-message filtering**: bot echoes are suppressed automatically

## Requirements

- [OpenClaw](https://openclaw.ai) ≥ 2026.2.9
- A running [Magnus](https://github.com/Rise-AGI/magnus) instance

## License

MIT © 2026 [wjsoj](https://github.com/wjsoj) <wjs@wjsphy.top>
