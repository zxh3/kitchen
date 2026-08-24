import { redirect } from "@sveltejs/kit";
import { ApiError, api } from "$lib/api";
import type { ConnectionInfo } from "$lib/types";
import type { LayoutLoad } from "./$types";

// Panes and their controls are browser-only. Authentication itself is a
// same-origin HttpOnly cookie and never enters page data.
export const ssr = false;

export const load: LayoutLoad = async ({ url, fetch }) => {
  // Settings has to stay reachable even when the credentials are wrong — it is
  // where they get fixed — so failures there resolve to "no connection"
  // instead of redirecting.
  const isSettings = url.pathname.startsWith("/connect");
  try {
    const connection = await api<ConnectionInfo>("/api/connection", {}, fetch);
    return { connection };
  } catch (e) {
    if (isSettings) return { connection: null as ConnectionInfo | null };
    if (e instanceof ApiError && e.status === 401) redirect(307, "/connect");
    throw e;
  }
};
