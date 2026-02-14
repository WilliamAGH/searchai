import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import type { HtmlTagDescriptor } from "vite";

const CHEF_WORKER_URL = "https://chef.convex.dev/scripts/worker.bundled.mjs";
const SA_SCRIPT_BASE = "https://scripts.simpleanalyticscdn.com";
const SA_NOSCRIPT_IMG =
  "https://queue.simpleanalyticscdn.com/noscript.gif?collect-dnt=true";
// Clicky Analytics — https://clicky.com/help/faq/setup
const CLICKY_SITE_ID = "101501245";
const CLICKY_SCRIPT_URL = "https://static.getclicky.com/js";
const CLICKY_NOSCRIPT_URL = `https://in.getclicky.com/${CLICKY_SITE_ID}ns.gif`;
const ENTRY_FILE = "main.tsx";

/* ── Simple Analytics tag builders ────────────────────────────── */

function buildSAScriptTag(scriptFile: string): HtmlTagDescriptor {
  return {
    tag: "script",
    attrs: {
      async: true,
      "data-collect-dnt": "true",
      src: `${SA_SCRIPT_BASE}/${scriptFile}`,
    },
    injectTo: "head",
  };
}

function buildSANoscriptTag(): HtmlTagDescriptor {
  return {
    tag: "noscript",
    children: `<img src="${SA_NOSCRIPT_IMG}" alt="" referrerpolicy="no-referrer-when-downgrade" />`,
    injectTo: "body",
  };
}

/* ── Clicky Analytics tag builders ────────────────────────────── */

function buildClickyScriptTag(): HtmlTagDescriptor {
  return {
    tag: "script",
    attrs: {
      async: true,
      "data-id": CLICKY_SITE_ID,
      src: CLICKY_SCRIPT_URL,
    },
    injectTo: "head",
  };
}

function buildClickyNoscriptTag(): HtmlTagDescriptor {
  return {
    tag: "noscript",
    children: `<p><img alt="Clicky" width="1" height="1" src="${CLICKY_NOSCRIPT_URL}" /></p>`,
    injectTo: "body",
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env variables - process.env doesn't include VITE_ vars at config time
  const env = loadEnv(mode, process.cwd(), "");

  // Derive Convex proxy target if provided; otherwise disable proxy to avoid crashes
  const rawConvex = env.CONVEX_SITE_URL || env.VITE_CONVEX_URL || "";
  const convexProxyTarget = rawConvex
    ? rawConvex.replace(".convex.cloud", ".convex.site")
    : "";
  const isDev = mode === "development";

  return {
    plugins: [
      react(),
      // Convex Chef dev tools — enables screenshot capture on chef.convex.dev
      isDev
        ? {
            name: "inject-chef-dev",
            transform(code: string, id: string) {
              if (id.includes(ENTRY_FILE)) {
                return {
                  code: `${code}

/* Added by Vite plugin inject-chef-dev */
window.addEventListener('message', async (message) => {
  if (message.source !== window.parent) return;
  if (message.data.type !== 'chefPreviewRequest') return;

  const worker = await import('${CHEF_WORKER_URL}');
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
      // Simple Analytics: privacy-first analytics (https://simpleanalytics.com)
      {
        name: "simple-analytics",
        transformIndexHtml(): HtmlTagDescriptor[] {
          const scriptFile = isDev ? "latest.dev.js" : "latest.js";
          return [buildSAScriptTag(scriptFile), buildSANoscriptTag()];
        },
      },
      // Clicky Analytics: real-time web analytics (https://clicky.com)
      // Production only — skip in dev to avoid polluting stats
      isDev
        ? null
        : {
            name: "clicky-analytics",
            transformIndexHtml(): HtmlTagDescriptor[] {
              return [buildClickyScriptTag(), buildClickyNoscriptTag()];
            },
          },
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
