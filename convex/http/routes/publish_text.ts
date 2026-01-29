import type { ActionCtx } from "../../_generated/server";
import { buildCorsTextResponse } from "./publish_cors";
import { loadExportData } from "./publish_export_data";

export async function handleChatTextMarkdown(ctx: ActionCtx, request: Request): Promise<Response> {
  const exportResult = await loadExportData(ctx, request, "auth");
  if (!exportResult.ok) {
    return exportResult.response;
  }

  const { markdown, robots, cacheControl } = exportResult.data;

  return buildCorsTextResponse(request, markdown, 200, "text/plain; charset=utf-8", {
    "X-Robots-Tag": robots,
    "Cache-Control": cacheControl,
    Vary: "Accept, Origin",
  });
}
