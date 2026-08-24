import { json, type Handle } from "@sveltejs/kit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestHost(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0];
  return forwarded?.trim() || request.headers.get("host");
}

function hasForeignOrigin(request: Request): boolean {
  // Fetch Metadata describes the browser-visible request, so prefer it over
  // host headers that a trusted reverse proxy may rewrite before they reach
  // the app. Browsers do not allow page scripts to forge Sec-Fetch-* headers.
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin") return false;
  if (fetchSite === "same-site" || fetchSite === "cross-site") return true;

  // Older browsers and non-browser clients may omit Fetch Metadata. Keep an
  // Origin check as a fallback for those requests.
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
    if (hasForeignOrigin(event.request)) {
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
