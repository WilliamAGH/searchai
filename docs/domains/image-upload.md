---
title: "Image upload architecture"
usage: "Reference when modifying image attachment, upload, or multimodal agent input code"
description: "Documents the image upload data flow from clipboard/file picker through Convex storage to GPT-4o vision"
---

# Image Upload Architecture

## Data Flow

1. User pastes/selects images in `MessageInput` (paste, file picker, drag-and-drop)
2. `useImageUpload` hook manages pending state with `URL.createObjectURL` previews
3. On send: `generateUploadUrl` mutation returns a short-lived POST target
4. Client POSTs file binary to that URL; response contains `storageId`
5. `imageStorageIds` passed through the message chain to the HTTP endpoint
6. Persisted alongside user message in `messages.imageStorageIds`
7. Workflow resolves IDs to serving URLs via `ctx.storage.getUrl()`
8. Workflow runs vision pre-analysis (Chat Completions `image_url`) and persists text as `messages.imageAnalysis`
9. Agent receives multimodal input: `AgentInputItem[]` with `input_image` plus injected `[IMAGE ANALYSIS]` text block
10. UI renders images via `useQuery(api.storage.getFileUrl)` per storage ID

## File Map

| File                                           | Role                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `convex/schema.ts`                             | `imageStorageIds` field on messages table         |
| `convex/storage.ts`                            | `generateUploadUrl` mutation + `getFileUrl` query |
| `convex/messages.ts`                           | `imageStorageIds` in `messageBaseArgs` validator  |
| `convex/messages_insert_document.ts`           | `imageStorageIds` in persistence pipeline         |
| `convex/chats/messageProjection.ts`            | Projects `imageStorageIds` to client              |
| `convex/agents/orchestration_session.ts`       | Resolves storage IDs to URLs                      |
| `convex/agents/vision_analysis.ts`             | Generates and persists `imageAnalysis`            |
| `convex/agents/input_builder.ts`               | Builds multimodal `AgentInputItem[]`              |
| `convex/agents/workflow_conversational.ts`     | Builds multimodal `AgentInputItem[]`              |
| `convex/http/routes/aiAgent_stream.ts`         | Sanitizes + passes `imageStorageIds`              |
| `src/hooks/useImageUpload.ts`                  | Client-side upload state management               |
| `src/components/ImageAttachmentPreview.tsx`    | Thumbnail preview strip                           |
| `src/components/MessageInput.tsx`              | Paste/file picker integration                     |
| `src/components/MessageList/MessageImages.tsx` | Renders images in messages                        |
| `src/components/MessageList/MessageItem.tsx`   | Renders `MessageImages` for user msgs             |

## Key Rules

- [VL1a]: `imageStorageIds` validated by Convex `v.id("_storage")` validators
- [CX1]: Storage URL resolution happens inside `"use node";` action context
- Vision pre-analysis is mandatory when images are attached; do not silently proceed without `imageAnalysis`.
- [RC1a]: Single upload path — Convex File Storage only, no fallbacks
- [LOC1]: All files remain under 350 LOC

## Constraints

- Max 4 images per message
- Accepted types: PNG, JPEG, GIF, WebP
  - Note: OpenAI's vision guide documents support for **non-animated** GIFs; we currently do not detect animation at upload time.
- Max file size: 20 MB per file
- Upload URLs expire in ~1 hour

## Dependencies (built-in, no additions)

| Capability             | Provider                                    |
| ---------------------- | ------------------------------------------- |
| File storage           | Convex `ctx.storage`                        |
| Multimodal agent input | `@openai/agents` `AgentInputItem[]`         |
| Vision model           | `LLM_VISION_MODEL` (default: `gpt-4o-mini`) |
| Clipboard paste        | Browser Clipboard API                       |
| File picker + camera   | `<input type="file" capture>`               |
