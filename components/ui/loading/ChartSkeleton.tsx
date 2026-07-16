"use client";

import { Skeleton } from "./Skeleton";

type ChartSkeletonProps = {
  height?: number;
};

export function ChartSkeleton({ height = 300 }: ChartSkeletonProps) {
  return (
    <div className="module-card module-card--plain">
      <div className="mb-4 flex items-center justify-between gap-4">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-6 w-20" />
      </div>
      <Skeleton className="w-full" style={{ height }} />
    </div>
  );
}
