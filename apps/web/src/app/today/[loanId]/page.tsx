"use client";

import { useParams } from "next/navigation";
import { LoanScreen } from "@/features/field/LoanScreen";

export default function LoanPage() {
  const { loanId } = useParams<{ loanId: string }>();
  return <LoanScreen loanId={loanId} />;
}
