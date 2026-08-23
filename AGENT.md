# Agent Guide

This file documents repository-specific expectations for coding agents working
on Kitchen.

## Project shape

Kitchen is a SvelteKit 2 application using Svelte 5 runes and TypeScript. It is
a stateless browser control plane for Modal sandboxes; Modal is the source of
truth for runtime state and snapshots.

Important areas:

- `src/routes` — pages and API endpoints
- `src/lib/server/modal.ts` — Modal control-plane operations
- `src/lib/server/runtime.ts` — sandbox image layers and boot script
- `src/lib/server/terminal-client` — browser code injected into ttyd and its
  local upload helper
- `src/lib/types.ts` — shared domain types, pane names, and ports
- `src/lib/launch.ts` — browser-side streamed lifecycle operations
- `deploy.py` — production deployment on Modal

## Commands

Run these from the repository root:

```sh
npm run check
npm run build
```

For edits to standalone terminal-client JavaScript, also run:

```sh
node --check src/lib/server/terminal-client/client.mjs
node --check src/lib/server/terminal-client/upload-server.cjs
```

Use `git diff --check` before committing.

## Runtime invariants

- A sandbox's name is its durable identity across restarts.
- Snapshots capture the whole filesystem; volumes are external and are not
  part of snapshots.
- Stopping with save must snapshot before terminating. Do not silently reverse
  that order or weaken the visible progress reporting.
- `runtimeCommands` defines cached image layers. If those layers change in a
  way existing snapshots need to recognize, bump `RUNTIME_VERSION` in both
  `src/lib/server/runtime.ts` and `src/lib/runtimeVersion.ts`.
- `bootScript` runs on every sandbox start, including restored snapshots, and
  normally does not require a runtime-version bump.
- `bootScript` is a `String.raw` template. Avoid backticks and `${` inside its
  shell body because JavaScript would interpret them.
- Terminal-client source files are base64-embedded into the boot script. Keep
  them as real files so syntax checks and editor tooling continue to work.
- Keep `modePorts` in `src/lib/types.ts` aligned with Caddy and service ports in
  the boot script.
- Terminal panes are cross-origin iframes. The parent Svelte page cannot
  observe or rewrite keyboard, paste, or focus events inside them; terminal
  behavior belongs in the injected terminal client.
- Do not restart a supervised sandbox service to refresh its environment. A
  supervised service exit terminates the sandbox.

## State and credentials

- Keep the SvelteKit server stateless. Do not introduce a database or server
  session for data Modal already owns.
- Browser credentials are stored only in browser `localStorage` and sent as
  request headers. Never log, persist, or return token secrets.
- Pane secrets are derived per sandbox and exchanged for HTTP-only cookies.
  Preserve authentication on every tunneled service and upload route.
- Pending browser operations may outlive a page navigation or a dropped
  stream. Preserve recovery and idempotency behavior when changing lifecycle
  code.

## Coding conventions

- Follow the existing Svelte 5 rune style (`$state`, `$derived`, `$effect`).
- Prefer shared domain definitions in `src/lib/types.ts` over duplicating pane,
  status, or operation constants.
- Keep user-facing long operations streamed and visibly phased; image builds,
  snapshots, and termination can take minutes.
- Preserve unrelated work in a dirty worktree and keep commits focused.
- Update documentation when changing ports, persistence semantics, runtime
  behavior, credentials, or deployment steps.
