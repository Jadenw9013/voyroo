import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";

export const MAX_RECEIPT_BYTES = 600_000;
const ACCEPTED = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/** Choose the native decoder only after checking the raster file signature. */
export async function normalizeReceipt(input: unknown): Promise<Buffer | null> {
  if (typeof input !== "string") return null;
  const match = ACCEPTED.exec(input);
  if (!match) return null;
  const [, format, encoded] = match;
  const bytes = Buffer.from(encoded, "base64");
  const raster = (format === "png" && bytes.subarray(0, 8).equals(PNG_HEADER))
    || (format === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    || (format === "webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
  if (!raster) return null;
  try {
    return await sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" })
      .timeout({ seconds: 8 })
      .rotate()
      .resize({ width: 1600, height: 2400, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
  } catch {
    return null;
  }
}

export function receiptIdFor(image: Buffer) {
  return `r-${createHash("sha256").update(image).digest("hex").slice(0, 48)}`;
}
