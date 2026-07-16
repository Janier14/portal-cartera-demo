"use client";

import { ReactNode } from "react";

export function DashboardCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`module-card ${className}`}>{children}</section>;
}

export function KpiCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <DashboardCard className="module-kpi">
      <p className="module-kpi__label">{label}</p>
      <p className="module-kpi__value">{value}</p>
      <p className="module-kpi__sub">{sublabel}</p>
    </DashboardCard>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h3 className="module-section-title">{title}</h3>
      {subtitle ? <p className="module-section-subtitle">{subtitle}</p> : null}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="module-empty">{message}</div>;
}
