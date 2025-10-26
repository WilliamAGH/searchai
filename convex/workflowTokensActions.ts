"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createHmac } from "node:crypto";
import type { StreamingPersistPayload } from "./agents/types";

export const signPersistedPayload = internalAction({
  args: {
    payload: v.any(),
    nonce: v.string(),
  },
  returns: v.string(),
  handler: async (_ctx, args) => {
    const signingKey = process.env.AGENT_SIGNING_KEY;
    if (!signingKey) {
      throw new Error(
        "AGENT_SIGNING_KEY missing. Configure via `npx convex env set AGENT_SIGNING_KEY <secret>`.",
      );
    }

    const payload = args.payload as StreamingPersistPayload;
    const body = JSON.stringify({ payload, nonce: args.nonce });
    return createHmac("sha256", signingKey).update(body).digest("hex");
  },
});
