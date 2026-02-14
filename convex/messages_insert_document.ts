import type { Id } from "./_generated/dataModel";
import type { SearchMethod } from "./lib/constants/search";
import { normalizeHttpUrl } from "./lib/urlHttp";
import type { WebResearchSource } from "./lib/validators";

/**
 * Persistable fields for a messages table insert.
 * Transport-only fields (sessionId/workflowTokenId) are intentionally excluded.
 */
export interface PersistableMessageArgs {
  role: "user" | "assistant";
  content?: string;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;
  reasoning?: string;
  searchMethod?: SearchMethod;
  hasRealResults?: boolean;
  webResearchSources?: WebResearchSource[];
  workflowId?: string;
  imageStorageIds?: Id<"_storage">[];
  imageAnalysis?: string;
}

export interface MessageInsertDocument<
  TChatId extends string = string,
> extends PersistableMessageArgs {
  chatId: TChatId;
  messageId: string;
  threadId: string;
  timestamp: number;
}

export interface BuildMessageInsertDocumentParams<
  TChatId extends string = string,
> {
  chatId: TChatId;
  messageId: string;
  threadId: string;
  args: PersistableMessageArgs;
  timestamp?: number;
}

type OptionalField = keyof Omit<PersistableMessageArgs, "role">;
const MAX_PERSISTED_URL_LENGTH = 2048;

function normalizePersistedWebResearchSources(
  sources: WebResearchSource[] | undefined,
): WebResearchSource[] | undefined {
  if (!sources) return undefined;

  const normalized: WebResearchSource[] = [];
  for (const source of sources) {
    if (source.url === undefined) {
      normalized.push(source);
      continue;
    }
    const normalizedUrl = normalizeHttpUrl(
      source.url,
      MAX_PERSISTED_URL_LENGTH,
    );
    if (!normalizedUrl) {
      console.error("[messages] Excluded source with invalid URL", {
        contextId: source.contextId,
        originalUrl: source.url,
      });
      continue;
    }
    normalized.push(
      source.url === normalizedUrl ? source : { ...source, url: normalizedUrl },
    );
  }
  return normalized;
}

/** Explicit allowlist of optional fields copied from args to the document. */
const OPTIONAL_FIELDS: readonly OptionalField[] = [
  "content",
  "isStreaming",
  "streamedContent",
  "thinking",
  "reasoning",
  "searchMethod",
  "hasRealResults",
  "webResearchSources",
  "workflowId",
  "imageStorageIds",
  "imageAnalysis",
] as const;

type OptionalFieldsPartial = Partial<Omit<PersistableMessageArgs, "role">>;

/** Pick defined optional fields from args into a typed partial. */
function pickDefinedFields(
  args: PersistableMessageArgs,
): OptionalFieldsPartial {
  const partial = {} as OptionalFieldsPartial;
  for (const key of OPTIONAL_FIELDS) {
    if (args[key] !== undefined) {
      // TS cannot narrow Partial<T>[K] writes when K is a union key type
      // (resolves the LHS to `never`). This is a known TS limitation.
      // SAFETY: key is from OPTIONAL_FIELDS, constrained to keys shared
      // by both PersistableMessageArgs and OptionalFieldsPartial.
      (partial[key] as PersistableMessageArgs[typeof key]) = args[key];
    }
  }
  return partial;
}

/**
 * Build a messages insert payload using explicit field mapping.
 * This prevents accidental persistence of extra transport-only args.
 */
export function buildMessageInsertDocument<TChatId extends string>(
  params: BuildMessageInsertDocumentParams<TChatId>,
): MessageInsertDocument<TChatId> {
  const { chatId, messageId, threadId, args, timestamp = Date.now() } = params;
  const normalizedArgs: PersistableMessageArgs = {
    ...args,
    webResearchSources: normalizePersistedWebResearchSources(
      args.webResearchSources,
    ),
  };

  return {
    chatId,
    messageId,
    threadId,
    role: normalizedArgs.role,
    timestamp,
    ...pickDefinedFields(normalizedArgs),
  };
}
