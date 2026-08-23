# Agent Guide

Kitchen is a SvelteKit 2/Svelte 5 control plane for Modal sandboxes. Keep the
server stateless and treat Modal as the source of truth.

## Verify

```sh
npm run check
npm run build
git diff --check
```

For terminal-client changes, also run:

```sh
node --check src/lib/server/terminal-client/client.mjs
node --check src/lib/server/terminal-client/upload-server.cjs
```

## Invariants

- A sandbox name is its durable identity.
- Snapshots capture the filesystem; volumes are separate.
- Save before terminating a sandbox.
- `runtimeCommands` changes may require bumping `RUNTIME_VERSION` in
  `runtime.ts` and `runtimeVersion.ts`.
- `bootScript` runs on every start and normally needs no version bump.
- Avoid backticks and `${` inside the `String.raw` boot script.
- Keep `modePorts` aligned with Caddy and boot-script ports.
- Terminal iframe events belong in `src/lib/server/terminal-client`; the parent
  page cannot observe cross-origin input.
- Never log or persist Modal token secrets.
- Keep long operations streamed with visible progress.
- Use existing Svelte 5 rune patterns and shared types.

## Git

- Use Conventional Commits: `type(scope): description`.
- Treat the PR title as the squash commit message; it must follow the same
  format.
