import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = Number(env.PORT) || 3001;
  const host = !env.HOST || ["0.0.0.0", "::"].includes(env.HOST) ? "127.0.0.1" : env.HOST;
  const backend = `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
  const app = new URL(env.APP_ORIGIN || "http://127.0.0.1:5173");
  const frontendPort = ["127.0.0.1", "localhost", "[::1]"].includes(app.hostname)
    ? Number(app.port || (app.protocol === "https:" ? 443 : 80))
    : undefined;
  return {
  plugins: [react()],
  server: {
    port: frontendPort,
    strictPort: true,
    // Playwright traces contain HTML snapshots; writing them must not reload Axio.
    watch: { ignored: ["**/axio-test-results/**", "**/test-results/**", "**/playwright-report/**", "**/.cache/**", "**/docs/**"] },
    fs: {
      deny: [
        "**/.env*",
        "**/*.{crt,pem}",
        "**/.git/**",
        "**/data/**",
        "**/*.sqlite*",
        "**/.auth-secret",
        "**/prompt*.md",
      ],
    },
    proxy: { "/api": { target: backend, changeOrigin: false } },
  },
  };
});
