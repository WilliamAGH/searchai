/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Canvas / Image Mocks
// ---------------------------------------------------------------------------

let mockImageWidth = 100;
let mockImageHeight = 100;

class MockImage {
  src = "";
  onload: (() => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  get naturalWidth() {
    return mockImageWidth;
  }
  get naturalHeight() {
    return mockImageHeight;
  }

  constructor() {
    // Auto-fire onload on next microtask so the Promise resolves
    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

vi.stubGlobal("Image", MockImage);

// Track object URLs created/revoked by the module
const activeObjectUrls = new Set<string>();
let urlCounter = 0;

beforeEach(() => {
  urlCounter = 0;
  activeObjectUrls.clear();
  mockImageWidth = 100;
  mockImageHeight = 100;

  vi.stubGlobal(
    "URL",
    new Proxy(globalThis.URL, {
      get(target, prop) {
        if (prop === "createObjectURL") {
          return () => {
            const url = `blob:mock/${urlCounter++}`;
            activeObjectUrls.add(url);
            return url;
          };
        }
        if (prop === "revokeObjectURL") {
          return (url: string) => {
            activeObjectUrls.delete(url);
          };
        }
        return Reflect.get(target, prop);
      },
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, type: string, sizeBytes = 200): File {
  const buf = new ArrayBuffer(sizeBytes);
  return new File([buf], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("downscaleImageFile", () => {
  // Lazy import so global mocks are in place
  async function loadModule() {
    return (await import("../../../../src/lib/images/downscaleImageFile"))
      .downscaleImageFile;
  }

  it("throws for unsupported image types including GIF", async () => {
    const downscaleImageFile = await loadModule();

    const gif = makeFile("anim.gif", "image/gif");
    await expect(
      downscaleImageFile({ file: gif, maxDimensionPx: 512 }),
    ).rejects.toThrow("Unsupported image type for downscaling: image/gif");

    const bmp = makeFile("photo.bmp", "image/bmp");
    await expect(
      downscaleImageFile({ file: bmp, maxDimensionPx: 512 }),
    ).rejects.toThrow("Unsupported image type for downscaling: image/bmp");
  });

  it("returns images smaller than maxDimensionPx unchanged", async () => {
    const downscaleImageFile = await loadModule();
    mockImageWidth = 400;
    mockImageHeight = 300;

    const png = makeFile("small.png", "image/png");

    const result = await downscaleImageFile({
      file: png,
      maxDimensionPx: 2048,
    });

    // Should return the original file since 400 <= 2048
    expect(result).toBe(png);
  });

  it("downscales images larger than maxDimensionPx with correct aspect ratio", async () => {
    const downscaleImageFile = await loadModule();
    mockImageWidth = 4000;
    mockImageHeight = 2000;

    // Mock canvas and context
    const drawImageSpy = vi.fn();
    const mockCtx = {
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "low",
      drawImage: drawImageSpy,
    };

    const toBlobSpy = vi.fn((cb: (blob: Blob | null) => void, type: string) => {
      cb(new Blob(["fake-image"], { type }));
    });

    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx),
      toBlob: toBlobSpy,
    } as unknown as HTMLCanvasElement);

    const png = makeFile("big.png", "image/png");

    const result = await downscaleImageFile({
      file: png,
      maxDimensionPx: 2048,
    });

    // Should be a new file, not the original
    expect(result).not.toBe(png);
    expect(result.name).toBe("big.png");
    expect(result.type).toBe("image/png");

    // Verify aspect ratio: 4000x2000 scaled to max 2048 →
    // scale = 2048/4000 = 0.512 → dstW=2048, dstH=1024
    expect(drawImageSpy).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      2048,
      1024,
    );
  });

  it("throws when Canvas 2D context is unavailable", async () => {
    const downscaleImageFile = await loadModule();
    mockImageWidth = 4000;
    mockImageHeight = 2000;

    vi.spyOn(document, "createElement").mockReturnValue({
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(null),
      toBlob: vi.fn(),
    } as unknown as HTMLCanvasElement);

    const png = makeFile("big.png", "image/png");

    await expect(
      downscaleImageFile({ file: png, maxDimensionPx: 512 }),
    ).rejects.toThrow("Canvas 2D context unavailable");
  });
});
