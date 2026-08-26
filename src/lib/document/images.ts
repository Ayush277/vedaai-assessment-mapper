import "server-only";
import sharp from "sharp";

const TARGET_WIDTH = 1600;
/** Below this, a "document" is almost certainly not a scanned page. */
const MIN_DIMENSION = 80;

export type NormalizedImage = {
  png: Buffer;
  width: number;
  height: number;
};

/**
 * Normalize an uploaded image into a PNG page at a predictable width.
 * Upscaling is avoided — enlarging a small scan adds no information and
 * inflates the payload sent to the vision provider.
 */
export async function normalizeImage(data: Uint8Array): Promise<NormalizedImage> {
  const source = sharp(Buffer.from(data), { failOn: "none" });
  const meta = await source.metadata();

  if (!meta.width || !meta.height) {
    throw new Error("UNREADABLE_IMAGE");
  }
  if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) {
    throw new Error("IMAGE_TOO_SMALL");
  }

  const pipeline = sharp(Buffer.from(data), { failOn: "none" })
    .rotate() // honour EXIF orientation from phone-camera scans
    .flatten({ background: "#ffffff" });

  const resized =
    meta.width > TARGET_WIDTH
      ? pipeline.resize({ width: TARGET_WIDTH, withoutEnlargement: true })
      : pipeline;

  const { data: png, info } = await resized
    .png({ compressionLevel: 6 })
    .toBuffer({ resolveWithObject: true });

  return { png, width: info.width, height: info.height };
}

/** Raw grayscale pixel access used by the layout segmenter. */
export async function toGrayscale(
  png: Buffer,
): Promise<{ pixels: Uint8Array; width: number; height: number }> {
  const { data, info } = await sharp(png)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    pixels: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    width: info.width,
    height: info.height,
  };
}

/** Crop a pixel rectangle out of a page and return it as a JPEG for the VLM. */
export async function cropRegion(
  png: Buffer,
  rect: { x: number; y: number; width: number; height: number },
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<Buffer> {
  const { maxWidth = 1100, quality = 82 } = opts;
  const meta = await sharp(png).metadata();
  const pageWidth = meta.width ?? 0;
  const pageHeight = meta.height ?? 0;

  const left = Math.max(0, Math.min(pageWidth - 1, Math.round(rect.x)));
  const top = Math.max(0, Math.min(pageHeight - 1, Math.round(rect.y)));
  const width = Math.max(1, Math.min(pageWidth - left, Math.round(rect.width)));
  const height = Math.max(1, Math.min(pageHeight - top, Math.round(rect.height)));

  return sharp(png)
    .extract({ left, top, width, height })
    .resize({ width: maxWidth, withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer();
}

/** Downscale a whole page for "context" images sent alongside crops. */
export async function pageThumbnail(png: Buffer, width = 900): Promise<Buffer> {
  return sharp(png)
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 78 })
    .toBuffer();
}
