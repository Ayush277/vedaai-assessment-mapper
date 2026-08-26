import { config } from "@/lib/config";
import { AppShell } from "@/components/shell/AppShell";
import { UploadScreen } from "@/components/upload/UploadScreen";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <AppShell breadcrumb="Exams">
      <UploadScreen
        maxUploadMb={Math.round(config.maxUploadBytes / (1024 * 1024))}
        degraded={config.isDegraded}
      />
    </AppShell>
  );
}
