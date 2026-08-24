import { json } from "@sveltejs/kit";
import { clearCredentialSession } from "$lib/server/session";
import type { RequestHandler } from "./$types";

export const DELETE: RequestHandler = ({ cookies }) => {
  clearCredentialSession(cookies);
  return json({ disconnected: true });
};
