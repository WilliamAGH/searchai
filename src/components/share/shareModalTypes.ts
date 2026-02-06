import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

export type PrivacyOption = "private" | "shared" | "public" | "llm";
export type PersistedPrivacy = Exclude<PrivacyOption, "llm">;

export type ShareModalMessage = {
  role: "user" | "assistant" | "system";
  content?: string;
  webResearchSources?: WebResearchSourceClient[] | undefined;
};
