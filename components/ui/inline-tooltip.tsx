"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function InlineTooltip({
  label,
  text,
  iconOnly = false
}: {
  label: string;
  text: string;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<{
    left: number;
    top: number;
    visibility: "hidden" | "visible";
  }>({
    left: 0,
    top: 0,
    visibility: "hidden"
  });

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!shellRef.current) return;
      if (shellRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !tooltipRef.current) return;

    function updatePosition() {
      if (!triggerRef.current || !tooltipRef.current) return;

      const triggerRect = triggerRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const gutter = 16;
      const offset = 8;
      const maxLeft = window.innerWidth - tooltipRect.width - gutter;
      const preferredLeft = triggerRect.left;
      const clampedLeft = Math.min(Math.max(preferredLeft, gutter), Math.max(gutter, maxLeft));
      const fitsAbove = triggerRect.top >= tooltipRect.height + gutter + offset;
      const top = fitsAbove
        ? triggerRect.top - tooltipRect.height - offset
        : Math.min(triggerRect.bottom + offset, window.innerHeight - tooltipRect.height - gutter);

      setTooltipStyle({
        left: clampedLeft,
        top: Math.max(gutter, top),
        visibility: "visible"
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  return (
    <span
      ref={shellRef}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        verticalAlign: "middle"
      }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={`${label}: ${text}`}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
          border: 0,
          background: "transparent",
          padding: 0,
          margin: 0,
          color: "inherit",
          cursor: "help",
          font: "inherit"
        }}
      >
        {!iconOnly ? (
          <span
            style={{
              borderBottom: "1px dotted currentColor",
              lineHeight: 1.25
            }}
          >
            {label}
          </span>
        ) : null}
        <HelpCircle size={12} style={{ opacity: 0.72, flexShrink: 0 }} />
      </button>

      {open ? (
        <span
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            left: tooltipStyle.left,
            top: tooltipStyle.top,
            zIndex: 60,
            width: "min(280px, calc(100vw - 32px))",
            maxWidth: "280px",
            padding: "8px 10px",
            borderRadius: "10px",
            border: "1px solid rgba(130,130,127,0.22)",
            background: "rgba(42,42,42,0.96)",
            color: "#fff",
            fontSize: "0.68rem",
            lineHeight: 1.45,
            fontWeight: 500,
            boxShadow: "0 14px 28px rgba(15,23,42,0.18)",
            whiteSpace: "normal",
            overflowWrap: "break-word",
            visibility: tooltipStyle.visibility
          }}
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
