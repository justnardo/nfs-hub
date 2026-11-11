"use client";
import { useHub } from "@/lib/store";
import { PortfolioView } from "@/components/portfolio-view";

export default function MePage() {
  const { me } = useHub();
  if (!me) return null;
  return <PortfolioView p={me} />;
}
