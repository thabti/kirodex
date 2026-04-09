import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

// Redirect all shiki / @shikijs imports to lightweight stubs.
// Eliminates ~300 language grammar chunks (~8MB) from the bundle.
function shikiStubPlugin(): Plugin {
  const shikiStub = path.resolve(__dirname, "src/renderer/lib/shiki-stub.ts");
  const transformersStub = path.resolve(__dirname, "src/renderer/lib/shikijs-transformers-stub.ts");
  return {
    name: "shiki-stub",
    enforce: "pre",
    resolveId(source) {
      if (source === "@shikijs/transformers") return transformersStub;
      if (source === "shiki" || source.startsWith("shiki/")) return shikiStub;
      if (source.startsWith("@shikijs/")) return shikiStub;
    },
  };
}

export default defineConfig({
  plugins: [shikiStubPlugin(), tailwindcss(), react()],
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
    target: "safari16",
    minify: true,
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
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
