import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Id } from "../../../convex/_generated/dataModel";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateUploadUrl = vi.fn();
const mockValidateImageUpload = vi.fn();

vi.mock("convex/react", () => ({
  useMutation: () => mockGenerateUploadUrl,
  useAction: () => mockValidateImageUpload,
}));

vi.mock("@/lib/images/downscaleImageFile", () => ({
  downscaleImageFile: vi.fn(({ file }: { file: File }) =>
    Promise.resolve(file),
  ),
}));

// Stable object-URL counter so tests can assert revocation
let objectUrlCounter = 0;
const createdObjectUrls = new Set<string>();

beforeEach(() => {
  objectUrlCounter = 0;
  createdObjectUrls.clear();

  vi.stubGlobal(
    "URL",
    new Proxy(globalThis.URL, {
      get(target, prop) {
        if (prop === "createObjectURL") {
          return (_blob: Blob) => {
            const url = `blob:test/${objectUrlCounter++}`;
            createdObjectUrls.add(url);
            return url;
          };
        }
        if (prop === "revokeObjectURL") {
          return (url: string) => {
            createdObjectUrls.delete(url);
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

// Lazy import so mocks are in place
async function importHook() {
  const mod = await import("../../../src/hooks/useImageUpload");
  return mod.useImageUpload;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name: string, type: string, sizeBytes = 100): File {
  const buf = new ArrayBuffer(sizeBytes);
  return new File([buf], name, { type });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useImageUpload", () => {
  let useImageUpload: Awaited<ReturnType<typeof importHook>>;

  beforeEach(async () => {
    useImageUpload = await importHook();
    mockGenerateUploadUrl.mockReset();
    mockValidateImageUpload.mockReset();
  });

  // -----------------------------------------------------------------------
  // addImages — validation
  // -----------------------------------------------------------------------

  describe("addImages", () => {
    it("rejects unsupported MIME types", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.addImages([makeFile("photo.bmp", "image/bmp")]);
      });

      expect(result.current.images).toHaveLength(0);
      expect(result.current.rejections).toHaveLength(1);
      expect(result.current.rejections[0].reason).toContain(
        "Unsupported format",
      );
    });

    it("rejects files exceeding 10 MB", () => {
      const { result } = renderHook(() => useImageUpload());
      const bigFile = makeFile("huge.png", "image/png", 11 * 1024 * 1024);

      act(() => {
        result.current.addImages([bigFile]);
      });

      expect(result.current.images).toHaveLength(0);
      expect(result.current.rejections).toHaveLength(1);
      expect(result.current.rejections[0].reason).toContain("10 MB");
    });

    it("rejects files beyond MAX_IMAGES (4)", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.addImages([
          makeFile("a.png", "image/png"),
          makeFile("b.png", "image/png"),
          makeFile("c.png", "image/png"),
          makeFile("d.png", "image/png"),
          makeFile("e.png", "image/png"),
        ]);
      });

      expect(result.current.images).toHaveLength(4);
      expect(result.current.rejections).toHaveLength(1);
      expect(result.current.rejections[0].file).toBe("e.png");
      expect(result.current.rejections[0].reason).toContain("Maximum 4");
    });
  });

  // -----------------------------------------------------------------------
  // uploadAll
  // -----------------------------------------------------------------------

  describe("uploadAll", () => {
    it("returns success IDs and populates rejections on partial failure", async () => {
      // First upload succeeds, second fails
      mockGenerateUploadUrl
        .mockResolvedValueOnce("https://upload.test/1")
        .mockResolvedValueOnce("https://upload.test/2");

      // Mock fetch: first succeeds, second fails
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ storageId: "storage_ok" }), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(new Response("fail", { status: 500 }));

      mockValidateImageUpload.mockResolvedValue("storage_ok" as Id<"_storage">);

      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.addImages([
          makeFile("good.png", "image/png"),
          makeFile("bad.png", "image/png"),
        ]);
      });

      let ids: string[] = [];
      await act(async () => {
        ids = await result.current.uploadAll();
      });

      expect(ids).toEqual(["storage_ok"]);
      expect(result.current.rejections).toHaveLength(1);
      expect(result.current.rejections[0].file).toBe("bad.png");

      fetchSpy.mockRestore();
    });

    it("throws when all uploads fail", async () => {
      mockGenerateUploadUrl.mockResolvedValue("https://upload.test/x");

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValue(new Response("fail", { status: 500 }));

      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.addImages([makeFile("a.png", "image/png")]);
      });

      let thrownError: Error | undefined;
      await act(async () => {
        try {
          await result.current.uploadAll();
        } catch (err) {
          thrownError = err as Error;
        }
      });

      expect(thrownError?.message).toContain("Image upload failed");
      expect(result.current.rejections).toHaveLength(1);
      fetchSpy.mockRestore();
    });

    it("skips re-upload for images with existing storageId", async () => {
      mockGenerateUploadUrl.mockResolvedValue("https://upload.test/1");

      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValue(
        new Response(JSON.stringify({ storageId: "new_id" }), {
          status: 200,
        }),
      );
      mockValidateImageUpload.mockResolvedValue("new_id" as Id<"_storage">);

      const { result } = renderHook(() => useImageUpload());

      // Add one image, upload it, then upload again — should not re-upload
      act(() => {
        result.current.addImages([makeFile("a.png", "image/png")]);
      });

      await act(async () => {
        await result.current.uploadAll();
      });

      // Reset call counts
      mockGenerateUploadUrl.mockClear();
      fetchSpy.mockClear();

      // Second uploadAll — already-uploaded image should skip
      await act(async () => {
        const ids = await result.current.uploadAll();
        expect(ids).toEqual(["new_id"]);
      });

      expect(mockGenerateUploadUrl).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockRestore();
    });
  });

  // -----------------------------------------------------------------------
  // clear
  // -----------------------------------------------------------------------

  describe("clear", () => {
    it("revokes all object URLs", () => {
      const { result } = renderHook(() => useImageUpload());

      act(() => {
        result.current.addImages([
          makeFile("a.png", "image/png"),
          makeFile("b.png", "image/png"),
        ]);
      });

      expect(createdObjectUrls.size).toBe(2);

      act(() => {
        result.current.clear();
      });

      expect(createdObjectUrls.size).toBe(0);
      expect(result.current.images).toHaveLength(0);
      expect(result.current.rejections).toHaveLength(0);
    });
  });
});
