import { internalMutation } from "../_generated/server";

export const removeSystemRole = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Get all messages with system role
    const systemMessages = await ctx.db
      .query("messages")
      .filter((q) => q.eq(q.field("role"), "system"))
      .collect();

    // Convert to assistant role
    for (const msg of systemMessages) {
      await ctx.db.patch(msg._id, { role: "assistant" });
    }

    return { converted: systemMessages.length };
  },
});
