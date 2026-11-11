"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@nfs/ui";
import { useHub } from "@/lib/store";
import { RequirePerm } from "@/components/guard";
import { PortfolioView } from "@/components/portfolio-view";

export default function AgentPage() {
  return (
    <RequirePerm perm="staff.view">
      <AgentProfile />
    </RequirePerm>
  );
}

function AgentProfile() {
  const { id } = useParams<{ id: string }>();
  const hub = useHub();
  const p = hub.people.get(id);
  if (!p) return <p className="text-sm text-muted">Staff member not found.</p>;
  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2"><Link href="/agents"><ArrowLeft /> Staff</Link></Button>
      <PortfolioView p={p} />
    </>
  );
}
