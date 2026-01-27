import { api } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { formatConversationMarkdown } from "../utils";
import { buildCorsJsonResponse } from "./publish_cors";

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
  searchResults?: Array<{ title?: string; url?: string }>;
  sources?: string[];
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

export async function loadExportData(
  ctx: ActionCtx,
  request: Request,
  mode: ShareQueryMode,
): Promise<ExportDataResult> {
  const url = new URL(request.url);
  const shareIdParam = url.searchParams.get("shareId");
  const publicIdParam = url.searchParams.get("publicId");

  const shareId = shareIdParam
    ? String(shareIdParam).trim().slice(0, 100)
    : undefined;
  const publicId = publicIdParam
    ? String(publicIdParam).trim().slice(0, 100)
    : undefined;

  if (!shareId && !publicId) {
    return {
      ok: false,
      response: buildCorsJsonResponse(
        request,
        { error: "Missing shareId or publicId" },
        400,
      ),
    };
  }

  const chat = shareId
    ? await ctx.runQuery(
        mode === "auth"
          ? api.chats.getChatByShareId
          : api.chats.getChatByShareIdHttp,
        { shareId },
      )
    : await ctx.runQuery(api.chats.getChatByPublicId, { publicId: publicId! });

  if (!chat) {
    return {
      ok: false,
      response: buildCorsJsonResponse(
        request,
        { error: "Chat not found or not accessible" },
        404,
      ),
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
    searchResults: m.searchResults,
    sources: m.sources,
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
