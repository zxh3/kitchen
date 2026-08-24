const LEGACY_KEY = "kitchen-modal-credentials";

export interface LegacyCredentials {
  tokenId: string;
  tokenSecret: string;
  environment?: string;
}

/** Read the old value only long enough to exchange it for a sealed session. */
export function loadLegacyCredentials(): LegacyCredentials | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<LegacyCredentials>;
    if (
      typeof value.tokenId !== "string" ||
      !value.tokenId ||
      typeof value.tokenSecret !== "string" ||
      !value.tokenSecret ||
      (value.environment !== undefined &&
        typeof value.environment !== "string")
    ) {
      return null;
    }
    return {
      tokenId: value.tokenId,
      tokenSecret: value.tokenSecret,
      environment: value.environment,
    };
  } catch {
    return null;
  }
}

/** Remove credentials written by versions that predate HttpOnly sessions. */
export function clearLegacyCredentials(): void {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage may be disabled; the server session remains usable regardless.
  }
}
