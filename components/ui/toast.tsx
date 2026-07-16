"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useEffect } from "react";

type ToastProps = {
  open: boolean;
  kind: "success" | "error";
  title: string;
  description?: string;
  onClose: () => void;
  duration?: number;
};

export function Toast({ open, kind, title, description, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timeout);
  }, [open, duration, onClose]);

  if (!open) return null;

  const tone = kind === "success"
    ? {
        Icon: CheckCircle2,
        border: "rgba(22,163,74,.35)",
        bg: "rgba(22,163,74,.12)",
        icon: "#16a34a",
        title: "#dcfce7"
      }
    : {
        Icon: CircleAlert,
        border: "rgba(204,0,0,.35)",
        bg: "rgba(204,0,0,.12)",
        icon: "#cc0000",
        title: "#ffe4e6"
      };

  const Icon = tone.Icon;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        zIndex: 2200,
        width: "min(380px, calc(100vw - 32px))",
        borderRadius: 14,
        border: `1px solid ${tone.border}`,
        background: "rgba(19,24,33,.96)",
        boxShadow: "0 20px 45px rgba(0,0,0,.35)",
        overflow: "hidden"
      }}
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 16px" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: tone.bg,
            border: `1px solid ${tone.border}`
          }}
        >
          <Icon size={18} color={tone.icon} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700, letterSpacing: ".04em", color: tone.title, textTransform: "uppercase" }}>
            {title}
          </div>
          {description ? (
            <div style={{ marginTop: 4, fontSize: ".8rem", lineHeight: 1.45, color: "#cbd5e1" }}>
              {description}
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", padding: 0, flexShrink: 0 }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
