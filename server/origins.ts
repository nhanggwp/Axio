import type { ServerConfig } from "./config";

/** Local aliases share a dev app; production retains its exact public origin. */
export function trustedAppOrigins(config: Pick<ServerConfig, "origin" | "production">) {
  const origin = new URL(config.origin);
  const origins = new Set([origin.origin]);
  const loopback = ["127.0.0.1", "localhost", "[::1]"];
  if (!config.production && loopback.includes(origin.hostname)) {
    for (const host of loopback) {
      const alias = new URL(origin.origin);
      alias.hostname = host;
      origins.add(alias.origin);
    }
  }
  return [...origins];
}
