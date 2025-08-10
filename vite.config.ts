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
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split vendor chunks for better caching
          if (id.includes("node_modules")) {
            if (id.includes("react") || id.includes("react-dom")) {
              return "react";
            }
            if (id.includes("convex")) {
              return "convex";
            }
            if (
              id.includes("@ai-sdk") ||
              id.includes("openai") ||
              id.includes("ai/")
            ) {
              return "ai";
            }
            if (id.includes("tailwind") || id.includes("@headlessui")) {
              return "ui";
            }
            return "vendor";
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
    sourcemap: true,
    // Use Vite's default esbuild minifier for better compatibility with React 19 and modern ESM.
    // Custom Terser settings previously caused runtime regressions (TDZ errors) in production.
  },
  server: {
    proxy: {
      "/api": {
        target: "https://diligent-greyhound-240.convex.cloud",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path,
      },
    },
  },
}));
