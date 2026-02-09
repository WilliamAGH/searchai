import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import type { Doc } from "../../_generated/dataModel";
import { formatConversationMarkdown } from "../utils";
import { publicCorsResponse } from "../cors";
import { isValidUuidV7 } from "../../lib/uuid";
import type { WebResearchSource } from "../../lib/validators";

type ExportedChat = {
  title: string;
  shareId?: string;
  publicId?: string;
  privacy?: "private" | "shared" | "public";
  createdAt?: number;
  updatedAt?: number;
};

type ExportedMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  webResearchSources?: WebResearchSource[];
};

export type ExportData = {
  chat: ExportedChat;
  messages: ExportedMessage[];
  markdown: string;
  robots: string;
  cacheControl: string;
};

export type ExportDataResult =
  | { ok: true; data: ExportData }
  | { ok: false; response: Response };

type ShareQueryMode = "auth" | "http";

/** Max length for shareId/publicId query params (UUIDv7 is ~26 chars; generous cap) */
const MAX_ID_PARAM_LENGTH = 100;

export async function loadExportData(
  ctx: ActionCtx,
  request: Request,
  mode: ShareQueryMode,
): Promise<ExportDataResult> {
  const url = new URL(request.url);
  const origin = request.headers.get("Origin");
  const shareIdParam = url.searchParams.get("shareId");
  const publicIdParam = url.searchParams.get("publicId");

  const shareId = shareIdParam
    ? String(shareIdParam).trim().slice(0, MAX_ID_PARAM_LENGTH)
    : undefined;
  const publicId = publicIdParam
    ? String(publicIdParam).trim().slice(0, MAX_ID_PARAM_LENGTH)
    : undefined;

  // Validate UUIDv7 format before querying
  if (shareId && !isValidUuidV7(shareId)) {
    return {
      ok: false,
      response: publicCorsResponse({
        body: JSON.stringify({ error: "Invalid shareId format" }),
        status: 400,
        origin,
      }),
    };
  }
  if (publicId && !isValidUuidV7(publicId)) {
    return {
      ok: false,
      response: publicCorsResponse({
        body: JSON.stringify({ error: "Invalid publicId format" }),
        status: 400,
        origin,
      }),
    };
  }

  if (!shareId && !publicId) {
    return {
      ok: false,
      response: publicCorsResponse({
        body: JSON.stringify({ error: "Missing shareId or publicId" }),
        status: 400,
        origin,
      }),
    };
  }

  // @ts-ignore - Known Convex TS2589 type instantiation issue on api.chats.*
  let chat: Doc<"chats"> | null;
  if (shareId) {
    chat = await ctx.runQuery(
      mode === "auth"
        ? api.chats.getChatByShareId
        : api.chats.getChatByShareIdHttp,
      { shareId },
    );
  } else if (publicId) {
    chat = await ctx.runQuery(api.chats.getChatByPublicId, { publicId });
  } else {
    // Unreachable: guarded by !shareId && !publicId check above
    return {
      ok: false,
      response: publicCorsResponse({
        body: JSON.stringify({ error: "Missing shareId or publicId" }),
        status: 400,
        origin,
      }),
    };
  }

  if (!chat) {
    return {
      ok: false,
      response: publicCorsResponse({
        body: JSON.stringify({ error: "Chat not found or not accessible" }),
        status: 404,
        origin,
      }),
    };
  }

  const messages = await ctx.runQuery(api.chats.getChatMessagesHttp, {
    chatId: chat._id,
  });

  const exportedChat: ExportedChat = {
    title: typeof chat.title === "string" ? chat.title : "Chat",
    shareId: typeof chat.shareId === "string" ? chat.shareId : undefined,
    publicId: typeof chat.publicId === "string" ? chat.publicId : undefined,
    privacy:
      chat.privacy === "private" ||
      chat.privacy === "shared" ||
      chat.privacy === "public"
        ? chat.privacy
        : undefined,
    createdAt: typeof chat.createdAt === "number" ? chat.createdAt : undefined,
    updatedAt: typeof chat.updatedAt === "number" ? chat.updatedAt : undefined,
  };

  const exportedMessages: ExportedMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content ?? "",
    timestamp: m.timestamp ?? 0,
    webResearchSources: m.webResearchSources,
  }));

  const markdown = formatConversationMarkdown({
    title: exportedChat.title,
    messages: exportedMessages,
  });

  const robots =
    exportedChat.privacy === "public" ? "index, follow" : "noindex, nofollow";
  const cacheControl =
    exportedChat.privacy === "public" ? "public, max-age=60" : "no-cache";

  return {
    ok: true,
    data: {
      chat: exportedChat,
      messages: exportedMessages,
      markdown,
      robots,
      cacheControl,
    },
  };
}
