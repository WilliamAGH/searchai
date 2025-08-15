import { describe, it, expect } from "vitest";
import {
  generateStableId,
  generateTimestampId,
  getSafeTimestamp,
} from "../../src/lib/utils/id";

describe("id utils", () => {
  it("generateStableId returns SSR placeholder on server", () => {
    const originalWindow = (global as any).window;
    // simulate SSR
    // @ts-expect-error - window is undefined on purpose
    delete (global as any).window;
    const id = generateStableId("pref");
    expect(id).toBe("pref_ssr_placeholder");
    // restore
    (global as any).window = originalWindow;
  });

  it("generateStableId returns incrementing ids on client", () => {
    const originalWindow = (global as any).window;
    (global as any).window = originalWindow ?? {};
    const id1 = generateStableId("x");
    const id2 = generateStableId("x");
    expect(id1).not.toBe(id2);
    expect(id1.startsWith("x_")).toBe(true);
    (global as any).window = originalWindow;
  });

  it("generateTimestampId throws on SSR and returns value on client", () => {
    const originalWindow = (global as any).window;
    // SSR path
    // @ts-expect-error
    delete (global as any).window;
    expect(() => generateTimestampId("p")).toThrow();
    // client path
    (global as any).window = originalWindow ?? {};
    const id = generateTimestampId("p");
    expect(id.startsWith("p_")).toBe(true);
  });

  it("getSafeTimestamp returns 0 on SSR and number on client", () => {
    const originalWindow = (global as any).window;
    // SSR path
    // @ts-expect-error
    delete (global as any).window;
    expect(getSafeTimestamp()).toBe(0);
    // client path
    (global as any).window = originalWindow ?? {};
    expect(typeof getSafeTimestamp()).toBe("number");
  });
});
