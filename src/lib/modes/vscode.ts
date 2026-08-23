/**
 * The vscode pane: code-server (VS Code in the browser), opened on the
 * workspace. Its image layers install code-server and pin the dark-theme /
 * no-telemetry defaults.
 *
 * Fragments are String.raw, never producing `${` — see types.ts.
 */

import type { Context } from "cordis";
import { WORKSPACE_DIR } from "$lib/types";
import type { SessionModeContribution } from "./types";

const CODE_SERVER_VERSION = "4.133.0";

export const contribution = {
  id: "vscode",
  port: 8443,
  imageLayers: [
    `RUN curl -fsSL https://code-server.dev/install.sh | sh -s -- --method=standalone --version=${CODE_SERVER_VERSION}`,
    // code-server defaults: dark theme, no telemetry, no trust prompts.
    // `autoDetectColorScheme` must be off — it is on by default and follows the
    // *browser's* preference, which silently overrode the theme and rendered the
    // pane light inside a dark console. The theme id is the one this build
    // actually contributes ("Dark Modern"); ids from other versions are ignored.
    `RUN mkdir -p /root/.local/share/code-server/User && printf '%s' '{"workbench.colorTheme":"Dark Modern","window.autoDetectColorScheme":false,"security.workspace.trust.enabled":false,"telemetry.telemetryLevel":"off","workbench.startupEditor":"none"}' > /root/.local/share/code-server/User/settings.json`,
  ],
  supervised: [
    `code-server --bind-addr 127.0.0.1:18443 --auth none --disable-telemetry ${WORKSPACE_DIR} &`,
  ],
  caddyBlock: String.raw`:8443 {
	import kitchenauth 18443
}`,
} as const satisfies SessionModeContribution;

export const name = "kitchen-mode-vscode";
export const inject = ["sessionModes"];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.sessionModes.register(contribution));
}
