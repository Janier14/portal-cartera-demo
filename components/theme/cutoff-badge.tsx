type CutoffBadgeProps = {
  label: string;
};

export function CutoffBadge({ label }: CutoffBadgeProps) {
  return (
    <div className="module-cutoff-badge">
      <span className="module-cutoff-badge__dot" />
      <span>{`CORTE: ${label}`}</span>
    </div>
  );
}
