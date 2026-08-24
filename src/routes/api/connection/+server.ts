import { json } from "@sveltejs/kit";
import { credentialsFrom, verifyToken } from "$lib/server/modal";
import type { RequestHandler } from "./$types";

/** Verify the credentials represented by the sealed browser session. */
export const GET: RequestHandler = async ({ request }) => {
  const creds = credentialsFrom(request);
  if (!creds) {
    return json(
      { error: "No authenticated Modal connection." },
      { status: 401 },
    );
  }
  const result = await verifyToken(creds);
  if (!result.ok) return json({ error: result.error }, { status: 401 });
  return json({
    workspace: result.workspace,
    environment: creds.environment ?? null,
  });
};
