import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  root: ".",
  base: "/",
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/renderer"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Skip shiki grammars/themes — they're already lazy-loaded individually
          if (id.includes("shiki") || id.includes("@shikijs")) return;
          if (id.includes("@pierre")) return "vendor-diffs";
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) return "vendor-react";
          if (id.includes("react-markdown") || id.includes("remark") || id.includes("rehype") || id.includes("unified") || id.includes("mdast") || id.includes("hast") || id.includes("micromark")) return "vendor-markdown";
          if (id.includes("xterm") || id.includes("@xterm")) return "vendor-xterm";
          if (id.includes("@tauri-apps")) return "vendor-tauri";
          if (id.includes("@tabler/icons") || id.includes("lucide")) return "vendor-icons";
        },
      },
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    watch: {
      ignored: ['**/README.md', '**/activity.md', '**/src-tauri/**', '**/target/**'],
    },
  },
});
