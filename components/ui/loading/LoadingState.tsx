"use client";

import { ReactNode } from "react";

type LoadingStateProps = {
  isLoading: boolean;
  error: Error | null;
  children: ReactNode;
  skeleton: ReactNode;
  onRetry?: () => void;
  errorMessage?: string;
};

export function LoadingState({
  isLoading,
  error,
  children,
  skeleton,
  onRetry,
  errorMessage = "No se pudieron cargar los datos."
}: LoadingStateProps) {
  if (isLoading) {
    return <>{skeleton}</>;
  }

  if (error) {
    return (
      <div
        className="module-card module-card--plain"
        style={{
          minHeight: 220,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          gap: 12,
          padding: 24
        }}
      >
        <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
          <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".76rem", color: "#82827f", letterSpacing: ".04em" }}>
            {errorMessage}
          </p>
          <p style={{ fontSize: ".86rem", color: "var(--module-text)" }}>{error.message}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              style={{
                marginTop: 4,
                height: 32,
                padding: "0 14px",
                borderRadius: 6,
                border: "1px solid rgba(204,0,0,.2)",
                background: "rgba(204,0,0,.06)",
                color: "#cc0000",
                fontFamily: "Space Mono,monospace",
                fontSize: ".7rem",
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Reintentar
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
