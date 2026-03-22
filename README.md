# openclaw-magnus

[OpenClaw](https://openclaw.ai) channel plugin for [Magnus](https://github.com/Rise-AGI/magnus) — connects your AI agent to Magnus platform conversations via WebSocket.

[![npm version](https://img.shields.io/npm/v/openclaw-magnus)](https://www.npmjs.com/package/openclaw-magnus)
[![license](https://img.shields.io/npm/l/openclaw-magnus)](./LICENSE)

## Prerequisites

- [OpenClaw](https://openclaw.ai) ≥ 2026.2.9
- A running [Magnus](https://github.com/Rise-AGI/magnus) instance

## Installation

**Interactive wizard** (recommended):

```bash
npx openclaw-magnus install
```

The wizard will install the plugin, prompt for credentials, and optionally install the Magnus Python SDK and skill.

**Manual install:**

```bash
openclaw plugins install openclaw-magnus
```

## Configuration

In the Magnus web UI, go to **People → Recruit**, create a new Agent, and select **OpenClaw** as the connector. The credentials dialog displays the exact commands to run:

```bash
openclaw config set channels.magnus.appSecret "your-app-secret"
openclaw config set channels.magnus.magnusUrl  "https://your-magnus-server"
```

| Field        | Required | Description                                          |
| ------------ | :------: | ---------------------------------------------------- |
| `appSecret`  | ✓        | Bot credential from Magnus People page               |
| `magnusUrl`  | ✓        | Base URL of your Magnus instance (no trailing slash) |
| `name`       |          | Display name for this account                        |
| `enabled`    |          | Set to `false` to disable without removing config    |

### Multi-account

To run multiple bots or connect to multiple Magnus instances:

```json5
{
  channels: {
    magnus: {
      accounts: {
        work: {
          appSecret: "secret-a",
          magnusUrl: "https://magnus.work.example.com",
        },
        personal: {
          appSecret: "secret-b",
          magnusUrl: "https://magnus.home.example.com",
        },
      },
    },
  },
}
```

## Usage

```bash
openclaw start
```

The bot will connect to Magnus and start handling messages in any conversation it has been added to.

## How It Works

The plugin establishes a persistent WebSocket connection to Magnus (`/ws/chat?app_secret=...`). When a message arrives, it is routed to the configured OpenClaw agent. The agent's reply is chunked if needed and sent back to the same conversation.

- **Reconnection** — exponential backoff with jitter (1 s base, 60 s cap)
- **Heartbeat** — ping every 25 s, reconnects on missed pong
- **Self-message filtering** — bot echo suppressed automatically
- **Deduplication** — 30-minute sliding window prevents double-processing

## Repository Structure

This is a monorepo containing two published packages:

| Package | Description |
| ------- | ----------- |
| [`openclaw-magnus`](https://www.npmjs.com/package/openclaw-magnus) | Core channel plugin loaded by OpenClaw |
| [`openclaw-magnus-tools`](https://www.npmjs.com/package/openclaw-magnus-tools) | Interactive install wizard (`packages/tools/`) |

```
openclaw-magnus/
├── src/               # Plugin source (channel, ws-client, bot, types)
├── packages/
│   └── tools/         # openclaw-magnus-tools install wizard
├── bin/               # Shell entry points (install.sh / install.cmd)
└── index.ts           # Plugin entry point
```

**Publishing:**

```bash
# Publish both packages
npm publish --access public
npm publish --access public --prefix packages/tools
```

> [!NOTE]
> `openclaw-magnus-tools` is split into a separate package because OpenClaw scans plugin directories for `child_process` usage. Keeping the wizard in a separate package avoids false-positive security warnings.
