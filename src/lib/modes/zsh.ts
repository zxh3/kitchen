/**
 * The zsh pane: a plain ttyd terminal onto the machine. Note that this is
 * only the PANE — zsh the login shell (its install, oh-my-zsh, the kitchen
 * prompt) is machine persona and lives in the base runtime, because herdr's
 * terminals run zsh too.
 *
 * Fragments are String.raw, never producing `${` — see types.ts.
 */

import type { Context } from "cordis";
import { ttydImageLayer, ttydThemePrelude } from "./terminal";
import type { SessionModeContribution } from "./types";

export const contribution = {
  id: "zsh",
  port: 7681,
  imageLayers: [ttydImageLayer],
  supervisedPrelude: [ttydThemePrelude],
  supervised: [
    String.raw`ttyd -p 17681 -i 127.0.0.1 -W -t "theme=$TTYD_THEME" -t fontSize=13 zsh &`,
  ],
  caddyBlock: String.raw`:7681 {
	import kitchenauth 17681
}`,
} as const satisfies SessionModeContribution;

export const name = "kitchen-mode-zsh";
export const inject = ["sessionModes"];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.sessionModes.register(contribution));
}
