/**
 * GET /api/health — liveness plus a window into the mounted plugin tree:
 * which session modes the registry holds (the runtime assembles image layers
 * and boot script from exactly these) and the sandbox lifecycle events the
 * activity consumer recorded off the cordis bus. No UI reads this; it exists
 * so the prototype's composition is observable from the outside with curl.
 */

import { json } from "@sveltejs/kit";
import { kitchen } from "$lib/server/context";
import { RUNTIME_VERSION } from "$lib/server/runtime";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async () => {
  const ctx = await kitchen();
  return json({
    ok: true,
    runtime: RUNTIME_VERSION,
    sessionModes: ctx.sessionModes.list().map((m) => ({ id: m.id, port: m.port })),
    recentActivity: ctx.activity.recent(),
  });
};
