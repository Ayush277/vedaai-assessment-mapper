import { NextResponse } from "next/server";
import { readPageImage } from "@/lib/processing/job-store";
import type { DocumentKind } from "@/lib/types/assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS: DocumentKind[] = ["question-paper", "answer-sheet"];

/** Serves a rendered page image. Page bytes never leave the server otherwise. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const url = new URL(request.url);
  const doc = url.searchParams.get("doc") as DocumentKind | null;
  const pageNumber = Number(url.searchParams.get("n"));

  if (!doc || !KINDS.includes(doc)) {
    return NextResponse.json({ error: { message: "Unknown document." } }, { status: 400 });
  }
  if (!Number.isInteger(pageNumber) || pageNumber < 1) {
    return NextResponse.json({ error: { message: "Invalid page." } }, { status: 400 });
  }

  const png = await readPageImage(jobId, doc, pageNumber);
  if (!png) {
    return NextResponse.json({ error: { message: "Page not found." } }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Page renders are immutable for the lifetime of the job.
      "Cache-Control": "private, max-age=3600, immutable",
      "Content-Length": String(png.byteLength),
    },
  });
}
