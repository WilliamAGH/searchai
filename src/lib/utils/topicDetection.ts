// Minimal topic detection utilities for frontend

export function isTopicChange(
  currentMessage: string,
  previousMessage: string,
): boolean {
  // Simple heuristic for detecting topic changes
  if (!previousMessage) return false;

  // If messages are very different in length, might be topic change
  const lengthRatio =
    Math.abs(currentMessage.length - previousMessage.length) /
    Math.max(currentMessage.length, previousMessage.length);

  return lengthRatio > 0.5;
}
