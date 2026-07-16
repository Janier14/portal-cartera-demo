"use client";

import { Skeleton } from "./Skeleton";

type TableSkeletonProps = {
  rows?: number;
  columns?: number;
};

export function TableSkeleton({ rows = 10, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="module-card module-card--plain">
      <div className="mb-4 flex gap-3">
        {Array.from({ length: columns }, (_, index) => (
          <Skeleton key={`header-${index}`} className="h-4 flex-1" />
        ))}
      </div>
      <div className="grid gap-3">
        {Array.from({ length: rows }, (_, rowIndex) => (
          <div key={`row-${rowIndex}`} className="flex gap-3">
            {Array.from({ length: columns }, (_, columnIndex) => (
              <Skeleton key={`cell-${rowIndex}-${columnIndex}`} className="h-9 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
