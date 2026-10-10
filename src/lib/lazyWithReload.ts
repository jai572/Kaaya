import { lazy, type ComponentType } from "react";

// Each deploy replaces the page files. A browser that opened the site before
// a deploy still asks for the old file names when it moves to the next page,
// and gets "Failed to fetch dynamically imported module". Reloading fetches
// the new version; the session-storage stamp stops a reload loop if something
// else is genuinely wrong.

const RELOAD_KEY = "kaaya-new-version-reload";

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk/i.test(message);
}

/** Reloads the page once per 30 seconds. Returns false if it didn't (so the caller should show the error). */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Without storage there's no loop guard, so don't auto-reload.
    return false;
  }
  window.location.reload();
  return true;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(() =>
    factory().catch((error) => {
      // Never resolves: the page is reloading.
      if (isChunkLoadError(error) && reloadForNewVersion()) return new Promise<{ default: T }>(() => {});
      throw error;
    })
  );
}
