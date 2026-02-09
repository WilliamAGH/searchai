import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables - process.env doesn't include VITE_ vars at config time
  const env = loadEnv(mode, process.cwd(), "");

  // Derive Convex proxy target if provided; otherwise disable proxy to avoid crashes
  const rawConvex = env.CONVEX_SITE_URL || env.VITE_CONVEX_URL || "";
  const convexProxyTarget = rawConvex
    ? rawConvex.replace(".convex.cloud", ".convex.site")
    : "";

  return {
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
    css: {
      postcss: "./config",
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
    server: convexProxyTarget
      ? {
          proxy: {
            "/api": {
              target: convexProxyTarget,
              changeOrigin: true,
              secure: true,
              rewrite: (path) => path,
            },
            "/sitemap.xml": {
              target: convexProxyTarget,
              changeOrigin: true,
              secure: true,
            },
          },
        }
      : {},
  };
});
