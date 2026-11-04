"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoanScreen } from "@/features/field/LoanScreen";

function Loan() {
  const id = useSearchParams().get("id") ?? "";
  return <LoanScreen loanId={id} />;
}

export default function LoanPage() {
  return (
    <Suspense>
      <Loan />
    </Suspense>
  );
}
