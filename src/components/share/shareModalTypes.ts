export type PrivacyOption = "private" | "shared" | "public" | "llm";
export type PersistedPrivacy = Exclude<PrivacyOption, "llm">;

export type ShareModalMessage = {
  role: "user" | "assistant" | "system";
  content?: string;
  searchResults?: Array<{ title?: string; url?: string }> | undefined;
  sources?: string[] | undefined;
};
