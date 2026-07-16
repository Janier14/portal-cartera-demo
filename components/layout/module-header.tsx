import { ReactNode } from "react";

import { CutoffBadge } from "@/components/theme/cutoff-badge";
import { PortalThemeSwitcher } from "@/components/theme/portal-theme-switcher";

interface ModuleHeaderProps {
  titulo: string;
  subtitulo: string;
  actions?: ReactNode;
  cutoffLabel?: string | null;
}

export function ModuleHeader({ titulo, subtitulo, actions, cutoffLabel }: ModuleHeaderProps) {
  return (
    <div className="module-header-std">
      <div className="module-header-std__row">
        <div className="module-header-std__left">
          <div className="module-header-std__eyebrow">
            <span className="module-header-std__eyebrow-line" />
            <span>Portal de Gestión</span>
          </div>
          <h1 className="module-header-std__title">
            <span style={{ color: "var(--module-accent)" }}>{titulo}</span>
          </h1>
          <p className="module-header-std__sub">{subtitulo}</p>
        </div>
        <div className="module-header-meta">
          {actions}
          <PortalThemeSwitcher />
          {cutoffLabel ? <CutoffBadge label={cutoffLabel} /> : null}
        </div>
      </div>
    </div>
  );
}
