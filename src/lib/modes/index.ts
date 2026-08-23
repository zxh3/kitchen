/**
 * The session-mode registry's data face, shared by both runtimes:
 *
 *   - the SERVER mounts `modePlugins` into the cordis context (see
 *     src/lib/server/context.ts), and the registry feeds runtime.ts's
 *     image-layer and boot-script assembly;
 *   - the CLIENT only needs the metadata (which panes exist, on which
 *     ports), derived here from the same contributions — no cordis import,
 *     no Node imports, safe to bundle.
 *
 * Mode order here is the tab order in the UI and the registration order on
 * the server.
 */

import * as browser from "./browser";
import * as herdr from "./herdr";
import type { SessionModeContribution } from "./types";
import * as vscode from "./vscode";
import * as zsh from "./zsh";

export const modeContributions = [
  zsh.contribution,
  herdr.contribution,
  vscode.contribution,
  browser.contribution,
];

/** The cordis plugins the server mounts; same order as modeContributions. */
export const modePlugins = [zsh, herdr, vscode, browser];

export type SessionMode = (typeof modeContributions)[number]["id"];

export const sessionModes: readonly SessionMode[] = modeContributions.map(
  (m) => m.id,
);

/** Public (tunneled) port per session mode. */
export const modePorts: Record<SessionMode, number> = Object.fromEntries(
  modeContributions.map((m) => [m.id, m.port]),
) as Record<SessionMode, number>;

/** Look up one contribution by id. Throws on an unknown id — programming error, not user error. */
export function modeById(id: SessionMode): SessionModeContribution {
  const found = modeContributions.find((m) => m.id === id);
  if (!found) throw new Error(`unknown session mode: ${id}`);
  return found;
}
