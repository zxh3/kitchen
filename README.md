# Kitchen

Kitchen is a browser control plane for persistent development sandboxes on
[Modal](https://modal.com). Each sandbox includes:

- zsh
- herdr with Codex, Claude Code, and pi
- code-server
- an application preview for port 3000
- whole-filesystem snapshots, restores, and forks

## Development

Requires Node.js 22, npm, and a Modal API token.

```sh
npm install
npm run dev
```

Connect your Modal token in the browser. Kitchen verifies it once, then keeps
it in an authenticated-encrypted, `HttpOnly` cookie that page scripts cannot
read. Development uses an ephemeral encryption key unless `.env` provides a
stable one:

```sh
cp .env.example .env
npm run dev
```

Checks:

```sh
npm run check
npm run build
```

## Deployment

Requires Python 3.12 and the Modal CLI:

```sh
modal secret create kitchen-deployment-credentials \
  KITCHEN_SESSION_SECRET="$(openssl rand -hex 32)"
modal deploy deploy.py
```

For a private single-tenant deployment, add `MODAL_TOKEN_ID`,
`MODAL_TOKEN_SECRET`, optional `MODAL_ENVIRONMENT`, and a separate random
`KITCHEN_ACCESS_TOKEN` to that secret. Visitors must enter the Kitchen access
key before the deployment credentials are used; exposing the site no longer
implicitly exposes the Modal token's authority.

The web server routes and runs in `us-west` with 8 CPUs, 32 GiB RAM, and one
warm container. These defaults favor responsive development over scale-to-zero
cost savings. Regional compute carries Modal's region-selection multiplier.

## Persistence

Stopping with save snapshots the sandbox's filesystem, including `/workspace`,
installed tools, settings, and logins. Processes do not survive restore.
Volumes persist separately and are not part of snapshots.

Sandboxes have a 24-hour maximum runtime. Save important work before then or
use a volume.

## Architecture

The SvelteKit server is stateless; sealed browser sessions require no database,
and Modal is the source of truth. Each sandbox
runs ttyd for zsh and herdr, code-server, Caddy authentication, and a proxy to
the application on port 3000.

Runtime setup lives in `src/lib/server/runtime.ts`. Terminal browser behavior
lives in `src/lib/server/terminal-client`.

See [terminal image-paste design notes](docs/pane-image-paste.md).
