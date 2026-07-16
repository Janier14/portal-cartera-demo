export function formatCompactCurrency(value: number) {
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${Math.round(value / 1e6)}M`;
  return `$${Math.round(value).toLocaleString("es-CO")}`;
}

export function formatCurrency(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-CO")}`;
}

export function formatNumber(value: number) {
  return Math.round(value || 0).toLocaleString("es-CO");
}
