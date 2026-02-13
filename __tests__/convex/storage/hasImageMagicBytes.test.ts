import { describe, it, expect } from "vitest";
import { hasImageMagicBytes } from "../../../convex/storage";

describe("hasImageMagicBytes", () => {
  it("detects PNG magic bytes", () => {
    // PNG: \x89PNG\r\n\x1A\n
    const header = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
    ]);
    expect(hasImageMagicBytes(header)).toBe(true);
  });

  it("detects JPEG magic bytes (SOI + APP0)", () => {
    // JPEG: FF D8 FF E0
    const header = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(hasImageMagicBytes(header)).toBe(true);
  });

  it("detects JPEG magic bytes (SOI + APP1/EXIF)", () => {
    // JPEG: FF D8 FF E1
    const header = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe1, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(hasImageMagicBytes(header)).toBe(true);
  });

  it("detects GIF87a magic bytes", () => {
    // GIF87a: 47 49 46 38 37 61
    const header = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x37, 0x61, 0, 0, 0, 0, 0, 0,
    ]);
    expect(hasImageMagicBytes(header)).toBe(true);
  });

  it("detects GIF89a magic bytes", () => {
    // GIF89a: 47 49 46 38 39 61
    const header = new Uint8Array([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0,
    ]);
    expect(hasImageMagicBytes(header)).toBe(true);
  });

  it("detects WebP magic bytes (RIFF....WEBP)", () => {
    // WebP: RIFF [4 bytes size] WEBP
    const header = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // size (arbitrary)
      0x57,
      0x45,
      0x42,
      0x50, // WEBP
    ]);
    expect(hasImageMagicBytes(header)).toBe(true);
  });

  it("rejects empty buffer", () => {
    expect(hasImageMagicBytes(new Uint8Array([]))).toBe(false);
  });

  it("rejects buffer too short for any signature", () => {
    expect(hasImageMagicBytes(new Uint8Array([0xff, 0xd8]))).toBe(false);
  });

  it("rejects arbitrary data", () => {
    const header = new Uint8Array([
      0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b,
    ]);
    expect(hasImageMagicBytes(header)).toBe(false);
  });

  it("rejects PDF magic bytes", () => {
    // %PDF
    const header = new Uint8Array([
      0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0,
    ]);
    expect(hasImageMagicBytes(header)).toBe(false);
  });

  it("rejects RIFF without WEBP secondary bytes", () => {
    // RIFF but AVI instead of WEBP
    const header = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46, // RIFF
      0x00,
      0x00,
      0x00,
      0x00, // size
      0x41,
      0x56,
      0x49,
      0x20, // AVI (not WEBP)
    ]);
    expect(hasImageMagicBytes(header)).toBe(false);
  });
});
