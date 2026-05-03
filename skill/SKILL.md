---
name: chat-widget-integration
description: Integrate the Warp Core ChatPanel module into any page or app. Use when adding chat functionality, mounting the chat panel, placing chat controls in a toolbar/header, styling chat elements, or connecting to the chat WebSocket. NOT for modifying message rendering logic or the chat server backend.
---

# Chat Widget Integration

## Architecture

The chat system connects to the **OpenClaw Gateway WebSocket** using the Gateway protocol.
Two variants:

- **`agent-chat.js`** — Self-contained IIFE widget (auto-mounts, optional floating bubble)
- **`chat-panel.js`** (`ChatPanel`) — Modular panel for host-app integration

No standalone server. No REST API. All communication is via Gateway WebSocket.

**Topics are client-side only** — stored in localStorage keyed by Gateway URL.

## Files

| File | Purpose |
|------|---------|
| `agent-chat.js` | Self-contained widget — IIFE, `data-*` config |
| `agent-chat.css` | Styles shared by both variants |
| `chat-panel.js` | Module — exports `window.ChatPanel` |
| `chat-panel.css` | Styles for ChatPanel variant |

## Integration Steps (ChatPanel module)

### 1. Include files

```html
<link rel="stylesheet" href="chat-panel.css?v=1">
<script src="chat-panel.js?v=1"></script>
```

No `data-*` attributes. Config is passed programmatically.

### 2. Mount the panel

```javascript
const container = document.getElementById('my-chat-container');
ChatPanel.mount(container, {
    server: 'ws://localhost:18789',  // Gateway WebSocket URL
    token: 'YOUR_GATEWAY_TOKEN',    // shared-secret auth token
    theme: 'dark',
    title: 'Chat'
});
```

The container needs `height: 100%` or explicit height. ChatPanel fills it with flex column layout.

### 3. Place controls

```javascript
const ctrl = ChatPanel.getControls();
// ctrl.dot         — status dot element (.ac-status-dot, gets .active class)
// ctrl.filter      — <select> for topic filtering
// ctrl.themeBtn    — theme toggle button
// ctrl.archiveBtn  — archive toggle button
// ctrl.newTopicBtn — new topic button
```

Place these elements wherever makes sense in your layout:

```javascript
myToolbar.appendChild(ctrl.dot);
myToolbar.appendChild(ctrl.filter);
myToolbar.appendChild(ctrl.archiveBtn);
myToolbar.appendChild(ctrl.newTopicBtn);
```

### 4. Subscribe to events

```javascript
ChatPanel.onStatus(function(connected) {
    // connected: true/false
});

ChatPanel.onUnread(function(count) {
    // Update badge elsewhere in UI
});
```

### 5. Style controls in context

Controls use `.ac-status-dot`, `.ac-btn-icon`, `.ac-topic-filter` classes. Style them relative to their placement container:

```css
.my-toolbar .ac-status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #555;
    transition: background 0.3s;
}
.my-toolbar .ac-status-dot.active {
    background: #22c55e;
    box-shadow: 0 0 4px #22c55e;
}
```

## Integration Steps (agent-chat.js self-contained)

```html
<script src="agent-chat.js"
    data-server="ws://localhost:18789"
    data-token="YOUR_GATEWAY_TOKEN"
    data-title="Chat"
    data-theme="dark"
    data-position="bottom-right">
</script>
```

Or embedded:
```html
<div id="chat"></div>
<script src="agent-chat.js"
    data-mount="#chat"
    data-server="ws://localhost:18789"
    data-token="YOUR_GATEWAY_TOKEN">
</script>
```

## Rules

1. **Never build a header inside the ChatPanel module.** Controls are always placed externally.
2. **Never reparent DOM nodes between containers.** Place once, show/hide with `display`.
3. **CSS variables from the chat panel don't leak out.** Style controls explicitly in their host context.
4. **Mount only once.** Don't call `mount()` repeatedly — it initializes the WS connection.
5. **Error handler must be present.** `chat-panel.js` includes global JS error routing to `/api/log?level=error`. Don't remove it.
6. **Topics are client-side only.** They persist to localStorage, keyed by Gateway URL.
7. **No standalone server.** All communication goes through the OpenClaw Gateway WebSocket.

## Public API Reference

### ChatPanel (modular)

```javascript
ChatPanel.mount(container, config)   // Mount messages+input
ChatPanel.getControls()              // Get control elements
ChatPanel.onStatus(cb)               // Subscribe to connection status
ChatPanel.onUnread(cb)               // Subscribe to unread count
ChatPanel.send(text)                 // Send via chat.send
ChatPanel.inject(text)               // Inject via chat.inject
ChatPanel.setTheme(theme)            // Switch 'dark'/'light'
ChatPanel.destroy()                  // Tear down WS + DOM
```

### AgentChat (self-contained)

```javascript
AgentChat.send(text)                 // Send via chat.send
AgentChat.inject(text)               // Inject via chat.inject
AgentChat.connect()                  // Reconnect WS
AgentChat.setTheme(theme)            // Switch theme
AgentChat.createTopic(name)          // Create topic (local)
AgentChat.archiveTopic(id)           // Archive topic (local)
AgentChat.destroy()                  // Remove widget
```
