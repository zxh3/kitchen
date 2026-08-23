/**
 * The kitchen cordis context: one root per server process, with the
 * session-mode registry, the built-in mode plugins, and the lifecycle-event
 * consumers mounted into it. This is the "everything is a plugin" spine —
 * there is no privileged core; what a sandbox boot assembles reads entirely
 * from what plugins registered.
 *
 * Boot is idempotent per process. In vite dev, module reloading re-imports
 * this module but globalThis survives, so HMR of an unrelated module can
 * never double-mount the tree; the trade is that editing src/lib/modes/*
 * needs a dev-server restart to take effect (cordis-plugin-hmr is the
 * answer the deepseek-harness uses; nothing here merits it yet).
 *
 * Events are typed by declaration merging into cordis's Events interface —
 * emit/on pairs are checked against the same map. `emit` dispatches to
 * listeners without awaiting; a slow consumer can never stall a Modal call.
 */

import { Context } from "cordis";
import { modePlugins } from "$lib/modes";
import { SessionModes } from "./registry";

async function boot(): Promise<Context> {
  const root = new Context();
  await root.plugin(SessionModes);
  // inject: ["sessionModes"] on every mode plugin orders these behind the
  // registry without any manual sequencing.
  for (const plugin of modePlugins) {
    await root.plugin(plugin);
  }
  return root;
}

const GLOBAL_KEY = Symbol.for("kitchen.cordis-context");

/** The process-wide context, booted once. */
export function kitchen(): Promise<Context> {
  const g = globalThis as Record<symbol, Promise<Context> | undefined>;
  return (g[GLOBAL_KEY] ??= boot());
}
