/**
 * The session-mode registry: the cordis service that mode plugins register
 * into, and runtime.ts reads back out.
 *
 * Registration follows the harness rule — registrations are reversible
 * effects: register() returns the disposer, and mode plugins install it
 * through ctx.effect(), so unloading a mode's fiber withdraws the pane from
 * the runtime the next boot assembles.
 */

import { Context, Service } from "cordis";
import type { SessionModeContribution } from "$lib/modes/types";

declare module "cordis" {
  interface Context {
    sessionModes: SessionModes;
  }
}

export class SessionModes extends Service {
  // NOTE: no native #private fields — cordis serves this instance through a
  // proxy, and a proxy receiver can't satisfy the #field brand check.
  private readonly modes = new Map<string, SessionModeContribution>();

  constructor(ctx: Context) {
    super(ctx, "sessionModes");
  }

  /**
   * Contribute one pane. Misconfiguration fails loud at boot: a duplicate id
   * or a port collision is a programming error in src/lib/modes/, not a
   * runtime condition to tolerate.
   * @param contribution - the pane's complete runtime contribution.
   * @returns the disposer that withdraws the contribution.
   */
  register(contribution: SessionModeContribution): () => void {
    const { id, port } = contribution;
    if (this.modes.has(id)) {
      throw new Error(`session mode registered twice: ${id}`);
    }
    const clash = [...this.modes.values()].find((m) => m.port === port);
    if (clash) {
      throw new Error(
        `session mode ${id}: port ${port} already claimed by ${clash.id}`,
      );
    }
    this.modes.set(id, contribution);
    return () => void this.modes.delete(id);
  }

  /** Every registered pane, in registration order. */
  list(): readonly SessionModeContribution[] {
    return [...this.modes.values()];
  }
}
