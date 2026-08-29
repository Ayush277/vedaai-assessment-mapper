import { config } from "@/lib/config";
import { AppShell } from "@/components/shell/AppShell";
import { RunView } from "@/components/upload/RunView";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell breadcrumb="Exams">
      <RunView
        maxUploadMb={Math.round(config.maxUploadBytes / (1024 * 1024))}
        setup={{
          providerId: config.providerId,
          model: config.model,
          localMode: config.localMode,
        }}
      />
    </AppShell>
  );
}
