/**
 * Golden check for the sandbox runtime artifacts.
 *
 * `src/lib/server/runtime.ts` used to declare `runtimeCommands` and
 * `bootScript` as hand-tuned literals. The cordis prototype reassembles them
 * from the session-mode registry (src/lib/server/registry.ts +
 * src/lib/modes/*), which is fertile ground for silent drift — a lost
 * newline, a reordered layer, a swallowed `$VAR`. So the pre-refactor
 * output is recorded here and every refactor must reproduce it:
 *
 *   - bootScript: byte-identical.
 *   - runtimeCommands: identical as a SET. Order is deliberately free —
 *     registry-driven assembly emits base layers first, then per-mode layers
 *     in plugin registration order, and that shuffle is part of the point
 *     (plugins must not know their position). All layers are content-cached
 *     by Modal, so a reorder costs one rebuild, never a behavioral change.
 *
 * Run `npm run check:runtime` to verify, `--write` to re-record (only ever
 * from code whose runtime behavior you trust — the fixtures are the spec).
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bootScript, runtimeCommands } from "$lib/server/runtime";

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  "../tests/fixtures",
);
const BOOT_GOLDEN = join(FIXTURES, "boot-script.golden.sh");
const COMMANDS_GOLDEN = join(FIXTURES, "runtime-commands.golden.json");

const write = process.argv.includes("--write");

if (write) {
  mkdirSync(FIXTURES, { recursive: true });
  writeFileSync(BOOT_GOLDEN, bootScript);
  writeFileSync(COMMANDS_GOLDEN, JSON.stringify(runtimeCommands, null, 2) + "\n");
  console.log(
    `recorded: bootScript (${bootScript.length} bytes), ` +
      `${runtimeCommands.length} runtime commands`,
  );
  process.exit(0);
}

let failed = false;

/** First byte offset where two strings differ, plus line context. */
function describeDiff(actual: string, expected: string): string {
  let i = 0;
  while (i < Math.min(actual.length, expected.length) && actual[i] === expected[i]) i++;
  const line = actual.slice(0, i).split("\n").length;
  const excerpt = (s: string) =>
    JSON.stringify(s.split("\n")[line - 1] ?? "").slice(0, 120);
  return (
    `first difference at byte ${i} (line ${line}):\n` +
    `  actual:   ${excerpt(actual)}\n` +
    `  expected: ${excerpt(expected)}`
  );
}

const expectedBoot = readFileSync(BOOT_GOLDEN, "utf8");
if (bootScript !== expectedBoot) {
  failed = true;
  console.error(`✗ bootScript drifted:\n${describeDiff(bootScript, expectedBoot)}`);
} else {
  console.log(`✓ bootScript matches golden (${bootScript.length} bytes)`);
}

const expectedCommands: string[] = JSON.parse(readFileSync(COMMANDS_GOLDEN, "utf8"));
const sort = (xs: string[]) => [...xs].sort((a, b) => a.localeCompare(b));
if (JSON.stringify(sort(runtimeCommands)) !== JSON.stringify(sort(expectedCommands))) {
  failed = true;
  const missing = expectedCommands.filter((c) => !runtimeCommands.includes(c));
  const added = runtimeCommands.filter((c) => !expectedCommands.includes(c));
  console.error(
    `✗ runtimeCommands drifted:\n` +
      missing.map((c) => `  missing: ${c.slice(0, 100)}\n`).join("") +
      added.map((c) => `  added:   ${c.slice(0, 100)}\n`).join(""),
  );
} else {
  console.log(`✓ runtimeCommands matches golden as a set (${runtimeCommands.length} layers)`);
}

process.exit(failed ? 1 : 0);
