"use client";

import type { ReactNode } from "react";
import { OfficerShell } from "@/components/OfficerShell";
import { RequireRole } from "@/components/RequireRole";

export default function OfficerLayout({ children }: { children: ReactNode }) {
  return (
    <RequireRole roles={["OFFICER"]}>
      {(me) => <OfficerShell me={me}>{children}</OfficerShell>}
    </RequireRole>
  );
}
