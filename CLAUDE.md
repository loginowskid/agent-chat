# Agent Chat — AI Agent Guide

This repo contains the **standalone chat widget** for OpenClaw agents.

## What's Here

A zero-dependency embeddable chat widget that connects to the OpenClaw Gateway WebSocket. Two variants:
- `agent-chat.js` — self-contained IIFE (auto-mounts, floating bubble)
- `chat-panel.js` — modular panel (caller controls layout)

## Integration Docs

See [README.md](README.md) for full integration guide:
- Quick Start, Embedding, Floating Bubble, Modular ChatPanel
- Gateway Auth, Theming, Configuration Options, JavaScript API
- Topic Tag, Architecture

## Key Facts

- Connects to OpenClaw Gateway WebSocket (default `ws://localhost:18789`)
- Authenticates via shared-secret token (Gateway protocol)
- All CSS custom properties prefixed `--ac-`
- No build step, no dependencies, no server needed
- The `skill/` directory contains the OpenClaw skill for automated integration by agents
