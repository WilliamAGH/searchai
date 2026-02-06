import type { ActionCtx } from "../../_generated/server";
import { publicCorsResponse } from "../cors";
import { loadExportData } from "./publish_export_data";

export async function handleChatTextMarkdown(
  ctx: ActionCtx,
  request: Request,
): Promise<Response> {
  const origin = request.headers.get("Origin");

  const exportResult = await loadExportData(ctx, request, "auth");
  if (!exportResult.ok) {
    return exportResult.response;
  }

  const { markdown, robots, cacheControl } = exportResult.data;

  return publicCorsResponse({
    body: markdown,
    status: 200,
    origin,
    contentType: "text/plain; charset=utf-8",
    extraHeaders: {
      "X-Robots-Tag": robots,
      "Cache-Control": cacheControl,
      Vary: "Accept, Origin",
    },
  });
}
