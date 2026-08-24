import { json, type Handle } from "@sveltejs/kit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHost(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0];
  return forwarded?.trim() || request.headers.get("host");
}

function hasForeignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host !== requestHost(request);
  } catch {
    return true;
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  let response: Response;
  if (
    event.url.pathname.startsWith("/api/") &&
    !SAFE_METHODS.has(event.request.method)
  ) {
    const fetchSite = event.request.headers.get("sec-fetch-site");
    if (hasForeignOrigin(event.request) || fetchSite === "cross-site") {
      response = json(
        { error: "Cross-origin request rejected." },
        { status: 403 },
      );
    } else {
      response = await resolve(event);
    }
  } else {
    response = await resolve(event);
  }
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  if (event.url.pathname.startsWith("/api/")) {
    response.headers.set("Cache-Control", "no-store");
  }
  return response;
};
