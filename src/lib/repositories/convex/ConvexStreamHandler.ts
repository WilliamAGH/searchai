import type { ConvexReactClient } from "convex/react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { IdUtils } from "@/lib/types/unified";
import type { MessageStreamChunk } from "@/lib/types/message";
import { logger } from "@/lib/logger";
import { buildHttpError, readResponseBody } from "@/lib/utils/httpUtils";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import {
  parseSSEStream,
  isSSEParseError,
  type SSEEvent,
} from "@/lib/utils/sseParser";
import {
  verifyPersistedPayload,
  isSignatureVerificationAvailable,
} from "@/lib/security/signature";
import { env } from "@/lib/env";
import { z } from "zod/v4";
import type { StreamingPersistPayload } from "../../../../convex/agents/schema";
import {
  ProgressEventSchema,
  ReasoningEventSchema,
  ContentEventSchema,
  MetadataEventSchema,
  ToolResultEventSchema,
  ErrorEventSchema,
  PersistedEventSchema,
} from "@/lib/schemas/chatEvents";

export class ConvexStreamHandler {
  constructor(
    private client: ConvexReactClient,
    private sessionId: string | undefined,
    private fetchMessages: (chatId: string) => Promise<Doc<"messages">[]>,
  ) {}

  async *generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<MessageStreamChunk> {
    try {
      const host = window.location.hostname;
      const isDev = host === "localhost" || host === "127.0.0.1";
      const apiUrl = isDev
        ? "/api/ai/agent/stream"
        : `${env.convexUrl.replace(".convex.cloud", ".convex.site")}/api/ai/agent/stream`;

      const recent = await this.fetchMessages(chatId);
      const chatHistory = recent
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          chatId: IdUtils.toConvexChatId(chatId),
          sessionId: this.sessionId,
          conversationContext: chatHistory
            .map(
              (m) =>
                `${m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}: ${m.content}`,
            )
            .join("\n")
            .slice(0, 4000),
        }),
      });

      if (!response.ok) {
        const errorText = await readResponseBody(response);
        throw buildHttpError(
          response,
          errorText,
          "ConvexChatRepository.generateResponse",
        );
      }

      for await (const evt of parseSSEStream(response)) {
        if (isSSEParseError(evt)) {
          logger.error("Failed to parse SSE frame", {
            error: evt.error,
            raw: evt.raw,
            chatId,
          });
          yield {
            type: "error",
            error: `Failed to parse SSE frame: ${evt.error}`,
          };
          continue;
        }

        const processed = await this.handleStreamEvent(evt);
        if (processed) {
          yield processed;
        }
      }
    } catch (error) {
      yield {
        type: "error",
        error: getErrorMessage(error),
      };
    }
  }

  private async handleStreamEvent(
    evt: SSEEvent,
  ): Promise<MessageStreamChunk | null> {
    if (evt.type === "progress") {
      return this.parseStreamEvent(ProgressEventSchema, evt);
    }
    if (evt.type === "reasoning") {
      return this.parseStreamEvent(ReasoningEventSchema, evt);
    }
    if (evt.type === "content") {
      return this.parseStreamEvent(ContentEventSchema, evt);
    }
    if (evt.type === "metadata") {
      return this.parseStreamEvent(MetadataEventSchema, evt);
    }
    if (evt.type === "tool_result") {
      return this.parseStreamEvent(ToolResultEventSchema, evt);
    }
    if (evt.type === "error") {
      return this.parseStreamEvent(ErrorEventSchema, evt);
    }
    if (evt.type === "complete") {
      return { type: "done" };
    }
    if (evt.type === "persisted") {
      return this.handlePersistedEvent(evt);
    }
    return null;
  }

  private async handlePersistedEvent(
    evt: SSEEvent,
  ): Promise<MessageStreamChunk | null> {
    const parsed = PersistedEventSchema.safeParse(evt);
    if (!parsed.success) {
      logger.error("Invalid persisted SSE event payload", {
        error: parsed.error,
        sessionId: this.sessionId,
      });
      return null;
    }

    const signingKey = env.agentSigningKey;

    if (
      signingKey &&
      isSignatureVerificationAvailable() &&
      parsed.data.payload &&
      parsed.data.nonce &&
      parsed.data.signature
    ) {
      const isValid = await verifyPersistedPayload(
        parsed.data.payload,
        parsed.data.nonce,
        parsed.data.signature,
        signingKey,
      );

      if (!isValid) {
        logger.error("🚫 Invalid signature detected on persisted event", {
          workflowId: parsed.data.payload.workflowId,
          nonce: parsed.data.nonce,
        });
        return null;
      }

      logger.debug("✅ Signature verified for persisted event", {
        workflowId: parsed.data.payload.workflowId,
      });
    }

    let payloadWithTypedId: StreamingPersistPayload;
    try {
      payloadWithTypedId = {
        ...parsed.data.payload,
        assistantMessageId: IdUtils.toConvexMessageId(
          parsed.data.payload.assistantMessageId,
        ),
      };
    } catch (error) {
      logger.error("Invalid assistantMessageId in persisted payload", {
        error: getErrorMessage(error),
        assistantMessageId: parsed.data.payload.assistantMessageId,
      });
      return null;
    }

    return {
      ...parsed.data,
      payload: payloadWithTypedId,
    };
  }

  private parseStreamEvent<T extends MessageStreamChunk>(
    schema: z.ZodSchema<T>,
    evt: SSEEvent,
  ): T | null {
    const parsed = schema.safeParse(evt);
    if (!parsed.success) {
      logger.error("Invalid SSE event payload", {
        type: evt.type,
        error: parsed.error,
        sessionId: this.sessionId,
      });
      return null;
    }
    return parsed.data;
  }
}
