"use client";
import * as React from "react";
import Link from "next/link";
import { Button } from "@nfs/ui";
import { StateScreen } from "@/components/state-screen";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => console.error(error), [error]);
  return (
    <StateScreen
      code="Something went wrong"
      title="That screen didn't load"
      body="Nothing you entered has been lost: gate log taps are kept on this device until they sync. Try again, or head back to Today."
      actions={
        <>
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild><Link href="/">Go to Today</Link></Button>
        </>
      }
    />
  );
}
