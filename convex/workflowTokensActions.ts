"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { createHmac } from "node:crypto";
import { StreamingPersistPayloadSchema } from "./schemas/agents";

export const signPersistedPayload = internalAction({
  args: {
    // v.any() used here because payload is validated by Zod schema inside handler
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

    const parsedPayload = StreamingPersistPayloadSchema.safeParse(args.payload);
    if (!parsedPayload.success) {
      throw new Error("Invalid persisted payload");
    }
    const payload = parsedPayload.data;
    const body = JSON.stringify({ payload, nonce: args.nonce });
    return createHmac("sha256", signingKey).update(body).digest("hex");
  },
});
