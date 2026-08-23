/**
 * Rendering for BootEnvEntry: the same logical export appears in three
 * script sites — once as documented preamble text (`export` + full `doc`
 * comment block) and twice as a terse mirror line in profile.d / zshenv
 * (`export` + optional `# mirrorNote` pointing back at the essay).
 *
 * All three sites must reproduce the bytes the hand-written script carried,
 * which is why the split exists at all; tests/fixtures/boot-script.golden.sh
 * pins the result (`npm run check:runtime`).
 */

import type { BootEnvEntry } from "./types";

export type { BootEnvEntry } from "./types";

/**
 * Preamble rendering: each entry's doc comment followed by its export.
 * @returns the joined lines, or "" when no mode contributes env.
 */
export function bootEnvBlock(entries: readonly BootEnvEntry[]): string {
  return entries
    .map((e) => (e.doc ? `${e.doc}\n` : "") + `export ${e.assignment}`)
    .join("\n");
}

/**
 * Mirror rendering (profile.d, zshenv): export lines only, with the short
 * trailing note that points back at the preamble.
 * @returns the joined lines, or "" when no mode contributes env.
 */
export function bootEnvMirror(entries: readonly BootEnvEntry[]): string {
  return entries
    .map(
      (e) =>
        `export ${e.assignment}${e.mirrorNote ? ` # ${e.mirrorNote}` : ""}`,
    )
    .join("\n");
}
