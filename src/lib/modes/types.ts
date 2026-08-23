/**
 * What a session mode contributes to the sandbox runtime.
 *
 * A session mode is a pane: the ttyd zsh terminal, the herdr terminal
 * multiplexer, code-server, or the dev-server proxy. Kitchen composes the
 * sandbox image (`runtimeCommands`) and the boot script (`bootScript`) from
 * these contributions, so adding a mode = adding one file under
 * `src/lib/modes/` — no edits to shared runtime code.
 *
 * The pieces are deliberately data, not callbacks: the same contribution feeds
 * the server-side cordis registry AND the client's tab bar, and it must cross
 * that boundary as plain strings (mode modules stay free of Node imports so
 * Vite can bundle them for the browser).
 *
 * EVERY raw script field (bootSection, caddyBlock, supervised) follows the
 * rule the boot script was written under: declare it with String.raw and
 * never produce a `${` sequence — the shell fragments carry their own `$VAR`
 * expansions, and JS template interpolation would swallow them.
 */

/** One exported boot variable, mirrored into every shell entry point. */
export interface BootEnvEntry {
  /**
   * The assignment, e.g. `FOO=bar`, with no `$` expansion hazards. Rendered
   * as `export FOO=bar` in the boot preamble, and (with `mirrorNote`) in the
   * profile.d and zshenv mirrors so every login/interactive shell sees it.
   */
  assignment: string;
  /**
   * Preamble-only `# …` comment lines above the export, documenting why it
   * exists. Kept out of the mirrors: a shell startup file is the wrong place
   * for an essay, hence `mirrorNote`.
   */
  doc?: string;
  /**
   * Trailing `# …` note appended to the mirrored exports, pointing back at
   * the preamble's `doc` block.
   */
  mirrorNote?: string;
}

export interface SessionModeContribution {
  /**
   * Stable pane id: the tunnel/tunnel-port key, the URL query value, and the
   * registry key. Lowercase, since it ends up in URLs and tags.
   */
  readonly id: string;
  /**
   * Public tunneled port for the pane. Must be unique across modes; the
   * registry rejects a collision or a duplicate id at boot, loudly.
   */
  readonly port: number;
  /**
   * Extra image layers (`RUN …` commands) this pane needs, on top of the
   * shared base layers. Deduped across modes by exact content, so two modes
   * sharing a build (ttyd serves both terminal panes) declare the same
   * constant and pay for it once.
   */
  readonly imageLayers?: readonly string[];
  /**
   * Environment the whole machine needs for this pane to work, exported at
   * boot. `: string` assignments only — no `$` references (the mirrors are
   * quoted heredocs where escaping would get lossy; see runtime.ts).
   */
  readonly bootEnv?: readonly BootEnvEntry[];
  /**
   * Raw boot-script section, spliced in right after the sandbox name marker
   * is written. For machine-wide setup that belongs to the mode (herdr's
   * integration installs), not for per-pane processes — those are
   * `supervised`. String.raw, no `${`.
   */
  readonly bootSection?: string;
  /**
   * Extra variable assignments printed once just before the supervised
   * processes start (e.g. TTYD_THEME). Deduped by exact content across
   * modes, first registration wins.
   */
  readonly supervisedPrelude?: readonly string[];
  /**
   * Long-running processes, one full command line each INCLUDING the
   * trailing ` &`, started in registration order. The boot script's
   * `wait -n` fails the whole sandbox if any of these exits — only list
   * processes that should never die.
   */
  readonly supervised?: readonly string[];
  /**
   * Caddy site block for the public port, verbatim, tab-indented, with no
   * leading or trailing blank line. Fronts the pane's localhost service with
   * the shared cookie-auth snippet (or whatever the pane needs).
   */
  readonly caddyBlock: string;
}
