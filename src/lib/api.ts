export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Call a Kitchen API endpoint using its same-origin HttpOnly session. */
export async function api<T>(
  path: string,
  init: RequestInit = {},
  fetchFn: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchFn(path, {
    ...init,
    credentials: "same-origin",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      res.status,
      body?.error ?? `Request failed (${res.status}).`,
    );
  }
  return body as T;
}
