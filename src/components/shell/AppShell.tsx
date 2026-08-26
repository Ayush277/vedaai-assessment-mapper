"use client";

import { useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function AppShell({
  children,
  breadcrumb,
  backHref,
}: {
  children: React.ReactNode;
  breadcrumb?: string;
  backHref?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex h-dvh gap-2.5 bg-canvas p-2.5">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((v) => !v)} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-card bg-surface">
        <TopBar breadcrumb={breadcrumb} backHref={backHref} />
        <div className="flex min-h-0 flex-1 flex-col bg-panel">{children}</div>
      </main>
    </div>
  );
}
