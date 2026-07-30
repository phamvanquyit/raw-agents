import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import pkg from "../../package.json" with { type: "json" };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: __dirname,
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      // "src/common/..." → packages/web/common/...
      src: resolve(__dirname),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: false,
    reportCompressedSize: false,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
      output: {
        manualChunks(id) {
          // Monaco editor — largest single chunk
          if (id.includes("monaco-editor") || id.includes("@monaco-editor")) {
            return "vendor-monaco";
          }
          // PixiJS
          if (id.includes("pixi.js") || id.includes("@pixi")) {
            return "vendor-pixi";
          }
          // Mermaid + its heavy sub-deps (katex, cytoscape, etc.)
          if (id.includes("mermaid") || id.includes("katex") || id.includes("cytoscape") || id.includes("dagre") || id.includes("elkjs")) {
            return "vendor-mermaid";
          }
          // Framer Motion
          if (id.includes("framer-motion")) {
            return "vendor-framer";
          }
          // All other node_modules (including react + react-dom) → one chunk
          // NOTE: do NOT split react/react-dom into a separate chunk — packages
          // in vendor-misc import react, creating a circular chunk dependency
          // that causes a runtime TypeError on the production build.
          if (id.includes("node_modules")) {
            return "vendor-misc";
          }
        },
      },
    },
  },
  server: {
    port: 5888,
    open: true,
    proxy: {
      // Proxy API calls to the Hono server during dev
      "/api": {
        target: "http://127.0.0.1:15888",
        changeOrigin: true,
      },
      // Public site HTML + assets (Hono React sites — not the SPA shell)
      "/public/sites": {
        target: "http://127.0.0.1:15888",
        changeOrigin: true,
      },
      // Proxy WebSocket connections to the Hono server
      "/ws": {
        target: "ws://127.0.0.1:15888",
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
