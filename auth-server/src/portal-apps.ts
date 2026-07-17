import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type PortalApp = {
  name: string;
  description?: string;
  url: string;
  enabled?: boolean;
};

const portalAppsPath = resolve(process.cwd(), "portal-apps.json");

function isPortalApp(value: unknown): value is PortalApp {
  if (!value || typeof value !== "object") return false;
  const app = value as Record<string, unknown>;
  return typeof app.name === "string" && typeof app.url === "string";
}

/** Load manually editable product links for the company portal home page. */
export function loadPortalApps(): PortalApp[] {
  if (!existsSync(portalAppsPath)) {
    return [];
  }

  try {
    const raw = JSON.parse(readFileSync(portalAppsPath, "utf8")) as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(isPortalApp)
      .filter((app) => app.enabled !== false)
      .map((app) => ({
        name: app.name.trim(),
        description: app.description?.trim() || undefined,
        url: app.url.trim(),
        enabled: true,
      }))
      .filter((app) => app.name && app.url);
  } catch (error) {
    console.error(`Failed to read ${portalAppsPath}:`, error);
    return [];
  }
}

export function portalAppsConfigPath() {
  return portalAppsPath;
}
