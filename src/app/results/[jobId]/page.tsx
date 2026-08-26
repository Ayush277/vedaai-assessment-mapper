import { AppShell } from "@/components/shell/AppShell";
import { JobView } from "./JobView";

export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  return (
    <AppShell breadcrumb="Exams" backHref="/">
      <JobView jobId={jobId} />
    </AppShell>
  );
}
