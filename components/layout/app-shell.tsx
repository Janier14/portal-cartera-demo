"use client";

import { BarChart2, BookUser, Briefcase, LayoutDashboard, LogOut, Menu, ShieldCheck, User, Users, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

type AppShellProps = {
  usuario: string;
  rol: string;
  modulos: string[];
};

type SidebarLink = {
  href: Route;
  label: string;
  modulo: string;
  Icon: LucideIcon;
};

const allOperationLinks = [
  { href: "/resumen", label: "Resumen General", Icon: LayoutDashboard, modulo: "resumen" },
  { href: "/arl", label: "Control ARL", Icon: BarChart2, modulo: "arl" },
  { href: "/seguros", label: "Control Seguros", Icon: ShieldCheck, modulo: "seguros" },
  { href: "/cartera", label: "Cartera", Icon: Briefcase, modulo: "cartera" },
  { href: "/directorio", label: "Directorio", Icon: BookUser, modulo: "directorio" }
] as const;

// "Analisis Cartera" se consolidó dentro del módulo Cartera (pestañas Resumen y Aportes por Cliente).
// Se retira del menú lateral; la ruta /analisis-cartera sigue activa por compatibilidad.
const allAnalysisLinks: ReadonlyArray<SidebarLink> = [];

const allConfigLinks = [
  { href: "/usuarios", label: "Usuarios", Icon: Users, modulo: "usuarios" }
] as const;

function BrandMark() {
  return (
    <div className="module-sidebar__shield" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    </div>
  );
}

type UserBadgeProps = {
  usuario: string;
  rol: string;
};

function UserBadge({ usuario, rol }: UserBadgeProps) {
  return (
    <div className="module-sidebar__user">
      <div className="module-sidebar__avatar"><User size={16} /></div>
      <div>
        <div className="module-sidebar__name">{usuario.toUpperCase()}</div>
        <div className="module-sidebar__role">{rol.toLowerCase()}</div>
      </div>
    </div>
  );
}

type SidebarContentProps = {
  pathname: string;
  usuario: string;
  rol: string;
  operationLinks: ReadonlyArray<SidebarLink>;
  analysisLinks: ReadonlyArray<SidebarLink>;
  configLinks: ReadonlyArray<SidebarLink>;
  onNavigate?: () => void;
  onLogout: () => void;
};

function SidebarContent({ pathname, usuario, rol, operationLinks, analysisLinks, configLinks, onNavigate, onLogout }: SidebarContentProps) {
  function renderLinkGroup(title: string, links: ReadonlyArray<SidebarLink>) {
    if (!links.length) return null;

    return (
      <>
        <div className="module-sidebar__section">{title}</div>
        {links.map(({ href, label, Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className={`module-sidebar__link ${active ? "is-active" : ""}`} onClick={onNavigate}>
              <Icon size={16} className="module-sidebar__icon" />
              <span className="module-sidebar__text">{label}</span>
            </Link>
          );
        })}
      </>
    );
  }

  return (
    <>
      <div className="module-sidebar__logo">
        <BrandMark />
        <div>
          <div className="cmym-wordmark" aria-label="CM&amp;M">CM<span className="cmym-wordmark__amp">&amp;</span>M</div>
          <div className="module-sidebar__subtitle">Portal Interno</div>
        </div>
      </div>

      <nav className="module-sidebar__nav">
        {renderLinkGroup("OPERACION", operationLinks)}
        {operationLinks.length > 0 && (analysisLinks.length > 0 || configLinks.length > 0) ? <div className="module-sidebar__divider" /> : null}
        {renderLinkGroup("ANALISIS", analysisLinks)}
        {analysisLinks.length > 0 && configLinks.length > 0 ? <div className="module-sidebar__divider" /> : null}
        {renderLinkGroup("CONFIGURACION", configLinks)}
      </nav>

      <div className="module-sidebar__bottom">
        <UserBadge usuario={usuario} rol={rol} />
        <button type="button" className="module-sidebar__logout" onClick={onLogout}>
          <LogOut size={16} />
          <span>Cerrar sesion</span>
        </button>
      </div>
    </>
  );
}

export function AppShell({ usuario, rol, modulos }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const drawerId = useId();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = rol === "admin";
  const hasResumenDefaultAccess = rol === "admin" || rol === "gerencia";
  const visibleOperationLinks = isAdmin
    ? allOperationLinks
    : allOperationLinks.filter((link) => (link.modulo === "resumen" ? hasResumenDefaultAccess || modulos.includes(link.modulo) : modulos.includes(link.modulo)));
  const visibleAnalysisLinks = allAnalysisLinks.filter((link) => modulos.includes(link.modulo));
  const visibleConfigLinks = isAdmin
    ? allConfigLinks
    : allConfigLinks.filter((link) => link.modulo !== "usuarios" && modulos.includes(link.modulo));

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen]);

  async function onLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setMobileOpen(false);
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <header className="module-mobile-header">
        <button
          type="button"
          className="module-mobile-header__menu"
          aria-label="Abrir navegacion"
          aria-expanded={mobileOpen}
          aria-controls={drawerId}
          onClick={() => setMobileOpen(true)}
        >
          <Menu size={18} />
        </button>

        <div className="module-mobile-header__brand">
          <BrandMark />
          <div>
            <div className="cmym-wordmark" aria-label="CM&amp;M">CM<span className="cmym-wordmark__amp">&amp;</span>M</div>
            <div className="module-sidebar__subtitle">Portal Interno</div>
          </div>
        </div>

        <div className="module-mobile-header__user">
          <div className="module-sidebar__avatar"><User size={16} /></div>
          <div className="module-mobile-header__user-copy">
            <div className="module-sidebar__name">{usuario.toUpperCase()}</div>
            <div className="module-sidebar__role">{rol.toLowerCase()}</div>
          </div>
        </div>
      </header>

      <div className={`module-mobile-drawer-shell ${mobileOpen ? "is-open" : ""}`} aria-hidden={!mobileOpen}>
        <button type="button" className="module-mobile-drawer__overlay" aria-label="Cerrar navegacion" onClick={() => setMobileOpen(false)} />
        <aside id={drawerId} className="module-sidebar module-sidebar--drawer" role="dialog" aria-modal="true" aria-label="Navegacion principal">
          <div className="module-mobile-drawer__head">
            <div className="module-mobile-drawer__brand">
              <BrandMark />
              <div>
                <div className="cmym-wordmark" aria-label="CM&amp;M">CM<span className="cmym-wordmark__amp">&amp;</span>M</div>
                <div className="module-sidebar__subtitle">Portal Interno</div>
              </div>
            </div>
            <button type="button" className="module-mobile-drawer__close" aria-label="Cerrar navegacion" onClick={() => setMobileOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <SidebarContent
            pathname={pathname}
            usuario={usuario}
            rol={rol}
            operationLinks={visibleOperationLinks}
            analysisLinks={visibleAnalysisLinks}
            configLinks={visibleConfigLinks}
            onNavigate={() => setMobileOpen(false)}
            onLogout={() => void onLogout()}
          />
        </aside>
      </div>

      <aside className="module-sidebar module-sidebar--desktop">
        <SidebarContent
          pathname={pathname}
          usuario={usuario}
          rol={rol}
          operationLinks={visibleOperationLinks}
          analysisLinks={visibleAnalysisLinks}
          configLinks={visibleConfigLinks}
          onLogout={() => void onLogout()}
        />
      </aside>
    </>
  );
}
