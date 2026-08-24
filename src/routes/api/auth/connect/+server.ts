import { json } from "@sveltejs/kit";
import { verifyToken } from "$lib/server/modal";
import {
  SessionConfigurationError,
  setCredentialSession,
} from "$lib/server/session";
import type { RequestHandler } from "./$types";

const MAX_INPUT_LENGTH = 512;

function input(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export const POST: RequestHandler = async ({ request, cookies }) => {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return json({ error: "Expected a JSON request body." }, { status: 400 });
  }

  const tokenId = input(body.tokenId);
  const tokenSecret = input(body.tokenSecret);
  const environment = input(body.environment);
  if (
    [tokenId, tokenSecret, environment].some(
      (value) => value.length > MAX_INPUT_LENGTH,
    )
  ) {
    return json({ error: "A credential value is too long." }, { status: 400 });
  }

  try {
    if (!tokenId || !tokenSecret) {
      return json(
        { error: "Enter both halves of a Modal token." },
        { status: 400 },
      );
    }
    const credentials = {
      tokenId,
      tokenSecret,
      environment: environment || undefined,
    };
    const result = await verifyToken(credentials);
    if (!result.ok) return json({ error: result.error }, { status: 401 });
    setCredentialSession(cookies, { kind: "modal", ...credentials });
    return json({ connected: true });
  } catch (error) {
    if (error instanceof SessionConfigurationError) {
      return json({ error: error.message }, { status: 503 });
    }
    throw error;
  }
};
