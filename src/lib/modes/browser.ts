/**
 * The browser pane: NOT a service kitchen runs — a reverse proxy onto port
 * 3000 inside the sandbox, where the user starts their own dev server. So it
 * contributes no image layers, no env, no supervised process: only its
 * public port and the Caddy block that strips frame-busting headers and
 * explains the 502 when nothing is listening yet.
 *
 * Fragments are String.raw, never producing `${` — see types.ts.
 */

import type { Context } from "cordis";
import type { SessionModeContribution } from "./types";

export const contribution = {
  id: "browser",
  port: 8080,
  caddyBlock: String.raw`:8080 {
	@login {
		path /kitchen-auth
		query token=$KITCHEN_SECRET
	}
	handle @login {
		header Set-Cookie "kitchen=$KITCHEN_SECRET; Path=/; Secure; HttpOnly; SameSite=None"
		redir * / 302
	}
	@authed {
		header Cookie *kitchen=$KITCHEN_SECRET*
	}
	handle @authed {
		reverse_proxy 127.0.0.1:3000 {
			header_up Host {upstream_hostport}
			header_down -X-Frame-Options
			header_down -Content-Security-Policy
		}
	}
	handle {
		respond "kitchen: authentication required" 403
	}
	handle_errors {
		respond "kitchen: nothing is listening on port 3000 in this sandbox yet. start your app on port 3000 and reload this tab." 502
	}
}`,
} as const satisfies SessionModeContribution;

export const name = "kitchen-mode-browser";
export const inject = ["sessionModes"];

export function apply(ctx: Context) {
  ctx.effect(() => ctx.sessionModes.register(contribution));
}
