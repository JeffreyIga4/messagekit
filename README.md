# SendKit

SendKit sends Telegram messages on behalf of an agent, script, or human — through whichever
interface fits: an MCP tool inside an AI agent, a local CLI, or a hosted remote MCP server gated
behind Clerk auth. All three share one validated core (`@caw-dev/sendkit-core`), so the send logic
and its input/output shapes are identical no matter which front end you use.

```
{ chatId, message }  --->  SendKit  --->  Telegram Bot API  --->  { ok, chatId, messageId }
```

## Contents

- [Why this exists](#why-this-exists)
- [Monorepo layout](#monorepo-layout)
- [Prerequisites](#prerequisites)
- [Getting a Telegram bot token](#getting-a-telegram-bot-token)
- [Try it yourself](#try-it-yourself)
  - [Option A — global CLI](#option-a--global-cli)
  - [Option B — local MCP server](#option-b--local-mcp-server)
  - [Option C — remote MCP server (self-hosted)](#option-c--remote-mcp-server-self-hosted)
- [Environment variables](#environment-variables)
- [Development setup](#development-setup)
- [Workspace scripts](#workspace-scripts)
- [Building an individual package](#building-an-individual-package)
- [Publishing a package](#publishing-a-package)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

## Why this exists

Agent tooling usually has to pick one integration surface — an MCP tool, or a CLI, or an HTTP
endpoint — and reimplement the same logic three times as needs grow. SendKit instead centralizes
Telegram's request/response shape and Zod validation in one core package, then wraps it three ways:

| Package | What it is | Who uses it |
|---|---|---|
| `@caw-dev/sendkit-core` | Validated `sendTelegramMessage()` function + Zod schemas, no I/O beyond the `fetch` call | Internal dependency of the other three |
| `@caw-dev/sendkit` | CLI (`sendkit` binary) | Terminals, shell scripts, manual testing |
| `@caw-dev/sendkit-mcp` | Local MCP server over stdio, exposes a `telegram` tool | MCP clients you run yourself (Claude Code, Claude Desktop, etc.) |
| `sendkit-remote-mcp` (`apps/remote-mcp`) | Hosted MCP server over HTTP, Clerk-authenticated, deployed on Railway | MCP clients connecting to a remote URL instead of a local process |

Because everything funnels through `sendkit-core`, a fix or feature added once (e.g. richer error
messages from the Telegram API) shows up identically in the CLI output, the MCP tool's
`structuredContent`, and the remote server's response.

## Monorepo layout

```
SendKit/
├── apps/
│   └── remote-mcp/        # Hono + MCP SDK + Clerk — hosted MCP server (sendkit-remote-mcp)
├── packages/
│   ├── core/               # sendTelegramMessage() + Zod schemas (@caw-dev/sendkit-core)
│   ├── cli/                 # `sendkit` CLI (@caw-dev/sendkit)
│   └── local-mcp/          # stdio MCP server (@caw-dev/sendkit-mcp)
├── skills/sendkit/          # Claude skill describing when/how to use SendKit
├── .mcp.json                # Local MCP server config for this repo's own Claude session
├── bunfig.toml              # Forces `bun run` to execute scripts under Bun, not system Node
└── tsconfig.json             # Shared base TS config, extended per package
```

It's a Bun workspaces monorepo (`apps/*`, `packages/*`) — `bun install` at the root wires up all
four packages with `workspace:*` links between them.

## Prerequisites

- **[Bun](https://bun.com)** ≥ 1.3 — this project uses Bun exclusively (see `CLAUDE.md`): no
  `npm`/`yarn`/`pnpm`, no `node`/`ts-node`, no `webpack`/`vite`.
- **A Telegram bot token** — see the next section if you don't have one.
- **A Telegram chat ID** to send to — the simplest way to get one is to message your bot directly,
  then call `https://api.telegram.org/bot<token>/getUpdates` and read `message.chat.id` from the
  response.
- **(Remote MCP only)** A [Clerk](https://clerk.com) application, for OAuth-protecting the hosted
  MCP endpoint.

## Getting a Telegram bot token

1. Open a chat with [@BotFather](https://t.me/BotFather) on Telegram.
2. Send `/newbot` and follow the prompts (name, username).
3. BotFather replies with a token shaped like `123456789:AA...` — that's your `TELEGRAM_BOT_TOKEN`.
4. Message your new bot at least once (or add it to a group) so Telegram has a chat to deliver to.

Treat this token as a secret: anyone who has it can send messages as your bot. Never commit it —
see [Security notes](#security-notes).

## Try it yourself

Pick whichever surface matches how you want to use SendKit. All three need the same bot token and
chat ID; they just source the token from different places.

### Option A — global CLI

Fastest way to confirm everything works end-to-end.

```sh
npm i -g @caw-dev/sendkit
# or, without installing globally:
bunx @caw-dev/sendkit <command>
```

```sh
# one-time setup — stores the token at ~/.config/sendkit/config.json (mode 0600)
sendkit init --telegram-bot-token <your-bot-token>

# send a message
sendkit telegram <chatId> "hello from sendkit"
# -> {"ok":true,"chatId":"<chatId>","messageId":123}
```

### Option B — local MCP server

Exposes a `telegram` tool to any MCP-compatible client (Claude Code, Claude Desktop, etc.) over
stdio. Add this to your client's MCP config (e.g. `.mcp.json`):

```json
{
  "mcpServers": {
    "sendkit": {
      "type": "stdio",
      "command": "bunx",
      "args": ["-y", "@caw-dev/sendkit-mcp"],
      "env": {
        "TELEGRAM_BOT_TOKEN": "<your-bot-token>"
      }
    }
  }
}
```

Reconnect your MCP client, and a `telegram` tool (input: `{ chatId, message }`) becomes available.
This repo ships its own `.mcp.json` (gitignored) wired up the same way, since it dogfoods SendKit
for its own Telegram notifications.

### Option C — remote MCP server (self-hosted)

`apps/remote-mcp` is a Hono server that exposes the same `telegram` tool over streamable HTTP,
gated behind Clerk OAuth, with the bot token supplied per-request in the URL path rather than
fixed server-side config — so one deployment can serve many different bots/tokens.

```sh
cd apps/remote-mcp
cp ../../.env .env               # or create your own — see Environment variables below
bun run start
# -> Started development server: http://localhost:3000
```

The MCP endpoint is `POST /:botToken/mcp`, protected by a Clerk-issued bearer token; an
unauthenticated request gets a `401` with a `WWW-Authenticate` header pointing at
`/.well-known/oauth-protected-resource/:botToken/mcp` for OAuth discovery. This is the version
deployed to Railway for a shared, always-on endpoint instead of a locally-run process.

## Environment variables

| Variable | Used by | Required for |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `packages/local-mcp` | Local MCP server only — the CLI and remote server get the token another way (CLI: `sendkit init`; remote: URL path) |
| `CLERK_PUBLISHABLE_KEY` | `apps/remote-mcp` | Remote MCP server auth |
| `CLERK_SECRET_KEY` | `apps/remote-mcp` | Remote MCP server auth |
| `PORT` | `apps/remote-mcp` | Optional, defaults to `3000` |

Bun auto-loads `.env` from the **current working directory** — it does not walk up to a monorepo
root. `apps/remote-mcp` needs its own `.env` (see `.env.example` for the shape); running from the
repo root and expecting the root `.env` to apply won't work for that app.

## Development setup

```sh
git clone https://github.com/JeffreyIga4/messagekit.git SendKit
cd SendKit
bun install
```

Copy `.env.example` to `.env` at the root and fill in `TELEGRAM_BOT_TOKEN` for local development
across packages that read it directly.

## Workspace scripts

Run from the repo root:

| Script | What it does |
|---|---|
| `bun run format` | Format the whole repo with `oxfmt` |
| `bun run format:check` | Check formatting without writing (CI-style) |
| `bun run lint` | Lint with `oxlint`, failing on warnings (`--deny-warnings`) |
| `bun run lint:fix` | Lint and auto-fix what `oxlint` can |
| `bun run typecheck` | `tsc --noEmit` across the workspace |
| `bun run dev:cli` | Run the CLI from source (`packages/cli/src/index.ts`) |
| `bun run dev:local-mcp` | Run the local MCP server from source |
| `bun run dev:remote-mcp` | Run the remote MCP server from source |
| `bun run build:core` / `build:cli` / `build:local-mcp` | Build one package via `--filter` |

This repo also has a `.vscode/settings.json` that sets `oxc.oxc-vscode` as the default formatter
with format-on-save enabled, so editing in VS Code auto-formats consistently with `bun run format`.

## Building an individual package

Each publishable package (`packages/core`, `packages/cli`, `packages/local-mcp`) builds with
[`tsdown`](https://tsdown.dev) (powered by `rolldown`) via its own `bun run build`:

```sh
cd packages/core
bun run build
```

Each package directory has its **own** `bunfig.toml` (`[run] bun = true`). This matters because
`tsdown`'s and `rolldown`'s CLI entry points carry `#!/usr/bin/env node` shebangs — without a
`bunfig.toml` in the directory you're running from, a shell invocation honors that shebang and
executes your system `node` instead of Bun. On an Apple Silicon Mac with an x64 (Rosetta) `node` on
`PATH`, that mismatch makes native bindings (`rolldown`, `oxfmt`) fail to resolve, since `bun
install` only fetches the binding matching Bun's own architecture. `bunfig.toml` isn't inherited
across directories, so it's duplicated in the root and in each package that builds/publishes
standalone.

## Publishing a package

```sh
cd packages/<core|cli|local-mcp>
bun publish --access public
```

`bun publish` runs `prepublishOnly` (`bun run build`) under Bun's own runtime, avoiding the
shebang/Rosetta issue above that plain `npm publish` can hit on Apple Silicon. If your npm account
has 2FA enabled, you may need `--otp=<code>` or a granular access token with "bypass 2FA" enabled.

Version numbers are permanently non-reusable per package name on the npm registry, even after an
unpublish — bump the version before republishing if you hit a `403 cannot publish over previously
published version` error.

## Security notes

- **Never commit a bot token.** `.env*` (except `.env.example`) and `.mcp.json` are gitignored
  repo-wide specifically so real tokens can't land in git history by accident.
- The CLI stores its token at `~/.config/sendkit/config.json` with `0600` permissions — a separate
  credential store from the MCP server's environment variable, so configuring one doesn't
  configure the other.
- If you ever spot a token in a diff, comment, or log output, treat it as compromised: rotate it
  via [@BotFather](https://t.me/BotFather) immediately, regardless of whether the exposure was
  pushed anywhere.

## Troubleshooting

- **"Telegram bot token is required. Run `sendkit init`."** — the CLI has no stored token yet.
- **"TELEGRAM_BOT_TOKEN is required."** (local MCP) — the MCP client's server config needs a
  `TELEGRAM_BOT_TOKEN` in its `env` block; it isn't read from a `.env` file.
- **A Telegram API error in the response's `description` field** — usually an invalid `chatId`
  (the bot must have received at least one message from that chat first) or a revoked/incorrect
  bot token.
- **`bun run <script>` fails with a native-binding `MODULE_NOT_FOUND` error mentioning
  `darwin-x64`/`darwin-universal` on an Apple Silicon Mac** — see the `bunfig.toml` explanation
  under [Building an individual package](#building-an-individual-package); you're likely missing a
  `bunfig.toml` in the directory you ran the command from.
- **`CLERK_PUBLISHABLE_KEY environmant variable is required`** when starting `apps/remote-mcp` —
  its `.env` needs to exist in `apps/remote-mcp/` itself, not just at the repo root (see
  [Environment variables](#environment-variables)).
