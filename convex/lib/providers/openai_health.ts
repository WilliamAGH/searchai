"use node";

/**
 * OpenAI Health Check Provider
 *
 * Schedules a lightweight background health check for OpenAI-compatible endpoints.
 * Ensures the model is responsive before allowing heavy traffic.
 * Uses a single-flight pattern to prevent stampeding checks.
 */

import type OpenAI from "openai";
import { getErrorMessage } from "../errors";

const DEFAULT_HEALTHCHECK_TIMEOUT_MS = 8000;
const HEALTHCHECK_INPUT = "healthcheck";
const HEALTHCHECK_MAX_TOKENS = 1;

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
        input: HEALTHCHECK_INPUT,
        max_output_tokens: HEALTHCHECK_MAX_TOKENS,
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

  healthCheckPromise = run().finally(() => {
    healthCheckPromise = null;
  });
};
