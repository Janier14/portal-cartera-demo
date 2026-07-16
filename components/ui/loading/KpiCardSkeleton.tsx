"use client";

import { Skeleton } from "./Skeleton";

export function KpiCardSkeleton() {
  return (
    <section className="module-card module-kpi module-card--plain">
      <Skeleton className="mb-3 h-3 w-24" />
      <Skeleton className="mb-3 h-10 w-36" />
      <Skeleton className="h-3 w-28" />
    </section>
  );
}
