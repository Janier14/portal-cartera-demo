export const FILTER_LABEL_STYLE = {
  fontFamily: "Space Mono,monospace",
  fontSize: ".65rem",
  color: "var(--module-muted)",
  letterSpacing: ".08em",
  marginRight: "2px",
  textTransform: "uppercase" as const
};

export const FILTER_BUTTON_BASE_STYLE = {
  fontFamily: "Space Mono,monospace",
  fontSize: ".68rem",
  fontWeight: 600,
  minHeight: "28px",
  padding: "4px 11px",
  borderRadius: "6px",
  border: "1px solid var(--module-border)",
  background: "var(--module-surface)",
  color: "var(--module-muted)",
  cursor: "pointer",
  transition: "all .15s ease"
};

export const FILTER_BUTTON_ACTIVE_STYLE = {
  border: "1px solid var(--module-accent)",
  background: "var(--module-surface)",
  color: "var(--module-accent)",
  fontWeight: 700
};

export const FILTER_SELECT_STYLE = {
  minHeight: "30px",
  minWidth: "128px",
  background: "#fff",
  border: "1px solid var(--module-border)",
  borderRadius: "6px",
  padding: "6px 12px",
  color: "var(--module-text)",
  fontFamily: "Space Mono,monospace",
  fontSize: ".68rem",
  fontWeight: 700,
  outline: "none"
};
