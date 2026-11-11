"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { can, homeFor, type Permission } from "@nfs/auth";
import { useHub } from "@/lib/store";

/** Sends a signed-in user to their home screen if their role lacks the permission. */
export function RequirePerm({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const { session } = useHub();
  const router = useRouter();
  const ok = can(session?.role, perm);
  React.useEffect(() => {
    if (session && !ok) router.replace(homeFor(session.role));
  }, [ok, session, router]);
  return ok ? <>{children}</> : null;
}
