/**
 * The herdr pane: a ttyd terminal onto the herdr multiplexer, which manages
 * panes of coding agents (claude, codex, pi).
 *
 * herdr needs the whole machine primed for it: its socket path and the
 * gVisor-compatible process detection are exported machine-wide (bootEnv),
 * and its agent integrations install at boot rather than image build so
 * machines restored from older snapshots get them too (bootSection).
 *
 * Fragments are String.raw, never producing `${` — see types.ts.
 */

import type { Context } from "cordis";
import { ttydImageLayer, ttydThemePrelude } from "./terminal";
import type { SessionModeContribution } from "./types";

// herdr. Pinned to a preview build + digest because the stable installer's
// "latest" resolution is exactly the trap that bit us: Modal's layer cache
// froze herdr 0.8.2 into the image, where HERDR_PROCESS_DETECTION=child-
// groups (see bootEnv below for why sandboxes need it) does not yet
// exist — the docs described it, the shipped binary ignored it. Preview
// 2026-08-19-b5c4a0176e91 is verified working on a live Modal sandbox.
// Bump build + digest together with RUNTIME_VERSION to upgrade. Move back
// to the stable manifest build once a stable release ships the mode.
const HERDR_BUILD = "2026-08-19-b5c4a0176e91";
const HERDR_SHA256 =
  "fe5d3009003113731bfe1e7a72b356acaf2d6e35aee952aa68ecb4fd63710d8c";

export const contribution = {
  id: "herdr",
  port: 7683,
  imageLayers: [
    ttydImageLayer,
    `RUN mkdir -p /root/.local/bin && curl -fsSL https://github.com/herdrdev/herdr/releases/download/preview-${HERDR_BUILD}/herdr-linux-x86_64 -o /root/.local/bin/herdr && echo "${HERDR_SHA256}  /root/.local/bin/herdr" | sha256sum -c - && chmod +x /root/.local/bin/herdr`,
  ],
  bootEnv: [
    {
      assignment: "HERDR_SOCKET_PATH=/tmp/herdr.sock",
      doc: [
        "# Unix sockets are fine on the sandbox's own filesystem now, but /tmp keeps",
        "# the socket out of snapshots, where a stale socket file is meaningless.",
      ].join("\n"),
    },
    {
      assignment: "HERDR_PROCESS_DETECTION=child-groups",
      doc: [
        "# Modal's runtime (gVisor) hides a pty's foreground process group from",
        "# /proc (tty_nr/tpgid read 0 even for a TUI agent on a real pty), so",
        "# herdr's native foreground-process detection can never identify a pane's",
        "# agent. Hook reports from herdr's own integrations don't rescue it — they",
        "# are suppressed as stale unless the agent process was identified first.",
        "# child-groups makes the herdr server infer each pane's foreground job from",
        "# its shell's child process groups instead; the image pins a herdr build",
        "# that implements it. Only the server reads it, so export it everywhere the",
        "# boot env is seeded (profile.d and zshenv below), like HERDR_SOCKET_PATH.",
      ].join("\n"),
      mirrorNote: "see boot script note",
    },
  ],
  bootSection: String.raw`# herdr installs its agent integrations into each agent's OWN config directory,
# and each agent only creates that directory the first time it runs. On a fresh
# machine the binaries are all present but the directories are not, so herdr
# reports "install claude code first" about an agent that is already installed.
# Creating them is enough for its installer to proceed. In the boot script
# rather than the image so machines restored from older snapshots get it too.
mkdir -p /root/.claude /root/.codex /root/.pi/agent/extensions
# ...then actually install them. The mkdir only unblocks the installer — a
# fresh machine otherwise ships with zero integrations (they are what gave
# one sandbox a working sidebar by hand and made the env var look
# sufficient). Bundled assets written to the config dirs, no server needed.
# pi's hooks own full lifecycle state once detection identifies the pane;
# claude/codex get native session identity for restore.
herdr integration install pi >/dev/null || true
herdr integration install claude >/dev/null || true
herdr integration install codex >/dev/null || true

# herdr: replay recent pane contents after restarts. Seeded once only — the
# config lives in the machine now, so user edits stick.
mkdir -p /root/.config/herdr
if [ ! -f /root/.config/herdr/config.toml ]; then
	# version_check = off: herdr's updater would "upgrade" the pinned preview
	# binary back to stable 0.8.2 (a preview install on the default stable
	# channel always counts as outdated), silently losing child-groups.
	printf '[terminal]\ndefault_shell = "zsh"\n\n[experimental]\npane_history = true\n\n[update]\nversion_check = false\n' > /root/.config/herdr/config.toml
fi`,
  supervisedPrelude: [ttydThemePrelude],
  supervised: [
    String.raw`ttyd -p 17683 -i 127.0.0.1 -W -t "theme=$TTYD_THEME" -t fontSize=13 herdr &`,
  ],
  caddyBlock: String.raw`:7683 {
	import kitchenauth 17683
}`,
} as const satisfies SessionModeContribution;

export const name = "kitchen-mode-herdr";
export const inject = ["sessionModes"];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.sessionModes.register(contribution));
}
