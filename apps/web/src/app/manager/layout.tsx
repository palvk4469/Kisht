"use client";

import type { ReactNode } from "react";
import { ManagerShell } from "@/components/ManagerShell";
import { RequireRole } from "@/components/RequireRole";

export default function ManagerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={["BRANCH_MANAGER", "HEAD"]}>
      {(me) => <ManagerShell me={me}>{children}</ManagerShell>}
    </RequireRole>
  );
}
