import "server-only";
import { config, ACCEPTED_EXTENSIONS } from "@/lib/config";
import type { DocumentKind, SourceDocument } from "@/lib/types/assessment";
import { getPdfPageCount, renderPdfPages } from "./pdf";
import { normalizeImage } from "./images";

export type PageBitmap = {
  pageNumber: number;
  png: Buffer;
  width: number;
  height: number;
};

export type NormalizedDocument = {
  document: SourceDocument;
  bitmaps: PageBitmap[];
};

export class DocumentError extends Error {
  constructor(
    public readonly code:
      | "UNSUPPORTED_TYPE"
      | "EMPTY_FILE"
      | "TOO_LARGE"
      | "CORRUPT"
      | "NO_PAGES",
    message: string,
  ) {
    super(message);
    this.name = "DocumentError";
  }
}

const PDF_MAGIC = "%PDF-";

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot).toLowerCase();
}

function looksLikePdf(bytes: Uint8Array): boolean {
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes(PDF_MAGIC);
}

/** Validate an upload before any expensive work happens. */
export function validateUpload(file: {
  name: string;
  type: string;
  size: number;
}): void {
  if (file.size === 0) {
    throw new DocumentError("EMPTY_FILE", `"${file.name}" is empty.`);
  }
  if (file.size > config.maxUploadBytes) {
    const limit = Math.round(config.maxUploadBytes / (1024 * 1024));
    throw new DocumentError(
      "TOO_LARGE",
      `"${file.name}" is larger than the ${limit}MB limit.`,
    );
  }
  const ext = extensionOf(file.name);
  const extOk = (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
  const mimeOk =
    file.type === "application/pdf" ||
    file.type === "image/png" ||
    file.type === "image/jpeg" ||
    file.type === "image/jpg";

  // Browsers sometimes report an empty MIME type; trust the extension then.
  if (!extOk && !mimeOk) {
    throw new DocumentError(
      "UNSUPPORTED_TYPE",
      `"${file.name}" is not supported. Upload a PDF, PNG or JPG.`,
    );
  }
}

/**
 * Turn an uploaded file into the pipeline's common page representation.
 * PDFs are rasterised page by page; images become a single page.
 */
export async function normalizeDocument(params: {
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  jobId: string;
  onProgress?: (pageNumber: number, total: number) => void;
}): Promise<NormalizedDocument> {
  const { kind, fileName, mimeType, bytes, jobId, onProgress } = params;

  if (bytes.byteLength === 0) {
    throw new DocumentError("EMPTY_FILE", `"${fileName}" is empty.`);
  }

  const isPdf =
    mimeType === "application/pdf" ||
    extensionOf(fileName) === ".pdf" ||
    looksLikePdf(bytes);

  let bitmaps: PageBitmap[];
  let pageCount: number;

  if (isPdf) {
    if (!looksLikePdf(bytes)) {
      throw new DocumentError(
        "CORRUPT",
        `"${fileName}" does not look like a valid PDF.`,
      );
    }
    try {
      pageCount = await getPdfPageCount(bytes);
    } catch {
      throw new DocumentError(
        "CORRUPT",
        `"${fileName}" could not be opened. It may be corrupted or password protected.`,
      );
    }
    if (pageCount === 0) {
      throw new DocumentError("NO_PAGES", `"${fileName}" contains no pages.`);
    }
    const rendered = await renderPdfPages(
      bytes,
      config.maxPagesPerDocument,
      onProgress,
    );
    bitmaps = rendered.map((page) => ({
      pageNumber: page.pageNumber,
      png: page.png,
      width: page.width,
      height: page.height,
    }));
  } else {
    let image;
    try {
      image = await normalizeImage(bytes);
    } catch (error) {
      const reason =
        error instanceof Error && error.message === "IMAGE_TOO_SMALL"
          ? "is too small to read"
          : "could not be decoded";
      throw new DocumentError("CORRUPT", `"${fileName}" ${reason}.`);
    }
    bitmaps = [
      { pageNumber: 1, png: image.png, width: image.width, height: image.height },
    ];
    pageCount = 1;
    onProgress?.(1, 1);
  }

  if (bitmaps.length === 0) {
    throw new DocumentError("NO_PAGES", `"${fileName}" produced no pages.`);
  }

  const document: SourceDocument = {
    kind,
    fileName,
    mimeType: isPdf ? "application/pdf" : mimeType || "image/png",
    byteSize: bytes.byteLength,
    // Report the true page count even when processing was capped.
    pageCount,
    pages: bitmaps.map((bitmap) => ({
      pageNumber: bitmap.pageNumber,
      imageUrl: `/api/process/${jobId}/page?doc=${kind}&n=${bitmap.pageNumber}`,
      width: bitmap.width,
      height: bitmap.height,
    })),
  };

  return { document, bitmaps };
}
