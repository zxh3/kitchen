/**
 * The kitchen sandbox runtime: what turns a bare base image into a sandbox
 * with working zsh / herdr / vscode / browser panes.
 *
 * Persistence is NOT wired up here. A sandbox is its filesystem, and snapshots
 * (see server/snapshots.ts) capture that filesystem whole — so tools
 * live where tools normally live, and anything installed anywhere survives.
 * Volumes are a user-visible option, never a runtime mechanism.
 *
 * Two artifacts, BOTH ASSEMBLED from the session-mode registry (see
 * server/context.ts + src/lib/modes/*):
 *  - `runtimeCommands` — image layers: the shared base below, then each
 *    mode's `imageLayers` in registration order, deduped by content. Modal
 *    caches built images by layer content, so keep these deterministic
 *    (pinned versions) or every sandbox launch pays a rebuild.
 *  - `bootScript` — the sandbox entrypoint, passed as the create command:
 *    the skeleton below with each mode's `bootEnv` / `bootSection` /
 *    `supervised` / `caddyBlock` spliced into marked slots.
 *
 * Auth model: Caddy owns the public tunnel ports and fronts every service
 * (which bind to localhost only). The console points each pane's iframe at
 * /kitchen-auth?token=<secret>; Caddy answers with an HttpOnly cookie and a
 * redirect, and everything after that — including WebSockets — must carry
 * the cookie. No long-lived secret sits in a URL.
 *
 * NOTE on both the skeleton and every contributed fragment: avoid \`${\`
 * entirely — JS template interpolation would otherwise swallow the shell's
 * own expansions. Skeleton slots use plain ${...} against contribution
 * strings, which is safe because contributions declare fragments with
 * String.raw under the same rule (src/lib/modes/types.ts). The fixtures in
 * tests/fixtures/ pin the assembled bytes (`npm run check:runtime`).
 */

import { bootEnvBlock, bootEnvMirror, type BootEnvEntry } from "$lib/modes/env";
import { WORKSPACE_DIR } from "$lib/types";
import { kitchen } from "./context";

/**
 * Bump when `runtimeCommands` changes in a way an existing sandbox would care
 * about (new binary versions, new preinstalled tooling). Snapshots record
 * it, so the UI can tell that a restored sandbox is on an older runtime and
 * offer to rebuild. The boot script is passed at create time, so changes there
 * need no bump — they apply on the next start.
 *
 * Mirrored in $lib/runtimeVersion.ts for the client; keep the two in step.
 */
export const RUNTIME_VERSION = 6;
const UV_VERSION = "0.12.5";
const CADDY_VERSION = "2.11.4";
const GH_VERSION = "2.98.0";

export { WORKSPACE_DIR };

/**
 * The base layers every sandbox gets, regardless of registered modes: build
 * and auth-proxy plumbing (`caddy`), toolchains, the agent CLIs, and the
 * zsh-as-login-shell persona (which herdr's terminals depend on too — the
 * "zsh" MODE is only the ttyd pane, see src/lib/modes/zsh.ts). The `ln -sf`
 * fixup names mode binaries (herdr, code-server) deliberately: a dangling
 * link is harmless when a mode is absent, while forgetting one breaks PATH
 * for services whose environment froze at boot.
 */
const baseCommands = [
  "RUN apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends curl ca-certificates git && rm -rf /var/lib/apt/lists/*",
  `RUN curl -fsSL https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_amd64.tar.gz | tar -xz -C /usr/local/bin caddy`,
  // agent CLIs, preinstalled so herdr detects them out of the box. Modal
  // caches this layer on first build, freezing whatever versions npm
  // resolved then — bump the trailing comment to force a refresh.
  "RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y --no-install-recommends nodejs && rm -rf /var/lib/apt/lists/*",
  "RUN npm install -g @anthropic-ai/claude-code @openai/codex @earendil-works/pi-coding-agent # agents-v1",
  // uv: python packaging and standalone python builds, so a python project
  // needs no setup beyond `uv sync`. Pinned like everything else here.
  `RUN curl -fsSL https://astral.sh/uv/${UV_VERSION}/install.sh | sh`,
  // gh: cloning private repos, opening PRs, reading CI from inside the
  // sandbox. Only the binary — the release tarball is 15MB of man pages.
  // Nothing is authenticated at build time; `gh auth login` uses the device
  // flow (a code and a URL in the terminal), and the credentials it writes to
  // /root/.config/gh are part of the machine, so a snapshot keeps the login.
  `RUN curl -fsSL https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz | tar -xz -C /usr/local/bin --strip-components=2 gh_${GH_VERSION}_linux_amd64/bin/gh`,
  // the installers drop binaries in /root/.local/bin, which login shells don't have on PATH
  "RUN ln -sf /root/.local/bin/herdr /root/.local/bin/code-server /root/.local/bin/uv /root/.local/bin/uvx /usr/local/bin/",
  // the working directory: an ordinary directory, captured by snapshots
  // like the rest of the machine
  `RUN mkdir -p ${WORKSPACE_DIR} && printf '%s' '${RUNTIME_VERSION}' > /etc/kitchen-runtime-version`,
  // zsh + oh-my-zsh as the default shell, with git + autosuggestions plugins.
  // ZSH_THEME stays empty: the kitchen prompt is set at boot (/etc/kitchen-zshrc).
  "RUN apt-get update && apt-get install -y --no-install-recommends zsh && rm -rf /var/lib/apt/lists/* && chsh -s /usr/bin/zsh root",
  'RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended',
  "RUN git clone --depth=1 https://github.com/zsh-users/zsh-autosuggestions /root/.oh-my-zsh/custom/plugins/zsh-autosuggestions",
  `RUN printf '%s\\n' 'export ZSH="$HOME/.oh-my-zsh"' 'ZSH_THEME="robbyrussell"' 'ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=241"' 'plugins=(git zsh-autosuggestions)' 'zstyle ":omz:alpha:lib:git" async-prompt no' 'source $ZSH/oh-my-zsh.sh' '[ -f /etc/kitchen-zshrc ] && source /etc/kitchen-zshrc' > /root/.zshrc`,
];

function dedupe(layers: readonly string[]): string[] {
  return [...new Set(layers)];
}

/** Every boot variable the registered modes asked for. */
function allBootEnv(
  modes: readonly { bootEnv?: readonly BootEnvEntry[] }[],
): BootEnvEntry[] {
  return modes.flatMap((m) => m.bootEnv ?? []);
}

// --- boot-script skeleton: fixed text with marked slots for contributions ---

const SKELETON_HEAD = String.raw`
set -u
[ -n "$KITCHEN_SECRET" ] || { echo "KITCHEN_SECRET not set" >&2; exit 1; }
[ -n "$KITCHEN_SANDBOX_NAME" ] || KITCHEN_SANDBOX_NAME=sandbox
# Where installers put things, named on PATH BEFORE they exist.
#
# PATH is frozen per process at exec time: a service started at boot can never
# learn about a directory that appeared an hour later, and no amount of
# sourcing .zshrc in your shell changes the environment of a daemon. Listing
# the directories up front is the only fix that works without a restart — a
# missing entry is skipped, and starts resolving the moment it exists. So
# rustup-installed cargo is found by the herdr server that spawns the build,
# even though rustup ran long after boot.
#
# For anything that lands somewhere else: symlink it into /usr/local/bin,
# which is on every PATH here. Do not kill a service to give it a new
# environment — herdr's daemon inherits from the ttyd that spawns it (so it
# comes back with the same PATH), and the four supervised services fail the
# whole sandbox when they exit.
KITCHEN_TOOL_PATH=/root/.cargo/bin:/root/.local/bin:/root/.bun/bin:/root/.deno/bin:/root/go/bin:/usr/local/go/bin
export PATH="$KITCHEN_TOOL_PATH:$PATH"
export SHELL=/usr/bin/zsh`;

const NAME_MARKER = String.raw`mkdir -p /workspace
# name marker for the in-sandbox kitchen command
printf '%s' "$KITCHEN_SANDBOX_NAME" > /etc/kitchen-name`;

/** profile.d + MOTD, with the boot-env mirror rendered into the marked slot. */
function promptBlock(mirror: string): string {
  return (
    String.raw`# --- prompt (root's .bashrc would otherwise override profile.d) ---
cat > /etc/profile.d/kitchen.sh <<PROFILE
export PS1='\[\e[38;5;191m\]kitchen@'$KITCHEN_SANDBOX_NAME'\[\e[0m\]:\[\e[38;5;110m\]\w\[\e[0m\]$ '
export PATH="$KITCHEN_TOOL_PATH:\$PATH"
${mirror}case \$- in *i*)
	if [ -z "\$KITCHEN_MOTD_SHOWN" ]; then
		export KITCHEN_MOTD_SHOWN=1
		printf '\e[90mthe whole machine is saved when you stop $KITCHEN_SANDBOX_NAME - packages, config, /workspace, all of it.\ntype \e[0mkitchen\e[90m for details.\e[0m\n'
	fi
;; esac
PROFILE
echo '[ -f /etc/profile.d/kitchen.sh ] && . /etc/profile.d/kitchen.sh' >> /root/.bashrc`
  );
}

const KITCHEN_CMD = String.raw`# --- the in-sandbox reference: how persistence actually works here ---
cat > /usr/local/bin/kitchen <<'KITCHENCMD'
#!/bin/sh
NAME=$(cat /etc/kitchen-name 2>/dev/null || echo sandbox)
printf '\033[1mkitchen\033[0m - sandbox \033[1m%s\033[0m\n\n' "$NAME"
printf 'this sandbox IS its filesystem. stopping it saves a snapshot of the whole\n'
printf 'machine; starting %s again restores it:\n\n' "$NAME"
printf '  /workspace                      your files\n'
printf '  apt / pip / npm -g installs     wherever they normally land\n'
printf '  uv / rustup / nvm, any toolchain no special setup needed\n'
printf '  agent + gh logins, herdr        claude / codex / pi / gh, ~/.config\n'
printf '  vscode settings + extensions    dotfiles, /etc, shell history\n\n'
printf 'so install things normally - nothing needs to live in a special path.\n\n'
if [ -n "$KITCHEN_VOLUMES" ]; then
	printf 'mounted volumes (saved continuously, NOT part of snapshots):\n'
	printf '  %s\n\n' "$KITCHEN_VOLUMES"
fi
printf 'what is not saved:\n'
printf '  running processes - a restored sandbox boots its services fresh\n'
printf '  /etc/hosts, /etc/resolv.conf - the container rewrites these at boot\n'
printf '  work done after the last snapshot, if this sandbox is killed\n'
printf '  without being stopped (it has a 24h lifetime). stop it when you are\n'
printf '  done, or mount a volume for anything you cannot lose.\n\n'
printf 'browser tab:\n'
printf '  proxies to port 3000 in this sandbox - start any dev server there\n\n'
printf 'tools you install later:\n'
printf '  herdr and vscode keep the PATH they booted with, so a tool installed\n'
printf '  after boot has to land somewhere already on it. these are:\n'
printf '    ~/.cargo/bin  ~/.local/bin  ~/go/bin  ~/.bun/bin  ~/.deno/bin\n'
printf '    /usr/local/go/bin  /usr/local/bin  (rustup, uv, go, bun, deno)\n'
printf '  anything elsewhere: ln -s <dir>/<tool> /usr/local/bin/ - takes\n'
printf '  effect immediately, no restart. restarting a service does NOT pick\n'
printf '  up a new PATH, and stopping one fails the sandbox.\n'
KITCHENCMD
chmod +x /usr/local/bin/kitchen`;

/** zshenv, with the boot-env mirror rendered into its marked slot. */
function zshenvBlock(mirror: string): string {
  return (
    String.raw`# --- zsh: env for every invocation, plus the kitchen prompt + MOTD ---
cat > /etc/zsh/zshenv <<ZSHENV
typeset -U path PATH
export PATH="$KITCHEN_TOOL_PATH:\$PATH"
${mirror}export SHELL=/usr/bin/zsh
ZSHENV`
  );
}

const ZSHRC_BLOCK = String.raw`cat > /etc/kitchen-zshrc <<KITCHENZSH
export HISTFILE=/root/.zsh_history
export HISTSIZE=10000
export SAVEHIST=10000
setopt share_history
if [ -z "\$KITCHEN_MOTD_SHOWN" ]; then
	export KITCHEN_MOTD_SHOWN=1
	printf '\e[90mthe whole machine is saved when you stop $KITCHEN_SANDBOX_NAME - packages, config, /workspace, all of it.\ntype \e[0mkitchen\e[90m for details.\e[0m\n'
fi
KITCHENZSH`;

const CADDY_HEAD = String.raw`# --- auth proxy: cookie exchange in front of every service ---
cat > /tmp/Caddyfile <<CADDYEOF
{
	admin off
	auto_https off
}
(kitchenauth) {
	@login {
		path /kitchen-auth
		query token=$KITCHEN_SECRET
	}
	handle @login {
		header Set-Cookie "kitchen=$KITCHEN_SECRET; Path=/; Secure; HttpOnly; SameSite=None"
		redir * / 302
	}
	@authed {
		header Cookie *kitchen=$KITCHEN_SECRET*
	}
	handle @authed {
		reverse_proxy 127.0.0.1:{args[0]}
	}
	handle {
		respond "kitchen: authentication required" 403
	}
}`;

const CADDY_TAIL = String.raw`CADDYEOF`;

const SUPERVISED_TAIL = String.raw`caddy run --config /tmp/Caddyfile --adapter caddyfile &

# fail the sandbox loudly if any service dies
wait -n
echo "kitchen boot: a service exited" >&2
exit 1`;

/** Compose the sandbox entrypoint from the registry's contributions. */
function assembleBootScript(
  modes: readonly {
    bootEnv?: readonly BootEnvEntry[];
    bootSection?: string;
    supervisedPrelude?: readonly string[];
    supervised?: readonly string[];
    caddyBlock: string;
  }[],
): string {
  const env = allBootEnv(modes);
  const preambleEnv = bootEnvBlock(env);
  const mirror = bootEnvMirror(env);
  const mirrorSlot = mirror ? `${mirror}\n` : "";
  const bootSections = modes.flatMap((m) => (m.bootSection ? [m.bootSection] : []));
  const preludes = dedupe(modes.flatMap((m) => m.supervisedPrelude ?? []));
  const processes = modes.flatMap((m) => m.supervised ?? []);

  return (
    SKELETON_HEAD +
    (preambleEnv ? `\n${preambleEnv}` : "") +
    `\n\n${NAME_MARKER}` +
    bootSections.map((s) => `\n\n${s}`).join("") +
    `\n\n${promptBlock(mirrorSlot)}` +
    `\n\n${KITCHEN_CMD}` +
    `\n\n${zshenvBlock(mirrorSlot)}` +
    `\n\n${ZSHRC_BLOCK}` +
    `\n\n${CADDY_HEAD}\n${modes.map((m) => m.caddyBlock).join("\n")}\n${CADDY_TAIL}` +
    `\n\ncd /workspace\n${[...preludes, ...processes].join("\n")}\n${SUPERVISED_TAIL}\n`
  );
}

// The registry is the source of truth; assembling is a pure function of it.
// Top-level await runs at first import of any server module that touches the
// runtime — kitchen() itself is idempotent per process (see context.ts).
const ctx = await kitchen();
const modes = ctx.sessionModes.list();

/** Caddy proxies each public port to the service on localhost. */
export const runtimePorts = modes.map((m) => m.port);

export const runtimeCommands = [
  ...baseCommands,
  ...dedupe(modes.flatMap((m) => m.imageLayers ?? [])),
];

export const bootScript = assembleBootScript(modes);
