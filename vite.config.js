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

  // Two pages: the app, and the small corner alert window the desktop shell opens.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        alert: fileURLToPath(new URL("./alert.html", import.meta.url)),
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