# Architecture Overview

## WebSocket Design

- Purpose: Real‑time updates to the UI for chat streaming, project status, CLI output, preview events, and message housekeeping.
- Event producers: Node services and API route handlers (`packages/services/*`, App Router under `apps/web/app/api/...`).
- Event consumer: Browser via `useWebSocket` → `ChatLog`.

## Chosen Topology

- Connection acceptor: Next.js pages API at `pages/api/chat/[...path].ts` attaches a `ws` WebSocketServer to the Node HTTP server.
- Broadcast bus: a single in‑memory project registry exported from `@repo/ws`.
- Registry unification: `@repo/ws` stores the registry on `globalThis.__WS_REGISTRY__` so both pages API and App Router bundles share the same instance within the same Node process.

Why this approach

- Single process, Node‑only app: All server code uses Node APIs (fs, child_process). Keeping WS on Node runtime avoids Edge/runtime limitations.
- Minimal change, robust in dev/prod: Next 14 can load pages and app routes in separate bundles; a global registry ensures both reference the same sockets.
- Future desktop wrapper: A Node global works the same when packaged with Electron.

Alternatives considered

- App Router WebSocket (Edge WebSocketPair): Incompatible with our Node‑only services and does not share memory with Node runtime.
- Standalone WS server + HTTP bridge: More operational surface (ports, lifecycle). Viable for multi‑instance/serverless, but unnecessary now.
- External broker (Redis pub/sub): Most scalable but adds infra and complexity beyond current needs.

## Data Flow

- Client connects to `ws://{host}/api/chat/{projectId}` (pages API).
- Node services call `wsRegistry.broadcast(projectId, event)` from App Router/serverside code.
- The global registry forwards to sockets registered by the WS acceptor.

## Event Types

- message, chat_start, chat_complete
- act_start, act_complete
- project_status
- preview_error, preview_success
- cli_output
- messages_cleared

