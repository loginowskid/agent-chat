# Agent Chat

> Standalone chat widget for OpenClaw agents. Embeddable or standalone.

Zero-dependency embeddable chat panel that connects to an OpenClaw Gateway WebSocket.

## Quick Start

1. Copy the widget files into your project's static/web directory
2. Add to your HTML:
   ```html
   <script src="agent-chat.js"
       data-server="ws://localhost:18789"
       data-token="YOUR_GATEWAY_TOKEN">
   </script>
   ```
3. That's it. No Python server, no dependencies, no build step.

## How It Works

The widget connects to the OpenClaw Gateway WebSocket and uses the Gateway protocol:
- `connect` — authenticate with shared-secret token
- `chat.history` — fetch message history
- `chat.send` — send a user message (triggers agent run)
- `chat.inject` — inject assistant note without triggering a run

Messages are pushed from the Gateway as events when the agent replies.

## Embedding in Existing UI

Mount into a specific container:

```html
<div id="my-chat" style="height: 400px;"></div>
<script src="agent-chat.js"
    data-mount="#my-chat"
    data-server="ws://localhost:18789"
    data-token="YOUR_GATEWAY_TOKEN"
    data-title="AI Assistant">
</script>
```

## Floating Bubble (Default)

When no `data-mount` is specified, creates a chat bubble in the corner:

```html
<script src="agent-chat.js"
    data-server="ws://localhost:18789"
    data-token="YOUR_GATEWAY_TOKEN"
    data-position="bottom-right">
</script>
```

## Modular ChatPanel (for host app integration)

For embedding in an existing app with custom toolbar layout:

```html
<link rel="stylesheet" href="chat-panel.css">
<script src="chat-panel.js"></script>
<script>
    ChatPanel.mount(document.getElementById('chat-area'), {
        server: 'ws://localhost:18789',
        token: 'YOUR_GATEWAY_TOKEN',
        theme: 'dark'
    });
    var ctrl = ChatPanel.getControls();
    // ctrl.dot, ctrl.themeBtn
</script>
```

## Gateway Auth

The widget authenticates using the Gateway shared-secret token (`data-token`).
Configure the token in your OpenClaw Gateway config:

```yaml
gateway:
  auth:
    mode: shared-secret
    token: YOUR_GATEWAY_TOKEN
```

Or via environment: `OPENCLAW_GATEWAY_TOKEN=YOUR_GATEWAY_TOKEN`

## Theming

Override CSS custom properties (all prefixed `--ac-`):

```css
.agent-chat-root {
    --ac-bg: #ffffff;
    --ac-surface: #f8f8f8;
    --ac-text: #1a1a1a;
    --ac-accent: #0066ff;
    --ac-user-bubble: #e8f0fe;
    --ac-ai-bubble: #f4f4f4;
    --ac-border: #e0e0e0;
    --ac-radius: 12px;
    --ac-font: 'Inter', sans-serif;
}
```

### Theme Toggle

Built-in light/dark toggle (persisted to localStorage). Programmatic:

```javascript
AgentChat.setTheme('light');
AgentChat.setTheme('dark');
```

## Configuration Options

All via `data-*` attributes on the script tag:

| Attribute | Default | Description |
|-----------|---------|-------------|
| `data-server` | current origin (ws) | Gateway WebSocket URL |
| `data-token` | (none) | Gateway auth token (shared-secret) |
| `data-title` | "Chat" | Header title |
| `data-theme` | "dark" | "dark" or "light" |
| `data-position` | "bottom-right" | Floating position |
| `data-mount` | (none) | CSS selector for embed target |
| `data-css` | auto-detected | URL to agent-chat.css |

## JavaScript API

```javascript
AgentChat.send("Hello");              // Send message via Gateway
AgentChat.inject("Note text");        // Inject assistant note
AgentChat.connect();                  // Reconnect WS
AgentChat.setTheme("light");          // Switch theme
AgentChat.destroy();                  // Remove widget
```

## Topic Tag

Messages may carry an optional `topic` field from the Gateway. When present, a subtle one-word tag is rendered next to the message timestamp — small font, muted color, italic. No user-facing topic management UI exists; the topic/catalog system runs invisibly on the backend.

The CSS class `.ac-topic-tag` controls the tag appearance.

## Why Agent Chat > Telegram

The in-app chat widget is the primary interface — Telegram is a fallback.

| | Agent Chat (WebSocket) | Telegram |
|---|---|---|
| **Latency** | Real-time bidirectional WebSocket — sub-100ms round-trip | Polling + bot API relay, 1–3s minimum |
| **Context** | Runs inside the app — sees the scene, viewport, logs, parameters in context | Isolated text channel, zero app awareness |
| **Rich output** | Inline code blocks, status cards, action buttons, structured responses | Markdown subset, no interactive elements |
| **Zero dependencies** | Single `<script>` tag, no accounts, no bot tokens, no third-party servers | Requires Telegram account, bot registration, OpenClaw plugin |
| **Privacy** | Direct WebSocket to your server — nothing leaves your network | Messages route through Telegram's servers |
| **Embeddable** | Drop into any page: `data-mount="#chat"` for embedded, or floating bubble mode | Locked to Telegram app |
| **Offline resilience** | Works on LAN with no internet — just needs line-of-sight to the server | Dead without internet |
| **Deduplication** | Native message IDs, no edge cases | Edited messages get deduped/dropped (known bug, requires patching) |
| **Multi-user** | Any browser session gets its own chat context | Single bot ↔ single user binding |

Telegram is still useful for mobile notifications and quick pings when away from the UI — but for actual work, Agent Chat is the real interface.

## Architecture

- **Zero dependencies** — single IIFE, no npm, no build step
- **Gateway protocol** — connects as `operator` role with `operator.read` + `operator.write` scopes
- **Flat chronological messages** — no client-side topic grouping or filtering
- **Reconnection** — exponential backoff up to 30s
- **Two variants:**
  - `agent-chat.js` — self-contained widget (IIFE, auto-mounts, optional floating bubble)
  - `chat-panel.js` — modular panel (no self-mounting, caller controls layout)

## Directory Structure

```
├── agent-chat.js       # Self-contained widget (IIFE)
├── agent-chat.css      # Themeable styles (--ac-* vars)
├── agent-chat.html     # Standalone example
├── chat-panel.js       # Modular panel variant
├── chat-panel.css      # Panel styles
└── skill/
    └── SKILL.md        # OpenClaw skill for chat integration
```

## Author

**Dimitri Loginowski** — NVIDIA (Omniverse)

## License

MIT
