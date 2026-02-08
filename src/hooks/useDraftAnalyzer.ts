import { useCallback, useRef } from "react";
import { useDebounce } from "./useDebounce";

interface UseDraftAnalyzerProps {
  minLength?: number;
  debounceMs?: number;
  onAnalysis?: (draft: string, analysis: DraftAnalysis) => void;
}

interface DraftAnalysis {
  length: number;
  hasQuestion: boolean;
  topics: string[];
  sentiment: "neutral" | "positive" | "negative" | "question";
}

/**
 * Hook to analyze message drafts as user types
 */
export function useDraftAnalyzer({
  minLength = 50,
  debounceMs = 1200,
  onAnalysis,
}: UseDraftAnalyzerProps = {}) {
  const lastAnalysisRef = useRef<string>("");

  const analyzeDraft = useCallback(
    (draft: string) => {
      // Skip if draft is too short or unchanged
      if (draft.length < minLength || draft === lastAnalysisRef.current) {
        return;
      }

      lastAnalysisRef.current = draft;

      // Perform basic analysis
      const analysis: DraftAnalysis = {
        length: draft.length,
        hasQuestion:
          /\?|^(what|when|where|who|why|how|is|are|can|could|would|should)/i.test(
            draft,
          ),
        topics: extractTopics(draft),
        sentiment: detectSentiment(draft),
      };

      onAnalysis?.(draft, analysis);
    },
    [minLength, onAnalysis],
  );

  const debouncedAnalyze = useDebounce<[string]>(analyzeDraft, debounceMs);

  const handleDraftChange = useCallback(
    (draft: string) => {
      debouncedAnalyze(draft);
    },
    [debouncedAnalyze],
  );

  return {
    handleDraftChange,
    analyzeDraft,
  };
}

function extractTopics(text: string): string[] {
  // Simple topic extraction - can be enhanced
  const topics: string[] = [];

  // Check for common topics
  if (/AI|artificial intelligence|machine learning/i.test(text)) {
    topics.push("AI");
  }
  if (/code|programming|developer|software/i.test(text)) {
    topics.push("Programming");
  }
  if (/search|find|look for/i.test(text)) {
    topics.push("Search");
  }

  return topics;
}

function detectSentiment(text: string): DraftAnalysis["sentiment"] {
  if (/\?/.test(text)) return "question";
  if (/thanks|great|awesome|good|excellent/i.test(text)) return "positive";
  if (/bad|wrong|error|issue|problem/i.test(text)) return "negative";
  return "neutral";
}
