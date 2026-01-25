"use node";

import type OpenAI from "openai";
import { getErrorMessage } from "../errors";

const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 8000;
let healthCheckPromise: Promise<void> | null = null;

export const scheduleOpenAIHealthCheck = (params: {
  client: OpenAI;
  model: string;
  isOpenAIEndpoint: boolean;
}) => {
  if (!params.isOpenAIEndpoint) return;
  if (!process.env.LLM_API_KEY && !process.env.OPENAI_API_KEY) return;
  if (process.env.LLM_HEALTHCHECK === "0") return;
  if (healthCheckPromise) return;

  const timeoutMs = Number.parseInt(
    process.env.LLM_HEALTHCHECK_TIMEOUT_MS || "",
    10,
  );
  const maxWait =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_HEALTHCHECK_TIMEOUT_MS;

  const run = async () => {
    const start = Date.now();
    try {
      const check = params.client.responses.create({
        model: params.model,
        input: "healthcheck",
        max_output_tokens: 1,
      });
      await Promise.race([
        check,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Health check timeout")), maxWait),
        ),
      ]);
      console.info(
        "✅ OpenAI health check passed",
        `${params.model} (${Date.now() - start}ms)`,
      );
    } catch (error) {
      console.error("❌ OpenAI health check failed", {
        model: params.model,
        error: getErrorMessage(error),
      });
    }
  };

  healthCheckPromise = run();
};
