import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Every build gets its own id. It is baked into the app and also written to /version.json, so a running web app can tell when a
// newer version has been published (see src/lib/appUpdate.js).
const BUILD_ID = `${new Date().toISOString()}-${Math.random().toString(36).slice(2, 8)}`;
const emitVersion = () => ({
  name: "primovex-emit-version",
  generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ build: BUILD_ID }) }); },
});

export default defineConfig({
  plugins: [react(), emitVersion()],
  define: { __PRIMOVEX_BUILD__: JSON.stringify(BUILD_ID) },

  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },

  // Three pages: the app, the small corner alert window and the desktop orb window the desktop shell opens.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        alert: fileURLToPath(new URL("./alert.html", import.meta.url)),
        orb: fileURLToPath(new URL("./orb.html", import.meta.url)),
      },
    },
  },

  server: {
    host: true,
    port: 5173,
    strictPort: true,

    watch: {
      ignored: [
        "**/src-tauri/target/**",
        "**/.git/**",
        "**/node_modules/**",
      ],
    },
  },
});