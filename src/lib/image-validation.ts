export const MAX_IMAGE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per image
export const MAX_IMAGE_COUNT = 15;

export type VerifiedImageFormat = {
  mime: "image/jpeg" | "image/png" | "image/webp";
  ext: "jpg" | "png" | "webp";
};

/**
 * Inspects file magic bytes to verify genuine JPEG, PNG, or WebP images.
 * Rejects renamed executables (.exe), plain text (.txt), PDFs, archives, or HTML/SVG scripts.
 */
export function detectImageFormatFromBytes(bytes: Uint8Array): VerifiedImageFormat | null {
  if (!bytes || bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { mime: "image/png", ext: "png" };
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { mime: "image/webp", ext: "webp" };
  }

  return null;
}

/** Validates image size and magic bytes identically on client & server. */
export function validateImageUploadBytes(
  bytes: Uint8Array,
  size: number = bytes.length
): { valid: true; format: VerifiedImageFormat } | { valid: false; error: string } {
  if (!bytes || size <= 0) {
    return { valid: false, error: "Uploaded image file is empty." };
  }
  if (size > MAX_IMAGE_FILE_BYTES) {
    return { valid: false, error: "Image exceeds the 10 MB size limit." };
  }
  const format = detectImageFormatFromBytes(bytes);
  if (!format) {
    return {
      valid: false,
      error: "Invalid image format. Only genuine JPG, PNG, or WebP files are accepted (renamed files are blocked).",
    };
  }
  return { valid: true, format };
}

/**
 * Parses JPEG EXIF Orientation tag (0x0112) from binary bytes.
 * Returns orientation 1..8 (defaults to 1 if non-JPEG or missing EXIF tag).
 */
export function readJpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return 1;

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break; // SOS or EOI
    const segLen = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segLen < 2 || offset + 2 + segLen > bytes.length) break;

    // APP1 marker (0xE1) with "Exif\0\0"
    if (
      marker === 0xe1 &&
      segLen >= 14 &&
      bytes[offset + 4] === 0x45 &&
      bytes[offset + 5] === 0x78 &&
      bytes[offset + 6] === 0x69 &&
      bytes[offset + 7] === 0x66 &&
      bytes[offset + 8] === 0x00 &&
      bytes[offset + 9] === 0x00
    ) {
      const tiffStart = offset + 10;
      const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
      const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
      if (!littleEndian && !bigEndian) return 1;

      const u16 = (pos: number) =>
        littleEndian ? bytes[pos] | (bytes[pos + 1] << 8) : (bytes[pos] << 8) | bytes[pos + 1];
      const u32 = (pos: number) =>
        littleEndian
          ? bytes[pos] | (bytes[pos + 1] << 8) | (bytes[pos + 2] << 16) | (bytes[pos + 3] << 24)
          : (bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3];

      const ifdOffset = u32(tiffStart + 4);
      const ifdStart = tiffStart + ifdOffset;
      if (ifdStart + 2 > bytes.length) return 1;

      const entries = u16(ifdStart);
      for (let i = 0; i < entries; i++) {
        const entryPos = ifdStart + 2 + i * 12;
        if (entryPos + 12 > bytes.length) break;
        const tag = u16(entryPos);
        if (tag === 0x0112) {
          const val = u16(entryPos + 8);
          return val >= 1 && val <= 8 ? val : 1;
        }
      }
      return 1;
    }

    offset += 2 + segLen;
  }

  return 1;
}

/** Computes output canvas dimensions & 2D affine matrix to render an EXIF-oriented photo upright. */
export function getCanvasTransformForExif(
  orientation: number,
  width: number,
  height: number
): { canvasWidth: number; canvasHeight: number; transform: [number, number, number, number, number, number] } {
  switch (orientation) {
    case 2:
      return { canvasWidth: width, canvasHeight: height, transform: [-1, 0, 0, 1, width, 0] };
    case 3:
      return { canvasWidth: width, canvasHeight: height, transform: [-1, 0, 0, -1, width, height] };
    case 4:
      return { canvasWidth: width, canvasHeight: height, transform: [1, 0, 0, -1, 0, height] };
    case 5:
      return { canvasWidth: height, canvasHeight: width, transform: [0, 1, 1, 0, 0, 0] };
    case 6:
      return { canvasWidth: height, canvasHeight: width, transform: [0, 1, -1, 0, height, 0] };
    case 7:
      return { canvasWidth: height, canvasHeight: width, transform: [0, -1, -1, 0, height, width] };
    case 8:
      return { canvasWidth: height, canvasHeight: width, transform: [0, -1, 1, 0, 0, width] };
    default:
      return { canvasWidth: width, canvasHeight: height, transform: [1, 0, 0, 1, 0, 0] };
  }
}

