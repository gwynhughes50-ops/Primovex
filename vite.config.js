import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],

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