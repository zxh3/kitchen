# Kitchen

Kitchen is a browser control plane for durable development sandboxes on
[Modal](https://modal.com). Each sandbox is a complete Linux machine with a
shell, coding-agent workspace, VS Code, and a preview browser. Stopping a
sandbox can snapshot its whole filesystem so the next run resumes with the
same files, packages, tools, settings, and logins.

## What it provides

- Create CPU or GPU sandboxes from Ubuntu, Python, Node, or PyTorch images.
- Work through four panes that stay alive while switching views:
  - `zsh` — a normal interactive shell
  - `herdr` — a terminal workspace for Codex, Claude Code, and pi
  - `vscode` — code-server rooted at `/workspace`
  - `browser` — a proxy to the sandbox application on port 3000
- Save, restore, retain, and fork whole-machine snapshots.
- Attach Modal volumes for data that must persist continuously.
- Paste or drop screenshots into terminal panes for coding agents.
- Use browser-provided Modal credentials or configure a server-owned
  connection for a single workspace.

## Requirements

- Node.js 22 and npm
- A Modal account and API token
- Python 3.12 plus the Modal CLI if deploying Kitchen on Modal

## Local development

Install dependencies and start the SvelteKit development server:

```sh
npm install
npm run dev
```

Open the displayed local URL and connect a Modal token. In this mode the token
is kept in browser `localStorage` and sent with API requests; Kitchen does not
store it server-side.

To make the server use one preconfigured Modal workspace instead, copy the
environment template and fill in the credentials:

```sh
cp .env.example .env
npm run dev
```

`MODAL_ENVIRONMENT` is optional. When omitted, Kitchen uses the workspace's
default environment.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run check` | Run Svelte and TypeScript diagnostics |
| `npm run build` | Create the production Node build |
| `npm run preview` | Run the production build locally |

## Deployment

The included Modal deployment builds the SvelteKit app and runs its Node
server on Modal:

```sh
modal deploy deploy.py
```

By default, users connect their own Modal token in the browser. A custom domain
can be attached to the deployed server from the Modal dashboard.

The deployment keeps one web container warm for immediate responses. Review
the `min_containers` setting in [`deploy.py`](deploy.py) if continuous web
container cost is not desired.

## Persistence model

A sandbox is its filesystem. `/workspace` is conventional, but files and
packages installed elsewhere are captured too.

- **Stop and save** creates a snapshot and then terminates the sandbox.
- **Save snapshot** captures the running machine without stopping it.
- **Restore** starts a replacement sandbox from an earlier snapshot.
- **Fork** creates another named sandbox from a snapshot.
- **Volumes** persist continuously and are not included in snapshots.

Processes do not survive a snapshot restore. Sandboxes also have a 24-hour
maximum runtime, so save important work before that limit or use a volume for
data that cannot wait for a snapshot.

## Architecture

Kitchen's SvelteKit server is stateless. It treats Modal as the source of truth
for running sandboxes, finished sandboxes, tags, tunnels, volumes, and snapshot
images.

Each sandbox boots four local services behind a Caddy authentication proxy:

| Pane | Public port | Sandbox service |
| --- | ---: | --- |
| zsh | 7681 | ttyd running zsh |
| herdr | 7683 | ttyd running herdr |
| vscode | 8443 | code-server |
| browser | 8080 | application preview on port 3000 |

The runtime image and boot process live in
[`src/lib/server/runtime.ts`](src/lib/server/runtime.ts). The terminal browser
enhancements live under
[`src/lib/server/terminal-client`](src/lib/server/terminal-client).

## Security notes

- Browser-provided Modal credentials remain in that browser and accompany API
  requests as headers.
- Pane URLs exchange a derived per-sandbox secret for an HTTP-only cookie.
- Caddy authenticates terminal, editor, preview, and upload traffic before
  proxying it inside the sandbox.
- Do not commit `.env` or Modal credentials.

## Additional documentation

- [Terminal image-paste design](docs/pane-image-paste.md)
