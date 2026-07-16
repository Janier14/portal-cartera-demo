"use client";

import { useEffect } from "react";

export default function ProtectedError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[ProtectedError]", error);
  }, [error]);

  return (
    <div style={{ padding: "40px", fontFamily: "monospace", maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ color: "#e51f2f", marginBottom: 12 }}>Error en el módulo</h2>
      <p style={{ color: "#82827f", fontSize: "0.85rem", marginBottom: 20 }}>
        {error.message || "Ha ocurrido un error inesperado."}
      </p>
      {error.digest && (
        <p style={{ color: "#aaa", fontSize: "0.75rem", marginBottom: 20 }}>
          Digest: {error.digest}
        </p>
      )}
      <button
        onClick={reset}
        style={{
          background: "#e51f2f",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          padding: "10px 20px",
          fontSize: "0.8rem",
          cursor: "pointer"
        }}
      >
        Reintentar
      </button>
    </div>
  );
}
