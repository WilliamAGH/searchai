// src/lib/telemetry.ts
import { logger } from "./logger";

interface TelemetryEvent {
  name: string;
  properties?: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
}

class TelemetryService {
  private events: TelemetryEvent[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private sessionId: string;
  private enabled: boolean;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.enabled = import.meta.env.VITE_TELEMETRY_ENABLED === "true";

    if (this.enabled) {
      // Flush every 30 seconds
      this.flushInterval = setInterval(() => this.flush(), 30000);

      // Flush on page unload
      if (typeof window !== "undefined") {
        window.addEventListener("beforeunload", () => this.flush());
      }
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  track(name: string, properties?: Record<string, unknown>) {
    if (!this.enabled) return;

    this.events.push({
      name,
      properties,
      timestamp: Date.now(),
      sessionId: this.sessionId,
    });

    // Auto-flush if too many events
    if (this.events.length > 100) {
      this.flush();
    }
  }

  timing(name: string, duration: number) {
    this.track(name, { duration });
  }

  error(name: string, error: Error) {
    this.track(name, {
      error: error.message,
      stack: error.stack,
    });
  }

  private async flush() {
    if (!this.enabled || this.events.length === 0) return;

    const eventsToSend = [...this.events];
    this.events = [];

    try {
      // Only send in production
      if (import.meta.env.PROD) {
        await fetch("/api/telemetry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: eventsToSend }),
        });
      } else {
        // In dev, just log
        logger.debug("Telemetry events:", eventsToSend);
      }
    } catch (error: unknown) {
      logger.error("Failed to send telemetry", error);
      // Re-add events on failure
      this.events.unshift(...eventsToSend);
    }
  }

  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
    this.flush();
  }
}

// Export singleton
export const telemetry = new TelemetryService();
