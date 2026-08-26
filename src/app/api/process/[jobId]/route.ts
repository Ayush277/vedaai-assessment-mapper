import { NextResponse } from "next/server";
import { readJob } from "@/lib/processing/job-store";
import { stageProgressPercent } from "@/lib/processing/stages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  const job = await readJob(jobId);

  if (!job) {
    return NextResponse.json(
      { error: { message: "This processing job could not be found. It may have expired." } },
      { status: 404 },
    );
  }

  return NextResponse.json(
    { ...job, progress: stageProgressPercent(job.stages) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
