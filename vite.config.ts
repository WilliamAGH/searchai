import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    // The code below enables dev tools like taking screenshots of your site
    // while it is being developed on chef.convex.dev.
    // Feel free to remove this code if you're no longer developing your app with Chef.
    mode === "development"
      ? {
          name: "inject-chef-dev",
          transform(code: string, id: string) {
            if (id.includes("main.tsx")) {
              return {
                code: `${code}

/* Added by Vite plugin inject-chef-dev */
window.addEventListener('message', async (message) => {
  if (message.source !== window.parent) return;
  if (message.data.type !== 'chefPreviewRequest') return;

  const worker = await import('https://chef.convex.dev/scripts/worker.bundled.mjs');
  await worker.respondToMessage(message);
});
            `,
                map: null,
              };
            }
            return null;
          },
        }
      : null,
    // End of code for taking screenshots on chef.convex.dev.
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Conservative chunk splitting to keep React/runtime intact while
    // extracting a few heavy but decoupled areas for caching.
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return;
          if (id.includes("convex")) return "convex";
          if (id.includes("tailwind") || id.includes("@headlessui"))
            return "ui";
          // Do not force vendor/react chunks to avoid TDZ/cycle issues.
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: mode !== "production",
  },
  server: {
    proxy: {
      "/api": {
        target: "https://diligent-greyhound-240.convex.site",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
    },
  },
}));
