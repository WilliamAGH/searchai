/**
 * Downscale an image file to a maximum pixel dimension while preserving aspect ratio.
 *
 * Goals:
 * - Reduce upload bandwidth + model image-token cost
 * - Keep "retina" clarity (only downscale when needed; do not upscale)
 *
 * Constraints:
 * - We re-encode using the original MIME type (png/jpeg).
 */

const DEFAULT_JPEG_QUALITY = 0.92;

function isSupportedCanvasEncodeType(type: string): boolean {
  return type === "image/png" || type === "image/jpeg";
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Failed to decode image for downscaling"));
    };

    img.src = objectUrl;
  });
}

async function canvasToBlob(params: {
  canvas: HTMLCanvasElement;
  type: string;
  quality?: number;
}): Promise<Blob> {
  const { canvas, type, quality } = params;
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error(`Canvas encoding failed (type=${type})`));
          return;
        }
        resolve(blob);
      },
      type,
      quality,
    );
  });
}

export async function downscaleImageFile(params: {
  file: File;
  maxDimensionPx: number;
}): Promise<File> {
  const { file, maxDimensionPx } = params;

  if (!isSupportedCanvasEncodeType(file.type)) {
    throw new Error(`Unsupported image type for downscaling: ${file.type}`);
  }

  const img = await loadImageFromFile(file);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  const maxSide = Math.max(srcW, srcH);

  // No upscaling; no-op if already within limit.
  if (!Number.isFinite(maxSide) || maxSide <= maxDimensionPx) {
    return file;
  }

  const scale = maxDimensionPx / maxSide;
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));

  const canvas = document.createElement("canvas");
  canvas.width = dstW;
  canvas.height = dstH;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable for downscaling");
  }

  ctx.imageSmoothingEnabled = true;
  // TS/lib.dom allows this on modern browsers; older browsers ignore it.
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(img, 0, 0, dstW, dstH);

  const quality = file.type === "image/jpeg" ? DEFAULT_JPEG_QUALITY : undefined;

  const blob = await canvasToBlob({
    canvas,
    type: file.type,
    quality,
  });

  // Preserve name/mtime for traceability; MIME type is kept stable.
  return new File([blob], file.name, {
    type: blob.type,
    lastModified: file.lastModified,
  });
}
