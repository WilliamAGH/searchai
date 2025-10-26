import React from "react";
import { createRoot } from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { env, initializeEnv } from "./lib/env";

// Validate environment variables on startup
initializeEnv();

const convex = new ConvexReactClient(env.convexUrl);

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element not found");
}

createRoot(rootEl).render(
  <ErrorBoundary>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </ErrorBoundary>,
);
