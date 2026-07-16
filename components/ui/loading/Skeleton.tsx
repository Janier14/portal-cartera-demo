"use client";

import type { CSSProperties } from "react";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

export function Skeleton({ className = "", style }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-[#e5e7eb] ${className}`.trim()} style={style} aria-hidden="true" />;
}
