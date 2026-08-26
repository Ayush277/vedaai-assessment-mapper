import "server-only";
import sharp from "sharp";

/**
 * PDF rasterisation via PDFium compiled to WebAssembly.
 *
 * Chosen over pdf.js + a native canvas binding for two reasons: pdf.js needs a
 * canvas implementation that crashes the process on some Node builds, and any
 * native binding complicates serverless deployment. WASM runs identically on a
 * laptop and on a serverless runtime with no system libraries to install.
 *
 * Pages are rendered independently so the viewer can navigate them without
 * loading one enormous image.
 */

/** Render width in pixels. Wide enough for handwriting, small enough to be
 *  cheap to send to a vision model. */
const TARGET_WIDTH = 1600;

export type RenderedPage = {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
};

type PdfiumModule = typeof import("@hyzyla/pdfium");

let libraryPromise: Promise<
  Awaited<ReturnType<PdfiumModule["PDFiumLibrary"]["init"]>>
> | null = null;

/** The WASM module is expensive to instantiate, so it is created once. */
async function getLibrary() {
  if (!libraryPromise) {
    libraryPromise = import("@hyzyla/pdfium").then((mod) =>
      mod.PDFiumLibrary.init(),
    );
  }
  return libraryPromise;
}

export async function getPdfPageCount(data: Uint8Array): Promise<number> {
  const library = await getLibrary();
  const document = await library.loadDocument(Buffer.from(data));
  try {
    return document.getPageCount();
  } finally {
    document.destroy();
  }
}

export async function renderPdfPages(
  data: Uint8Array,
  maxPages: number,
  onPage?: (pageNumber: number, total: number) => void,
): Promise<RenderedPage[]> {
  const library = await getLibrary();
  const document = await library.loadDocument(Buffer.from(data));
  const pages: RenderedPage[] = [];

  try {
    const total = Math.min(document.getPageCount(), maxPages);
    let pageNumber = 0;

    for (const page of document.pages()) {
      pageNumber += 1;
      if (pageNumber > total) break;

      const { originalWidth } = page.getOriginalSize();
      // Never upscale: enlarging a small scan adds no detail, only payload.
      const scale = originalWidth > 0 ? Math.min(1.6, TARGET_WIDTH / originalWidth) : 1;

      const bitmap = await page.render({ scale, render: "bitmap" });

      const png = await sharp(Buffer.from(bitmap.data), {
        raw: { width: bitmap.width, height: bitmap.height, channels: 4 },
      })
        // Scanned pages are opaque; flattening onto white keeps binarisation
        // in lib/vision seeing what a human sees.
        .flatten({ background: "#ffffff" })
        .png({ compressionLevel: 6 })
        .toBuffer();

      pages.push({
        pageNumber,
        png,
        width: bitmap.width,
        height: bitmap.height,
      });
      onPage?.(pageNumber, total);
    }
  } finally {
    document.destroy();
  }

  return pages;
}
