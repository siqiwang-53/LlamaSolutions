export const WEB_SEARCH_STORAGE_KEY = "web-search-enabled";

export function parseStoredWebSearchFlag(raw: string | null) {
  if (raw === null || raw.trim() === "") {
    return true;
  }

  try {
    return JSON.parse(raw) !== false;
  } catch {
    return true;
  }
}

export function readWebSearchEnabled() {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return parseStoredWebSearchFlag(
      window.localStorage.getItem(WEB_SEARCH_STORAGE_KEY)
    );
  } catch {
    return true;
  }
}
