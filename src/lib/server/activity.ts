/**
 * Recent sandbox lifecycle activity: the first consumer of the cordis event
 * bus, kept deliberately small. modal.ts emits `sandbox/started` /
 * `sandbox/stopped`; this service records them in a small ring buffer, and
 * /api/health serves the buffer — enough to watch the bus work end to end
 * with curl, without growing a UI feature before the bus has real consumers
 * (telemetry, a palette activity feed, webhooks) to justify one.
 */

import { Context, Service } from "cordis";

declare module "cordis" {
  interface Context {
    activity: Activity;
  }
}

export interface ActivityEntry {
  event: "started" | "stopped";
  /** The sandbox's kitchen name, or its Modal id when the name wasn't looked up. */
  sandbox: string;
  at: string; // ISO
}

const MAX_ENTRIES = 20;

export class Activity extends Service {
  // TS-private, not #private: cordis proxies services (see registry.ts).
  private readonly entries: ActivityEntry[] = [];

  constructor(ctx: Context) {
    super(ctx, "activity");
    ctx.on("sandbox/started", (e) => this.record("started", e));
    ctx.on("sandbox/stopped", (e) => this.record("stopped", e));
  }

  record(event: ActivityEntry["event"], e: { name: string; sandboxId: string }) {
    this.entries.push({
      event,
      sandbox: e.name,
      at: new Date().toISOString(),
    });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }
  }

  /** Newest last. */
  recent(): readonly ActivityEntry[] {
    return [...this.entries];
  }
}
