import Link from "next/link";
import { Button } from "@nfs/ui";
import { StateScreen } from "@/components/state-screen";

export default function NotFound() {
  return (
    <StateScreen
      code="Page not found"
      title="This page has pushed back"
      body="The link may be old or mistyped, or the flight or record has moved. Everything else is where you left it."
      actions={<Button asChild><Link href="/">Go to Today</Link></Button>}
    />
  );
}
