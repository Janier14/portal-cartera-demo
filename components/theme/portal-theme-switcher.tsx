"use client";

import { useEffect, useState } from "react";

export type PortalTheme = "tema-claro" | "tema-medio" | "tema-oscuro";

const STORAGE_KEY = "cmm-tema";
const THEMES: PortalTheme[] = ["tema-claro", "tema-medio", "tema-oscuro"];

function resolveTheme(): PortalTheme {
  if (typeof document === "undefined") return "tema-claro";
  const current = THEMES.find((theme) => document.body.classList.contains(theme));
  return current ?? "tema-claro";
}

function applyTheme(theme: PortalTheme) {
  document.body.classList.remove(...THEMES);
  document.body.classList.add(theme);
  window.localStorage.setItem(STORAGE_KEY, theme);
}

export function PortalThemeSwitcher() {
  const [theme, setTheme] = useState<PortalTheme>("tema-claro");

  useEffect(() => {
    setTheme(resolveTheme());
  }, []);

  function onChange(nextTheme: PortalTheme) {
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div className="portal-theme-switcher" aria-label="Selector de tema">
      <button
        type="button"
        className={`portal-theme-dot portal-theme-dot--claro ${theme === "tema-claro" ? "is-active" : ""}`}
        onClick={() => onChange("tema-claro")}
        aria-label="Tema claro"
      />
      <button
        type="button"
        className={`portal-theme-dot portal-theme-dot--medio ${theme === "tema-medio" ? "is-active" : ""}`}
        onClick={() => onChange("tema-medio")}
        aria-label="Tema medio"
      />
      <button
        type="button"
        className={`portal-theme-dot portal-theme-dot--oscuro ${theme === "tema-oscuro" ? "is-active" : ""}`}
        onClick={() => onChange("tema-oscuro")}
        aria-label="Tema oscuro"
      />
    </div>
  );
}
