---
name: sendkit
description: Send Telegram messages through SendKit, using either its MCP tool (the "telegram" tool exposed by a SendKit MCP server) or the sendkit CLI as a fallback. Use this skill whenever a user asks to send a Telegram message, mentions SendKit, wants to interact with the SendKit toolset, wants to verify SendKit is configured and working, or needs help deciding between the SendKit MCP and CLI workflows — even if they don't say "SendKit" by name and just ask to "message someone on Telegram" or "ping this chat ID."
---

# SendKit

SendKit sends Telegram messages on behalf of an agent or user. It ships two interchangeable
front ends over the same send logic:

- **MCP tool** — a `telegram` tool exposed by a SendKit MCP server (local `@caw-dev/sendkit-mcp`,
  or a hosted remote server). Takes `{ chatId, message }` and returns
  `{ ok, chatId, messageId }`.
- **CLI** — the `sendkit` command (`sendkit telegram <chatId> <message>`), for use outside an
  MCP-connected agent, in scripts, or for manual verification.

Both need a Telegram bot token, but they source it from different places — see Credentials below.

## Choosing MCP vs. CLI

1. **Check for the MCP tool first.** If a `telegram` tool from a SendKit MCP server is available
   in this session (e.g. named `mcp__sendkit__telegram`, or similarly per the connected server),
   prefer it and call it directly with `chatId` and `message`. It's already authenticated through
   the MCP server's own environment, so there's nothing to configure.
2. **Fall back to the CLI when there's no MCP tool available** — e.g. you're operating outside an
   MCP-connected client, no SendKit MCP server is configured for this environment, or the user
   explicitly wants a terminal/script-based flow instead of a tool call.
3. **Use the CLI to verify SendKit manually.** It prints the raw JSON result to stdout, which
   makes it the fastest way for a human to confirm a bot token and chat ID actually work,
   independent of whichever agent or MCP client is otherwise involved.

If the MCP tool isn't in the currently listed tools, it may just be deferred rather than absent —
search for it (e.g. `ToolSearch` with `"select:mcp__sendkit__telegram"`, adjusting the name to
match the connected server) before falling back to the CLI.

## MCP workflow

Call the `telegram` tool with:

```json
{ "chatId": "<telegram chat id>", "message": "<text to send>" }
```

It returns `{ ok: true, chatId, messageId }` on success. Report the `messageId` back to the user
as confirmation the message actually sent, rather than just saying "sent."

## CLI fallback workflow

```sh
# one-time setup — stores the bot token at ~/.config/sendkit/config.json
sendkit init --telegram-bot-token <token>

# send a message
sendkit telegram <chatId> "<message text>"
```

If `sendkit` isn't installed globally in this environment, run it via
`bunx @caw-dev/sendkit <command>` (this project defaults to Bun over npm/npx). The CLI prints the
same `{ ok, chatId, messageId }` JSON shape the MCP tool returns, which makes it easy to script or
compare against expected output when verifying a change to SendKit itself.

## Credentials

Never inline a bot token into a skill invocation, code, commit, or chat output — always let it
come from configuration, and treat any token you do encounter as a secret (don't log it, echo it
back in full, or write it into a file that isn't already its dedicated config store):

- **MCP server** reads `TELEGRAM_BOT_TOKEN` from its own process environment, set via the MCP
  client's server config (e.g. the `env` block in `.mcp.json`).
- **CLI** reads a token saved locally by `sendkit init`, stored at
  `~/.config/sendkit/config.json` — a separate credential store from the MCP server's environment
  variable, so running `init` doesn't configure the MCP path and vice versa.

If a chat ID or bot token isn't already known, ask the user for it rather than guessing or reusing
a value spotted elsewhere in the conversation or repo.

## Troubleshooting

- **"Telegram bot token is required. Run `sendkit init`."** — the CLI has no stored token yet; run
  `sendkit init --telegram-bot-token <token>`.
- **"TELEGRAM_BOT_TOKEN is required."** (MCP) — the MCP server process doesn't have the env var
  set; it needs to be configured in the MCP client's server config, not passed per call.
- **Telegram API error in the response's `description` field** — usually an invalid `chatId` (the
  target must have started a chat with, or added, the bot first) or a revoked/incorrect bot token.
