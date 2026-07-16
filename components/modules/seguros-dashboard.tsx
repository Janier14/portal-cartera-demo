"use client";

import "@/lib/modules/charts";

import { BadgeDollarSign, Building2, ClipboardList, Coins, Files, PieChart, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { ChartSkeleton, InlineTooltip, KpiCardSkeleton, LoadingState, MonthFilter, YearFilter } from "@/components/ui";
import { EmptyState } from "@/components/ui/dashboard-primitives";
import { aggregateSegurosMonthly, SegurosData, SegurosRow, segurosYears } from "@/lib/modules/seguros";

type SegurosTab = "resumen" | "detalle" | "aseguradora";
type ExcelCell = string | number;
type ExcelSheetSpec = { name: string; headers: ExcelCell[]; rows: ExcelCell[][]; cols?: Array<{ wch: number }> };
type MetricName = "comision" | "prima";
type SegurosApiData = SegurosData & { cutoff_label: string | null };

const COLORS = ["#00d4ff", "#7c3aed", "#10b981", "#f59e0b", "#ef4444", "#f97316", "#14b8a6", "#e11d48"];
const MONTH_KEYS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_LABELS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function formatMoney(value: number) {
  return `$${Math.round(Number(value || 0)).toLocaleString("es-CO")}`;
}

function normalizeMonthKey(value: string) {
  return String(value || "").trim().toLowerCase().slice(0, 3);
}

function valueForMetric(row: SegurosRow, metric: MetricName) {
  return Number(metric === "comision" ? row.COMISION : row.PRIMA) || 0;
}

function parsePaidDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const parsed = new Date(`${raw.slice(0, 10)}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parts = raw.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function buildDailyTrend(rows: SegurosRow[], year: number, monthKey: string) {
  const monthIndex = MONTH_KEYS.indexOf(monthKey);
  if (monthIndex < 0) return [];

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const grouped = new Map<number, { comision: number; prima: number }>();

  rows.forEach((row) => {
    const parsed = parsePaidDate(row.FECHA_PAGADA);
    if (!parsed) return;
    if (parsed.getFullYear() !== year || parsed.getMonth() !== monthIndex) return;
    const day = parsed.getDate();
    const current = grouped.get(day) ?? { comision: 0, prima: 0 };
    current.comision += Number(row.COMISION || 0);
    current.prima += Number(row.PRIMA || 0);
    grouped.set(day, current);
  });

  return Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const current = grouped.get(day) ?? { comision: 0, prima: 0 };
    return {
      mes: String(day).padStart(2, "0"),
      comision: current.comision,
      prima: current.prima
    };
  });
}

function buildYearlyComparison(rows: SegurosRow[], years: number[], monthKey: string | "all") {
  return years.map((item) => ({
    year: item,
    value: rows
      .filter((row) => row.ANIO === item && (monthKey === "all" || row.MES_KEY === monthKey))
      .reduce((sum, row) => sum + (Number(row.COMISION) || 0), 0)
  }));
}

function buildTopClients(rows: SegurosRow[]) {
  const grouped = new Map<string, { asegurado: string; comision: number; prima: number }>();
  rows.forEach((row) => {
    const key = row.ASEGURADO || "SIN ASEGURADO";
    const current = grouped.get(key) ?? { asegurado: key, comision: 0, prima: 0 };
    current.comision += Number(row.COMISION || 0);
    current.prima += Number(row.PRIMA || 0);
    grouped.set(key, current);
  });
  return [...grouped.values()].sort((a, b) => b.comision - a.comision).slice(0, 10);
}

function buildAseguradoraTotals(rows: SegurosRow[]) {
  const grouped = new Map<string, number>();
  rows.forEach((row) => {
    const key = row.ASEGURADORA || "SIN ASEGURADORA";
    grouped.set(key, (grouped.get(key) ?? 0) + Number(row.COMISION || 0));
  });
  return [...grouped.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function buildPivotByCliente(rows: SegurosRow[], metric: MetricName) {
  const grouped = new Map<string, { asegurado: string; aseguradora: string; poliza: string; meses: Record<string, number> }>();
  rows.forEach((row) => {
    const key = `${row.ASEGURADO || "SIN ASEGURADO"}||${row.ASEGURADORA || ""}||${row.POLIZA || ""}`;
    const monthKey = normalizeMonthKey(row.MES_KEY || row.MES);
    if (!MONTH_KEYS.includes(monthKey)) return;
    const current = grouped.get(key) ?? { asegurado: row.ASEGURADO || "SIN ASEGURADO", aseguradora: row.ASEGURADORA || "", poliza: row.POLIZA || "", meses: {} };
    current.meses[monthKey] = (current.meses[monthKey] ?? 0) + valueForMetric(row, metric);
    grouped.set(key, current);
  });

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      total: MONTH_KEYS.reduce((sum, key) => sum + Number(item.meses[key] || 0), 0)
    }))
    .sort((a, b) => b.total - a.total);
}

function buildPivotByAseguradora(rows: SegurosRow[], metric: MetricName) {
  const grouped = new Map<string, Record<string, number>>();
  rows.forEach((row) => {
    const aseguradora = row.ASEGURADORA || "SIN ASEGURADORA";
    const monthKey = normalizeMonthKey(row.MES_KEY || row.MES);
    if (!MONTH_KEYS.includes(monthKey)) return;
    const current = grouped.get(aseguradora) ?? {};
    current[monthKey] = (current[monthKey] ?? 0) + valueForMetric(row, metric);
    grouped.set(aseguradora, current);
  });

  return [...grouped.entries()]
    .map(([aseguradora, meses]) => ({
      aseguradora,
      meses,
      total: MONTH_KEYS.reduce((sum, key) => sum + Number(meses[key] || 0), 0)
    }))
    .sort((a, b) => b.total - a.total);
}

function rankClass(index: number) {
  if (index === 0) return { bg: "rgba(245,158,11,0.2)", border: "rgba(245,158,11,0.35)", color: "#f59e0b" };
  if (index === 1) return { bg: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.3)", color: "#a78bfa" };
  if (index === 2) return { bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)", color: "#10b981" };
  return { bg: "var(--module-surface-2)", border: "var(--module-border)", color: "var(--module-muted)" };
}

async function downloadExcelWorkbook(filename: string, sheets: ExcelSheetSpec[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();

  sheets.forEach(({ name, headers, rows, cols }) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    if (cols?.length) ws["!cols"] = cols;
    XLSX.utils.book_append_sheet(wb, ws, name);
  });

  XLSX.writeFile(wb, filename);
}


function DualScrollTable({ topId, children }: { topId: string; children: React.ReactNode }) {
  const topRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const top = topRef.current;
    const inner = innerRef.current;
    const bottom = bottomRef.current;
    if (!top || !inner || !bottom) return;

    const syncWidth = () => {
      const table = bottom.querySelector("table");
      inner.style.width = `${table?.scrollWidth ?? 0}px`;
    };

    const onTop = () => {
      bottom.scrollLeft = top.scrollLeft;
    };
    const onBottom = () => {
      top.scrollLeft = bottom.scrollLeft;
    };

    syncWidth();
    top.addEventListener("scroll", onTop);
    bottom.addEventListener("scroll", onBottom);
    window.addEventListener("resize", syncWidth);

    return () => {
      top.removeEventListener("scroll", onTop);
      bottom.removeEventListener("scroll", onBottom);
      window.removeEventListener("resize", syncWidth);
    };
  }, [children]);

  return (
    <>
      <div
        id={`${topId}Top`}
        ref={topRef}
        style={{
          overflowX: "auto",
          overflowY: "hidden",
          height: 12,
          marginBottom: -1,
          borderRadius: "12px 12px 0 0",
          border: "1px solid var(--module-border)",
          borderBottom: "none"
        }}
      >
        <div id={`${topId}Inner`} ref={innerRef} style={{ height: 1 }} />
      </div>
      <div
        id={`${topId}Bottom`}
        ref={bottomRef}
        className="module-table-wrap"
        style={{ overflowX: "auto", borderRadius: 12, border: "1px solid var(--module-border)" }}
      >
        {children}
      </div>
    </>
  );
}

export function SegurosDashboard() {
  const [data, setData] = useState<SegurosApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [year, setYear] = useState<number | "all">("all");
  const [month, setMonth] = useState<string | "all">("all");
  const [tab, setTab] = useState<SegurosTab>("resumen");
  const [search, setSearch] = useState("");
  const [aseguradoraFilter, setAseguradoraFilter] = useState("");
  const [anioDetalle, setAnioDetalle] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [anioAseguradora, setAnioAseguradora] = useState("");
  const [metric, setMetric] = useState<MetricName>("comision");
  const [detalleMetric, setDetalleMetric] = useState<MetricName>("comision");
  const [selectedAseguradoKey, setSelectedAseguradoKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/seguros/datos")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<SegurosApiData>;
      })
      .then((payload) => {
        setData(payload);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando datos de seguros");
        setLoading(false);
      });
  }, [reloadKey]);

  const years = useMemo(() => (data ? segurosYears(data) : []), [data]);
  const allRows = useMemo(() => data?.detalle ?? [], [data]);
  const resumenRows = useMemo(() => {
    let rows = year === "all" ? allRows : allRows.filter((row) => Number(row.ANIO) === Number(year));
    if (year !== "all" && month !== "all") {
      rows = rows.filter((row) => normalizeMonthKey(row.MES_KEY || row.MES) === month);
    }
    return rows;
  }, [allRows, year, month]);
  const detalleRows = useMemo(() => {
    let rows = [...allRows];
    if (search.trim()) rows = rows.filter((row) => String(row.ASEGURADO || "").toLowerCase().includes(search.trim().toLowerCase()));
    if (aseguradoraFilter) rows = rows.filter((row) => row.ASEGURADORA === aseguradoraFilter);
    if (anioDetalle) rows = rows.filter((row) => String(row.ANIO) === anioDetalle);
    if (estadoFilter) rows = rows.filter((row) => row.ESTADO === estadoFilter);
    return rows;
  }, [allRows, search, aseguradoraFilter, anioDetalle, estadoFilter]);
  const clientePivotRows = useMemo(() => {
    let rows = [...allRows];
    if (search.trim()) rows = rows.filter((row) => String(row.ASEGURADO || "").toLowerCase().includes(search.trim().toLowerCase()));
    if (aseguradoraFilter) rows = rows.filter((row) => row.ASEGURADORA === aseguradoraFilter);
    if (anioDetalle) rows = rows.filter((row) => String(row.ANIO) === anioDetalle);
    if (estadoFilter) rows = rows.filter((row) => row.ESTADO === estadoFilter);
    return buildPivotByCliente(rows, detalleMetric);
  }, [allRows, search, aseguradoraFilter, anioDetalle, estadoFilter, detalleMetric]);
  const clientePivotTotalsByMonth = useMemo(() =>
    MONTH_KEYS.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: clientePivotRows.reduce((sum, item) => sum + Number(item.meses[key] || 0), 0) }), {}),
  [clientePivotRows]);
  const clientePivotGrandTotal = useMemo(() => clientePivotRows.reduce((sum, item) => sum + item.total, 0), [clientePivotRows]);

  const aseguradoSnapshot = useMemo(() => {
    if (!selectedAseguradoKey) return null;
    const target = clientePivotRows.find((c) => `${c.asegurado}||${c.aseguradora}||${c.poliza}` === selectedAseguradoKey);
    if (!target) return null;

    const months = MONTH_KEYS.map((key, idx) => ({ value: Number(target.meses[key] || 0), index: idx }));
    const total = target.total;
    const metricLabel = detalleMetric === "comision" ? "Comisión" : "Prima";
    const activeMonths = months.filter((m) => m.value > 0);
    const activeCount = activeMonths.length;
    const avg = activeCount > 0 ? total / activeCount : 0;

    let peak: { value: number; index: number } | null = null;
    let valley: { value: number; index: number } | null = null;
    if (activeCount > 0) {
      const sorted = [...activeMonths].sort((a, b) => b.value - a.value);
      peak = sorted[0];
      valley = sorted[sorted.length - 1];
    }

    const firstMonth = activeMonths[0] ?? null;
    const lastMonth = activeMonths[activeMonths.length - 1] ?? null;
    const variationPct = firstMonth && lastMonth && firstMonth.value > 0 && firstMonth.index !== lastMonth.index
      ? ((lastMonth.value - firstMonth.value) / firstMonth.value) * 100
      : null;

    const sameInsurer = clientePivotRows.filter((c) => c.aseguradora === target.aseguradora);
    const sameInsurerTotals = sameInsurer.map((c) => c.total);
    const sameInsurerAvg = sameInsurerTotals.length > 0 ? sameInsurerTotals.reduce((a, b) => a + b, 0) / sameInsurerTotals.length : 0;
    const rank = sameInsurerTotals.filter((t) => t > total).length + 1;
    const diffPct = sameInsurerAvg !== 0 ? ((total - sameInsurerAvg) / Math.abs(sameInsurerAvg)) * 100 : 0;
    const trendState: "up" | "down" | "flat" = diffPct > 2 ? "up" : diffPct < -2 ? "down" : "flat";

    const maxMonthValue = months.reduce((max, m) => Math.max(max, m.value), 0);

    return {
      target,
      metricLabel,
      months,
      total,
      avg,
      activeCount,
      peak,
      valley,
      variationPct,
      sameInsurerAvg,
      sameInsurerCount: sameInsurer.length,
      rank,
      diffPct,
      trendState,
      maxMonthValue
    };
  }, [selectedAseguradoKey, clientePivotRows, detalleMetric]);

  const pivotRows = useMemo(() => {
    let rows = [...allRows];
    if (anioAseguradora) rows = rows.filter((row) => String(row.ANIO) === anioAseguradora);
    return buildPivotByAseguradora(rows, metric);
  }, [allRows, anioAseguradora, metric]);

  const resumen = useMemo(() => {
    const totalComision = resumenRows.reduce((sum, row) => sum + (Number(row.COMISION) || 0), 0);
    const totalPrima = resumenRows.reduce((sum, row) => sum + (Number(row.PRIMA) || 0), 0);
    const tasaEfectiva = totalPrima > 0 ? (totalComision / totalPrima) * 100 : null;
    return {
      totalComision,
      totalPrima,
      tasaEfectiva,
      clientes: new Set(resumenRows.map((row) => row.ASEGURADO)).size,
      registros: resumenRows.length
    };
  }, [resumenRows]);
  const monthlyTrend = useMemo(() => {
    if (year !== "all" && month !== "all") {
      return buildDailyTrend(resumenRows, Number(year), month);
    }
    return data ? aggregateSegurosMonthly(data, year) : [];
  }, [data, resumenRows, year, month]);
  const yearlyComparison = useMemo(() => buildYearlyComparison(allRows, years, month), [allRows, years, month]);
  const topClients = useMemo(() => buildTopClients(resumenRows), [resumenRows]);
  const aseguradoraTotals = useMemo(() => buildAseguradoraTotals(resumenRows), [resumenRows]);
  const aseguradoras = useMemo(() => [...new Set(allRows.map((row) => row.ASEGURADORA).filter(Boolean))].sort(), [allRows]);
  const estados = useMemo(() => [...new Set(allRows.map((row) => row.ESTADO).filter(Boolean))].sort(), [allRows]);
  const monthLabel = month === "all" ? "Todos" : MONTH_NAMES[MONTH_KEYS.indexOf(month)] ?? month.toUpperCase();
  const loadError = error || !data ? new Error(error ?? "No se pudieron cargar los datos de seguros.") : null;
  const moduleSkeleton = (
    <div className="module-page-standard">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 seguros-summary-kpis">
        {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`seguros-kpi-skeleton-${index}`} />)}
      </div>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }} className="max-[900px]:!grid-cols-1">
        <ChartSkeleton height={300} />
        <ChartSkeleton height={300} />
      </div>
    </div>
  );

  if (loading || loadError) {
    return (
      <LoadingState
        isLoading={loading}
        error={loading ? null : loadError}
        skeleton={moduleSkeleton}
        onRetry={() => setReloadKey((current) => current + 1)}
        errorMessage="No se pudieron cargar los datos de seguros."
      >
        <></>
      </LoadingState>
    );
  }

  const totalTop = topClients.reduce((sum, item) => sum + item.comision, 0);
  const maxTop = topClients.length ? Math.max(...topClients.map((item) => item.comision)) : 0;
  const pivotGrandTotal = pivotRows.reduce((sum, item) => sum + item.total, 0);
  const pivotTotalsByMonth = MONTH_KEYS.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: pivotRows.reduce((sum, item) => sum + Number(item.meses[key] || 0), 0) }), {});

  async function exportDetalleExcel() {
    const metricLabel = detalleMetric === "comision" ? "Comisión" : "Prima";
    const detalleMonthsWithData = MONTH_KEYS.filter((key) => Number(clientePivotTotalsByMonth[key] || 0) > 0).length;
    const detalleAvgGrand = detalleMonthsWithData > 0 ? clientePivotGrandTotal / detalleMonthsWithData : 0;
    await downloadExcelWorkbook(
      "Detalle_Cliente_Seguros_CMYM.xlsx",
      [{
        name: "Detalle_Cliente",
        headers: ["Asegurado", "Aseguradora", "Póliza", ...MONTH_LABELS, "Total", "Promedio"],
        rows: [
          ...clientePivotRows.map((item) => {
            const monthsWithData = MONTH_KEYS.filter((key) => Number(item.meses[key] || 0) > 0).length;
            const avg = monthsWithData > 0 ? item.total / monthsWithData : 0;
            return [
              item.asegurado,
              item.aseguradora,
              item.poliza,
              ...MONTH_KEYS.map((key) => Math.round(Number(item.meses[key] || 0))),
              Math.round(item.total),
              Math.round(avg)
            ];
          }),
          [`TOTAL GENERAL (${metricLabel})`, "", "", ...MONTH_KEYS.map((key) => Math.round(clientePivotTotalsByMonth[key] || 0)), Math.round(clientePivotGrandTotal), Math.round(detalleAvgGrand)]
        ],
        cols: [{ wch: 30 }, { wch: 22 }, { wch: 18 }, ...MONTH_KEYS.map(() => ({ wch: 13 })), { wch: 16 }, { wch: 14 }]
      }]
    );
  }

  async function exportAseguradoraExcel() {
    const pivotMonthsWithData = MONTH_KEYS.filter((key) => Number(pivotTotalsByMonth[key] || 0) > 0).length;
    const pivotAvgGrand = pivotMonthsWithData > 0 ? pivotGrandTotal / pivotMonthsWithData : 0;
    await downloadExcelWorkbook(
      "Detalle_Aseguradora_Seguros_CMYM.xlsx",
      [{
        name: "Aseguradoras",
        headers: ["Aseguradora", ...MONTH_LABELS, "Total", "Promedio"],
        rows: [
          ...pivotRows.map((item) => {
            const monthsWithData = MONTH_KEYS.filter((key) => Number(item.meses[key] || 0) > 0).length;
            const avg = monthsWithData > 0 ? item.total / monthsWithData : 0;
            return [
              item.aseguradora,
              ...MONTH_KEYS.map((key) => Math.round(Number(item.meses[key] || 0))),
              Math.round(item.total),
              Math.round(avg)
            ];
          }),
          ["TOTAL GENERAL", ...MONTH_KEYS.map((key) => Math.round(pivotTotalsByMonth[key] || 0)), Math.round(pivotGrandTotal), Math.round(pivotAvgGrand)]
        ],
        cols: [{ wch: 28 }, ...MONTH_KEYS.map(() => ({ wch: 12 })), { wch: 16 }, { wch: 14 }]
      }]
    );
  }

  return (
    <div className="module-page-standard seguros-page">
      <AssistantShell
        title="Control Seguros"
        contextBuilder={(question) => {
          const yearMatches = Array.from((question ?? "").matchAll(/\b(20\d{2})\b/g));
          const askedYears = Array.from(new Set(yearMatches.map((m) => Number(m[1])))).filter((y) => years.includes(y));
          const askedYear = askedYears.length === 1 ? askedYears[0] : null;
          const isComparison = askedYears.length >= 2;

          const resumenForYear = (yr: number) => {
            const rowsYr = allRows.filter((row) => Number(row.ANIO) === yr);
            const totalComision = rowsYr.reduce((sum, row) => sum + (Number(row.COMISION) || 0), 0);
            const totalPrima = rowsYr.reduce((sum, row) => sum + (Number(row.PRIMA) || 0), 0);
            return {
              totalComision,
              totalPrima,
              tasaEfectiva: totalPrima > 0 ? (totalComision / totalPrima) * 100 : null,
              clientes: new Set(rowsYr.map((row) => row.ASEGURADO)).size,
              registros: rowsYr.length
            };
          };

          if (isComparison && data) {
            const limitYears = askedYears.slice(0, 3);
            const perYear = limitYears.map((yr) => {
              const rowsYr = allRows.filter((row) => Number(row.ANIO) === yr);
              const block: Record<string, unknown> = {
                anio: yr,
                resumen: resumenForYear(yr),
                top_clientes: buildTopClients(rowsYr).slice(0, 10),
                aseguradoras: buildAseguradoraTotals(rowsYr).slice(0, 8),
                tendencia: aggregateSegurosMonthly(data, yr).slice(-12)
              };
              if (tab === "detalle") {
                block.clientesDetalle = buildPivotByCliente(rowsYr, detalleMetric).slice(0, 30).map((item) => ({
                  asegurado: item.asegurado,
                  aseguradora: item.aseguradora,
                  meses: MONTH_KEYS.map((key) => Math.round(Number(item.meses[key] || 0))),
                  total: Math.round(item.total)
                }));
              }
              if (tab === "aseguradora") {
                block.aseguradorasDetalle = buildPivotByAseguradora(rowsYr, metric).slice(0, 30).map((item) => ({
                  aseguradora: item.aseguradora,
                  meses: MONTH_KEYS.map((key) => Math.round(Number(item.meses[key] || 0))),
                  total: Math.round(item.total)
                }));
              }
              return block;
            });
            return JSON.stringify({
              tabActual: tab,
              aniosConsultados: limitYears,
              metrica: tab === "detalle" ? detalleMetric : tab === "aseguradora" ? metric : undefined,
              mesesOrden: MONTH_LABELS,
              nota: `Comparativo entre los anios ${limitYears.join(" y ")}. Cada anio trae su bloque en 'comparativo'.`,
              comparativo: perYear
            });
          }

          let baseSummary = resumen;
          let baseTop = topClients.slice(0, 8);
          let baseTendencia = monthlyTrend.slice(-12);
          let baseAseguradoras = aseguradoraTotals.slice(0, 8);

          if (askedYear && askedYear !== year && data) {
            const rowsYr = allRows.filter((row) => Number(row.ANIO) === askedYear);
            baseSummary = resumenForYear(askedYear);
            baseTop = buildTopClients(rowsYr).slice(0, 8);
            baseTendencia = aggregateSegurosMonthly(data, askedYear).slice(-12);
            baseAseguradoras = buildAseguradoraTotals(rowsYr).slice(0, 8);
          }

          const base = {
            tabActual: tab,
            anioConsultado: askedYear ?? null,
            resumen: baseSummary,
            top_clientes: baseTop,
            tendencia: baseTendencia,
            aseguradoras: baseAseguradoras
          };

          if (tab === "detalle") {
            let detalleClientes = clientePivotRows;
            if (askedYear && String(askedYear) !== anioDetalle) {
              let rowsYr = allRows.filter((row) => Number(row.ANIO) === askedYear);
              if (search.trim()) rowsYr = rowsYr.filter((row) => String(row.ASEGURADO || "").toLowerCase().includes(search.trim().toLowerCase()));
              if (aseguradoraFilter) rowsYr = rowsYr.filter((row) => row.ASEGURADORA === aseguradoraFilter);
              if (estadoFilter) rowsYr = rowsYr.filter((row) => row.ESTADO === estadoFilter);
              detalleClientes = buildPivotByCliente(rowsYr, detalleMetric);
            }
            const effectiveYear = askedYear ?? (anioDetalle ? Number(anioDetalle) : "todos");
            return JSON.stringify({
              ...base,
              filtroAnio: effectiveYear === "todos" ? "todos" : String(effectiveYear),
              metrica: detalleMetric,
              mesesOrden: MONTH_LABELS,
              nota: askedYear
                ? `Datos filtrados al anio ${askedYear} segun la pregunta.`
                : undefined,
              clientesDetalle: detalleClientes.slice(0, 80).map((item) => ({
                asegurado: item.asegurado,
                aseguradora: item.aseguradora,
                meses: MONTH_KEYS.map((key) => Math.round(Number(item.meses[key] || 0))),
                total: Math.round(item.total)
              }))
            });
          }

          if (tab === "aseguradora") {
            let aseguradorasDetalle = pivotRows;
            if (askedYear && String(askedYear) !== anioAseguradora) {
              const rowsYr = allRows.filter((row) => Number(row.ANIO) === askedYear);
              aseguradorasDetalle = buildPivotByAseguradora(rowsYr, metric);
            }
            const effectiveYear = askedYear ?? (anioAseguradora ? Number(anioAseguradora) : "todos");
            return JSON.stringify({
              ...base,
              filtroAnio: effectiveYear === "todos" ? "todos" : String(effectiveYear),
              metrica: metric,
              nota: askedYear
                ? `Datos filtrados al anio ${askedYear} segun la pregunta.`
                : undefined,
              aseguradorasDetalle: aseguradorasDetalle.map((item) => ({
                aseguradora: item.aseguradora,
                meses: MONTH_KEYS.map((key) => Math.round(Number(item.meses[key] || 0))),
                total: Math.round(item.total)
              }))
            });
          }

          return JSON.stringify(base);
        }}
        systemInstruction={
          tab === "detalle"
            ? "Estas en la hoja DETALLE POR CLIENTE de Seguros. El campo meses es un array de 12 valores (ENE a DIC). Un mismo asegurado puede tener varias filas si tiene polizas con distintas aseguradoras. Para calcular el promedio mensual de un asegurado, suma sus totales y divide entre los meses con valor mayor a 0. El campo filtroAnio indica el anio mostrado: si vale 'todos' los meses son acumulado de todos los anios. Si el bloque trae 'comparativo' es porque el usuario pregunto por varios anios; cada elemento contiene su anio y sus datos especificos."
            : tab === "aseguradora"
              ? "Estas en la hoja DETALLE POR ASEGURADORA de Seguros. El campo meses es un array de 12 valores (ENE a DIC). El campo filtroAnio indica el anio mostrado: si vale 'todos' los meses son acumulado de todos los anios. Si el bloque trae 'comparativo' es porque el usuario pregunto por varios anios; cada elemento contiene su anio y sus datos especificos."
              : undefined
        }
      />

      <ModuleHeader titulo="ANALITICA SEGUROS" subtitulo="// COMISIONES DEMO - PRIMAS - POLIZAS" cutoffLabel={data?.cutoff_label ?? null} />

      <div className="module-tab-nav seguros-main-tabs">
        {([
          ["resumen", "RESUMEN", <PieChart key="pie" size={14} />],
          ["detalle", "DETALLE POR CLIENTE", <ClipboardList key="client" size={14} />],
          ["aseguradora", "DETALLE POR ASEGURADORA", <Building2 key="ins" size={14} />]
        ] as const).map(([key, label, icon]) => (
          <button key={key} className={`module-tab-btn ${tab === key ? "is-active" : ""}`} onClick={() => setTab(key)}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "resumen" && (
        <>
          <div className="module-filter-inline seguros-summary-filter">
            <YearFilter
              years={years}
              value={year}
              onChange={(next) => {
                setYear(next);
                if (next === "all") {
                  setMonth("all");
                }
              }}
            />
            <MonthFilter
              value={month === "all" ? "all" : ((MONTH_KEYS.indexOf(month) + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12)}
              onChange={(next) => {
                if (next === "all") {
                  setMonth("all");
                  return;
                }
                setMonth(MONTH_KEYS[next - 1] ?? "all");
              }}
              disabled={year === "all"}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 seguros-summary-kpis">
            {([
              { label: "Total Comisiones", value: formatMoney(resumen.totalComision), sub: `COP \u00b7 ${year === "all" ? "todos los a\u00f1os" : month === "all" ? `a\u00f1o ${year}` : `${monthLabel} ${year}`}`, Icon: Coins, color: "var(--module-accent)", extra: resumen.tasaEfectiva !== null ? { label: `Tasa efectiva ${resumen.tasaEfectiva.toFixed(2)}%`, hint: `Comisi\u00f3n \u00f7 Prima neta. Por cada $100 vendidos en primas, ganas $${resumen.tasaEfectiva.toFixed(2)} en comisi\u00f3n.` } : null },
              { label: "Total Prima", value: formatMoney(resumen.totalPrima), sub: month === "all" ? "COP \u00b7 base de primas" : `COP \u00b7 ${monthLabel.toLowerCase()}`, Icon: BadgeDollarSign, color: "#10b981", extra: null },
              { label: "Clientes \u00danicos", value: String(resumen.clientes), sub: month === "all" ? "asegurados distintos" : `asegurados de ${monthLabel.toLowerCase()}`, Icon: Users, color: "#f59e0b", extra: null },
              { label: "Registros Totales", value: String(resumen.registros), sub: month === "all" ? "p\u00f3lizas procesadas" : `p\u00f3lizas en ${monthLabel.toLowerCase()}`, Icon: Files, color: "#8b5cf6", extra: null }
            ] as Array<{ label: string; value: string; sub: string; Icon: typeof Coins; color: string; extra: { label: string; hint: string } | null }>).map(({ label, value, sub, Icon, color, extra }) => (
              <section key={label} className="module-card module-card--plain module-kpi relative overflow-hidden" style={{ borderTop: "3px solid #dc2626" }}>
                <Icon size={22} style={{ position: "absolute", top: 16, right: 16, color, opacity: 0.3 }} />
                <p className="module-kpi__label">{label}</p>
                <p className="module-kpi__value">{value}</p>
                <p className="module-kpi__sub">{sub}</p>
                {extra ? (
                  <p style={{ marginTop: 6, fontSize: "0.74rem", fontWeight: 700, color: "var(--module-accent)", letterSpacing: "0.02em" }}>
                    <InlineTooltip label={extra.label} text={extra.hint} />
                  </p>
                ) : null}
              </section>
            ))}
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }} className="max-[900px]:!grid-cols-1">
            <section className="module-card module-card--plain seguros-chart-card">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[0.8rem] font-bold tracking-[0.03em]">{"COMISIONES POR A\u00d1O"}</span>
                <span className="rounded border px-2 py-1 font-mono text-[0.65rem] text-[var(--module-muted)]">{month === "all" ? "COP" : `${monthLabel.toUpperCase()} · COP`}</span>
              </div>
              <div style={{ height: 220 }}>
                <Bar
                  data={{
                    labels: yearlyComparison.map((item) => String(item.year)),
                    datasets: [{
                      label: month === "all" ? "Comisi\u00f3n" : `Comisi\u00f3n ${monthLabel}`,
                      data: yearlyComparison.map((item) => item.value),
                      backgroundColor: yearlyComparison.map((item) => item.year === Number(year) ? "rgba(0,212,255,0.9)" : item.year === new Date().getFullYear() ? "rgba(0,212,255,0.82)" : "rgba(0,212,255,0.65)"),
                      borderColor: "#00d4ff",
                      borderWidth: 1,
                      borderRadius: 4
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { backgroundColor: "#1a2235", borderColor: "#1e2d45", borderWidth: 1, titleColor: "#e2e8f0", bodyColor: "#94a3b8", padding: 10 }
                    },
                    scales: {
                      x: { grid: { color: "rgba(30,45,69,0.5)" }, ticks: { color: "#64748b" } },
                      y: {
                        grid: { color: "rgba(30,45,69,0.5)" },
                        ticks: {
                          color: "#64748b",
                          callback: (v) => {
                            const value = Number(v);
                            return "$" + (value >= 1e9 ? (value / 1e9).toFixed(1) + "B" : value >= 1e6 ? (value / 1e6).toFixed(0) + "M" : value);
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
             </section>

            <section className="module-card module-card--plain seguros-chart-card">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[0.8rem] font-bold tracking-[0.03em]">{"DISTRIBUCI\u00d3N POR ASEGURADORA"}</span>
                <span className="rounded border px-2 py-1 font-mono text-[0.65rem] text-[var(--module-muted)]">{"por comisi\u00f3n"}</span>
              </div>
              <div style={{ height: 180 }}>
                <Doughnut
                  data={{
                    labels: aseguradoraTotals.slice(0, 8).map((item) => item.label),
                    datasets: [{
                      data: aseguradoraTotals.slice(0, 8).map((item) => item.value),
                      backgroundColor: aseguradoraTotals.slice(0, 8).map((_, i) => COLORS[i % COLORS.length] + "cc"),
                      borderColor: aseguradoraTotals.slice(0, 8).map((_, i) => COLORS[i % COLORS.length]),
                      borderWidth: 2,
                      hoverOffset: 6
                    }]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { display: false } } }}
                />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {aseguradoraTotals.slice(0, 8).map((item, index) => {
                  const total = aseguradoraTotals.slice(0, 8).reduce((sum, row) => sum + row.value, 0);
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                  return (
                  <div key={item.label} className="flex items-center gap-1.5 rounded-md border px-3 py-2 text-[11px] text-[var(--module-muted)]" style={{ borderColor: "transparent" }}>
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />
                    <span className="truncate min-w-0">{item.label}</span>
                    <span className="ml-auto font-mono shrink-0" style={{ color: "var(--module-accent)", fontSize: "0.68rem" }}>{pct}%</span>
                  </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 2fr" }} className="max-[900px]:!grid-cols-1">
            <section className="module-card module-card--plain seguros-chart-card">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[0.8rem] font-bold tracking-[0.03em]">{month === "all" ? "TENDENCIA MENSUAL" : `TENDENCIA DIARIA · ${monthLabel.toUpperCase()}`}</span>
                <span className="rounded border px-2 py-1 font-mono text-[0.65rem] text-[var(--module-muted)]">{month === "all" ? "comisi\u00f3n vs prima" : `d\u00eda a d\u00eda ${year}`}</span>
              </div>
              <div style={{ height: 240 }}>
                <Line
                  data={{
                    labels: monthlyTrend.map((item) => item.mes),
                    datasets: [
                      { label: "Comisi\u00f3n", data: monthlyTrend.map((item) => item.comision), borderColor: "#0077c8", backgroundColor: "rgba(0,119,200,0.15)", fill: true, borderWidth: 2, pointBackgroundColor: "#0077c8", pointRadius: 4, pointHoverRadius: 6, tension: 0.35 },
                      { label: "Prima", data: monthlyTrend.map((item) => item.prima), borderColor: "#cc0000", backgroundColor: "rgba(204,0,0,0.1)", fill: true, borderWidth: 2, pointBackgroundColor: "#cc0000", pointRadius: 4, pointHoverRadius: 6, tension: 0.35, yAxisID: "y2" }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: { display: true, position: "bottom", labels: { color: "#64748b", boxWidth: 10, padding: 12 } },
                      tooltip: { backgroundColor: "#1a2235", borderColor: "#1e2d45", borderWidth: 1, titleColor: "#e2e8f0", bodyColor: "#94a3b8", padding: 10 }
                    },
                    scales: {
                      x: { grid: { color: "rgba(30,45,69,0.5)" }, ticks: { color: "#64748b", maxRotation: month === "all" ? 0 : 0, autoSkip: month === "all" ? false : true, maxTicksLimit: month === "all" ? 12 : 16 } },
                      y: { grid: { color: "rgba(30,45,69,0.5)" }, ticks: { color: "#64748b", callback: (v) => { const n = Number(v); return "$" + (n >= 1e6 ? (n / 1e6).toFixed(0) + "M" : n); } } },
                      y2: { position: "right", grid: { drawOnChartArea: false }, ticks: { color: "#64748b", callback: (v) => { const n = Number(v); return "$" + (n >= 1e6 ? (n / 1e6).toFixed(0) + "M" : n); } } }
                    }
                  }}
                />
              </div>
            </section>

            <section className="module-card module-card--plain seguros-chart-card">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-[0.8rem] font-bold tracking-[0.03em]">TOP 10 CLIENTES</span>
                <span className="rounded border px-2 py-1 font-mono text-[0.65rem] text-[var(--module-muted)]">{"por comisi\u00f3n"}</span>
              </div>
              {topClients.length === 0 ? (
                <EmptyState message={"No hay datos para el per\u00edodo seleccionado."} />
              ) : (
                <div className="overflow-hidden rounded-xl border border-[var(--module-border)]">
                  <table className="module-table min-w-full">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th style={{ textAlign: "left" }}>Asegurado</th>
                          <th>{"Comisi\u00f3n"}</th>
                          <th>{"Participaci\u00f3n"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClients.map((item, index) => {
                        const pct = totalTop > 0 ? ((item.comision / totalTop) * 100).toFixed(1) : "0.0";
                        const barW = maxTop > 0 ? Math.round((item.comision / maxTop) * 80) : 0;
                        const rank = rankClass(index);
                        return (
                          <tr key={item.asegurado}>
                            <td>
                              <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 28, padding: "4px 8px", borderRadius: 999, fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, background: rank.bg, border: `1px solid ${rank.border}`, color: rank.color }}>
                                {index + 1}
                              </span>
                            </td>
                            <td style={{ textAlign: "left", color: "var(--module-text)", fontWeight: 600 }}>{item.asegurado}</td>
                            <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatMoney(item.comision)}</td>
                            <td>
                              <div className="flex items-center justify-end gap-2">
                                <span className="font-mono text-[0.72rem] text-right" style={{ minWidth: "3rem" }}>{pct}%</span>
                                <div style={{ width: 80, display: "flex", alignItems: "center" }}>
                                  <span className="inline-block h-1.5 rounded-full" style={{ width: barW, background: "linear-gradient(90deg,var(--module-accent-2),var(--module-accent))" }} />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--module-border)] pt-4 font-mono text-[0.65rem] text-[var(--module-muted)]">
            <span>FUENTE: dataset demo de seguros</span>
            <span>{resumen.registros.toLocaleString("es-CO")} REGISTROS {"\u00b7"} {aseguradoras.length} ASEGURADORAS {"\u00b7"} {years.length} {"A\u00d1OS"}</span>
          </div>
        </>
      )}

      {tab === "detalle" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", overflow: "hidden", borderRadius: 8, border: "1px solid var(--module-border)", background: "var(--module-surface-2)" }}>
              <button className="font-mono text-[0.72rem]" style={{ padding: "7px 16px", background: detalleMetric === "comision" ? "rgba(220,38,38,0.12)" : "transparent", color: detalleMetric === "comision" ? "#dc2626" : "var(--module-muted)", border: "none", cursor: "pointer", transition: "all 0.15s" }} onClick={() => setDetalleMetric("comision")}>{"COMISI\u00d3N"}</button>
              <button className="font-mono text-[0.72rem]" style={{ padding: "7px 16px", background: detalleMetric === "prima" ? "rgba(220,38,38,0.12)" : "transparent", color: detalleMetric === "prima" ? "#dc2626" : "var(--module-muted)", border: "none", cursor: "pointer", transition: "all 0.15s" }} onClick={() => setDetalleMetric("prima")}>PRIMA NETA</button>
            </div>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar asegurado..." className="module-field" style={{ width: 200 }} />
            <select value={aseguradoraFilter} onChange={(e) => setAseguradoraFilter(e.target.value)} className="module-select" style={{ maxWidth: 180 }}>
              <option value="">Todas las aseguradoras</option>
              {aseguradoras.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={anioDetalle} onChange={(e) => setAnioDetalle(e.target.value)} className="module-select" style={{ maxWidth: 150 }}>
              <option value="">{"Todos los a\u00f1os"}</option>
              {years.map((item) => <option key={item} value={String(item)}>{item}</option>)}
            </select>
            <select value={estadoFilter} onChange={(e) => setEstadoFilter(e.target.value)} className="module-select" style={{ maxWidth: 180 }}>
              <option value="">Todos los estados</option>
              {estados.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button className="module-filter-year" style={{ whiteSpace: "nowrap" }} onClick={exportDetalleExcel}>
              Excel
            </button>
            <button className="module-filter-year" style={{ marginLeft: "auto", whiteSpace: "nowrap" }} onClick={() => { setSearch(""); setAseguradoraFilter(""); setAnioDetalle(""); setEstadoFilter(""); setDetalleMetric("comision"); }}>
              Limpiar
            </button>
          </div>

          <div className="font-mono text-[0.7rem] text-[var(--module-muted)]">
            {clientePivotRows.length} asegurados {"\u00b7"} {detalleMetric === "comision" ? "Comisi\u00f3n" : "Prima neta"} {"\u00b7"} Total: {formatMoney(clientePivotGrandTotal)}
          </div>

          <DualScrollTable topId="segurosDetalle">
            <table className="module-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", minWidth: 220 }}>ASEGURADO</th>
                  <th style={{ textAlign: "left", minWidth: 160 }}>ASEGURADORA</th>
                  <th style={{ textAlign: "left", minWidth: 120 }}>{"P\u00d3LIZA"}</th>
                  {MONTH_LABELS.map((label) => <th key={label} style={{ textAlign: "right", background: "#f3f4f6", color: "#374151", fontWeight: 600 }}>{label}</th>)}
                  <th style={{ textAlign: "right", background: "#f3f4f6", color: "#374151", fontWeight: 600 }}>TOTAL</th>
                  <th style={{ textAlign: "right", background: "#f3f4f6", color: "#374151", fontWeight: 600 }}>PROMEDIO</th>
                </tr>
              </thead>
              <tbody>
                {clientePivotRows.length === 0 ? (
                  <tr><td colSpan={17} style={{ textAlign: "center", padding: 30, color: "var(--module-muted)" }}>No se encontraron resultados</td></tr>
                ) : (
                  <>
                    {clientePivotRows.map((item) => {
                      const monthsWithData = MONTH_KEYS.filter((key) => Number(item.meses[key] || 0) > 0).length;
                      const avg = monthsWithData > 0 ? item.total / monthsWithData : 0;
                      return (
                      <tr key={`${item.asegurado}||${item.aseguradora}||${item.poliza}`} className="pyg-row-clickable" onClick={() => setSelectedAseguradoKey(`${item.asegurado}||${item.aseguradora}||${item.poliza}`)}>
                        <td style={{ textAlign: "left", color: "var(--module-text)", fontWeight: 600, whiteSpace: "nowrap" }}>{item.asegurado}</td>
                        <td style={{ textAlign: "left", color: "var(--module-muted)", whiteSpace: "nowrap" }}>{item.aseguradora || "\u2014"}</td>
                        <td style={{ textAlign: "left", color: "var(--module-muted)", fontFamily: "Space Mono,monospace", fontSize: ".72rem", whiteSpace: "nowrap" }}>{item.poliza || "\u2014"}</td>
                        {MONTH_KEYS.map((key) => {
                          const value = Number(item.meses[key] || 0);
                          return <td key={key} style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", whiteSpace: "nowrap" }}>{value ? formatMoney(value) : <span style={{ color: "var(--module-muted)" }}>{"\u2014"}</span>}</td>;
                        })}
                        <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700, color: "var(--module-accent-3)", whiteSpace: "nowrap" }}>{formatMoney(item.total)}</td>
                        <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", whiteSpace: "nowrap" }}>{monthsWithData > 0 ? formatMoney(avg) : <span style={{ color: "var(--module-muted)" }}>{"\u2014"}</span>}</td>
                      </tr>
                      );
                    })}
                    {(() => {
                      const monthsWithData = MONTH_KEYS.filter((key) => Number(clientePivotTotalsByMonth[key] || 0) > 0).length;
                      const avgGrand = monthsWithData > 0 ? clientePivotGrandTotal / monthsWithData : 0;
                      return (
                        <tr style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>
                          <td colSpan={3} style={{ color: "var(--module-accent)", background: "rgba(0,212,255,0.05)", borderTop: "1px solid rgba(0,212,255,0.2)" }}>TOTAL GENERAL</td>
                          {MONTH_KEYS.map((key) => (
                            <td key={key} style={{ textAlign: "right", color: "var(--module-accent)", background: "rgba(0,212,255,0.05)", borderTop: "1px solid rgba(0,212,255,0.2)", whiteSpace: "nowrap" }}>{formatMoney(clientePivotTotalsByMonth[key] || 0)}</td>
                          ))}
                          <td style={{ textAlign: "right", color: "var(--module-accent)", background: "rgba(0,212,255,0.05)", borderTop: "1px solid rgba(0,212,255,0.2)", whiteSpace: "nowrap" }}>{formatMoney(clientePivotGrandTotal)}</td>
                          <td style={{ textAlign: "right", color: "var(--module-accent)", background: "rgba(0,212,255,0.05)", borderTop: "1px solid rgba(0,212,255,0.2)", whiteSpace: "nowrap" }}>{monthsWithData > 0 ? formatMoney(avgGrand) : "\u2014"}</td>
                        </tr>
                      );
                    })()}
                  </>
                )}
              </tbody>
            </table>
          </DualScrollTable>
        </>
      )}

      {tab === "aseguradora" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", overflow: "hidden", borderRadius: 8, border: "1px solid var(--module-border)", background: "var(--module-surface-2)" }}>
              <button className="font-mono text-[0.72rem]" style={{ padding: "7px 16px", background: metric === "comision" ? "rgba(220,38,38,0.12)" : "transparent", color: metric === "comision" ? "#dc2626" : "var(--module-muted)", border: "none", cursor: "pointer", transition: "all 0.15s" }} onClick={() => setMetric("comision")}>{"COMISI\u00d3N"}</button>
              <button className="font-mono text-[0.72rem]" style={{ padding: "7px 16px", background: metric === "prima" ? "rgba(220,38,38,0.12)" : "transparent", color: metric === "prima" ? "#dc2626" : "var(--module-muted)", border: "none", cursor: "pointer", transition: "all 0.15s" }} onClick={() => setMetric("prima")}>PRIMA NETA</button>
            </div>
            <select value={anioAseguradora} onChange={(e) => setAnioAseguradora(e.target.value)} className="module-select" style={{ maxWidth: 200 }}>
              <option value="">{"Todos los a\u00f1os"}</option>
              {years.map((item) => <option key={item} value={String(item)}>{item}</option>)}
            </select>
            <button className="module-filter-year" style={{ whiteSpace: "nowrap" }} onClick={exportAseguradoraExcel}>
              Excel
            </button>
            <button className="module-filter-year" style={{ marginLeft: "auto", whiteSpace: "nowrap" }} onClick={() => { setAnioAseguradora(""); setMetric("comision"); }}>
              Limpiar
            </button>
          </div>

          <div className="font-mono text-[0.7rem] text-[var(--module-muted)]">
            {pivotRows.length} aseguradoras {"\u00b7"} {metric === "comision" ? "Comisi\u00f3n" : "Prima neta"} {"\u00b7"} Total: {formatMoney(pivotGrandTotal)}
          </div>

          <DualScrollTable topId="segurosAseguradora">
            <table className="module-table" style={{ minWidth: 1100 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", minWidth: 200 }}>ASEGURADORA</th>
                  {MONTH_LABELS.map((label) => <th key={label} style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600 }}>{label}</th>)}
                  <th style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600 }}>TOTAL</th>
                  <th style={{ background: "#f3f4f6", color: "#374151", fontWeight: 600 }}>PROMEDIO</th>
                </tr>
              </thead>
              <tbody>
                {pivotRows.length === 0 ? (
                  <tr><td colSpan={15} style={{ textAlign: "center", padding: 30, color: "var(--module-muted)" }}>No hay datos</td></tr>
                ) : (
                  <>
                    {pivotRows.map((item) => {
                      const monthsWithData = MONTH_KEYS.filter((key) => Number(item.meses[key] || 0) > 0).length;
                      const avg = monthsWithData > 0 ? item.total / monthsWithData : 0;
                      return (
                      <tr key={item.aseguradora}>
                        <td style={{ textAlign: "left", color: "var(--module-text)" }}>{item.aseguradora}</td>
                        {MONTH_KEYS.map((key) => {
                          const value = Number(item.meses[key] || 0);
                          return <td key={key} style={value < 0 ? { color: "#ef4444", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 } : undefined}>{value ? formatMoney(value) : <span style={{ color: "#2d3f5a" }}>{"\u2014"}</span>}</td>;
                        })}
                        <td className="font-mono text-[0.72rem] font-bold" style={{ color: item.total < 0 ? "#ef4444" : "var(--module-accent-3)" }}>{formatMoney(item.total)}</td>
                        <td className="font-mono text-[0.72rem]" style={{ color: avg < 0 ? "#ef4444" : undefined }}>{monthsWithData > 0 ? formatMoney(avg) : <span style={{ color: "#2d3f5a" }}>{"\u2014"}</span>}</td>
                      </tr>
                      );
                    })}
                    {(() => {
                      const monthsWithData = MONTH_KEYS.filter((key) => Number(pivotTotalsByMonth[key] || 0) > 0).length;
                      const avgGrand = monthsWithData > 0 ? pivotGrandTotal / monthsWithData : 0;
                      return (
                        <tr>
                          <td className="font-mono text-[0.72rem] font-bold" style={{ color: "var(--module-accent)", background: "color-mix(in srgb, var(--module-accent) 5%, transparent)", borderTop: "1px solid color-mix(in srgb, var(--module-accent) 20%, transparent)" }}>TOTAL GENERAL</td>
                          {MONTH_KEYS.map((key) => (
                            <td key={key} className="font-mono text-[0.72rem] font-bold" style={{ color: "var(--module-accent)", background: "color-mix(in srgb, var(--module-accent) 5%, transparent)" }}>
                              {formatMoney(pivotTotalsByMonth[key] || 0)}
                            </td>
                          ))}
                          <td className="font-mono text-[0.72rem] font-bold" style={{ color: "var(--module-accent)", background: "color-mix(in srgb, var(--module-accent) 5%, transparent)" }}>{formatMoney(pivotGrandTotal)}</td>
                          <td className="font-mono text-[0.72rem] font-bold" style={{ color: "var(--module-accent)", background: "color-mix(in srgb, var(--module-accent) 5%, transparent)" }}>{monthsWithData > 0 ? formatMoney(avgGrand) : "\u2014"}</td>
                        </tr>
                      );
                    })()}
                  </>
                )}
              </tbody>
            </table>
          </DualScrollTable>
        </>
      )}

      {aseguradoSnapshot ? (
        <div className="pyg-modal-overlay" onClick={() => setSelectedAseguradoKey(null)}>
          <div className="pyg-modal-panel" role="dialog" aria-modal="true" aria-labelledby="aseguradoModalTitle" onClick={(event) => event.stopPropagation()}>
            <div className="pyg-modal-header">
              <div>
                <div className="pyg-modal-kicker">{`Ficha de ${aseguradoSnapshot.metricLabel} · Detalle por Asegurado`}</div>
                <h3 className="pyg-modal-title" id="aseguradoModalTitle">{aseguradoSnapshot.target.asegurado}</h3>
                <div className="pyg-modal-subtitle">
                  {aseguradoSnapshot.target.aseguradora || "Sin aseguradora"} {" · "} Póliza: {aseguradoSnapshot.target.poliza || "—"} {anioDetalle ? ` · ${anioDetalle}` : " · todos los años"}
                </div>
              </div>
              <button className="pyg-modal-close" type="button" aria-label="Cerrar panel" onClick={() => setSelectedAseguradoKey(null)}>
                &times;
              </button>
            </div>

            <div className="pyg-modal-body">
              <div className="pyg-modal-grid">
                <div className="pyg-modal-stat" data-kind="bruto">
                  <span className="pyg-modal-stat-label">{`Total ${aseguradoSnapshot.metricLabel}`}</span>
                  <span className="pyg-modal-stat-value money">{formatMoney(aseguradoSnapshot.total)}</span>
                </div>

                <div className="pyg-modal-stat" data-kind="neto">
                  <span className="pyg-modal-stat-label">Promedio Mensual</span>
                  <span className="pyg-modal-stat-value money">{formatMoney(aseguradoSnapshot.avg)}</span>
                  <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)" }}>
                    {aseguradoSnapshot.activeCount} de 12 meses con actividad
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="margen">
                  <span className="pyg-modal-stat-label">Variación primer → último mes</span>
                  <span className="pyg-modal-stat-value">
                    {aseguradoSnapshot.variationPct === null ? "Sin dato" : `${aseguradoSnapshot.variationPct >= 0 ? "+" : ""}${aseguradoSnapshot.variationPct.toFixed(1)}%`}
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="arl">
                  <span className="pyg-modal-stat-label">Aseguradora</span>
                  <span className="pyg-modal-stat-value">{aseguradoSnapshot.target.aseguradora || "—"}</span>
                  <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)" }}>
                    Póliza {aseguradoSnapshot.target.poliza || "—"}
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="retorno">
                  <span className="pyg-modal-stat-label">Mes Más Alto</span>
                  <span className="pyg-modal-stat-value money">
                    {aseguradoSnapshot.peak ? formatMoney(aseguradoSnapshot.peak.value) : "—"}
                    {aseguradoSnapshot.peak ? (
                      <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)", marginLeft: 6 }}>
                        ({MONTH_LABELS[aseguradoSnapshot.peak.index]})
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="retencion">
                  <span className="pyg-modal-stat-label">Mes Más Bajo</span>
                  <span className="pyg-modal-stat-value money">
                    {aseguradoSnapshot.valley ? formatMoney(aseguradoSnapshot.valley.value) : "—"}
                    {aseguradoSnapshot.valley ? (
                      <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)", marginLeft: 6 }}>
                        ({MONTH_LABELS[aseguradoSnapshot.valley.index]})
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--module-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {`Distribución mensual · ${aseguradoSnapshot.metricLabel}`}
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, padding: "8px 4px", background: "var(--module-surface-soft, rgba(0,0,0,0.03))", borderRadius: 6 }}>
                  {aseguradoSnapshot.months.map((month) => {
                    const heightPct = aseguradoSnapshot.maxMonthValue > 0 ? (month.value / aseguradoSnapshot.maxMonthValue) * 100 : 0;
                    const isPeak = aseguradoSnapshot.peak?.index === month.index;
                    return (
                      <div key={month.index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%" }}>
                        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                          <div
                            title={`${MONTH_LABELS[month.index]}: ${month.value > 0 ? formatMoney(month.value) : "Sin dato"}`}
                            style={{
                              width: "100%",
                              height: `${heightPct}%`,
                              minHeight: month.value > 0 ? 2 : 0,
                              background: isPeak ? "#0077c8" : month.value > 0 ? "rgba(0,119,200,0.4)" : "transparent",
                              borderRadius: "2px 2px 0 0"
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "0.6rem", color: "var(--module-muted)" }}>{MONTH_LABELS[month.index].slice(0, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`pyg-trend-${aseguradoSnapshot.trendState}`}>
                <div className="pyg-modal-trend">
                  <div className="pyg-modal-trend-icon">
                    {aseguradoSnapshot.trendState === "up" ? "↑" : aseguradoSnapshot.trendState === "down" ? "↓" : "→"}
                  </div>
                  <div className="pyg-modal-trend-copy">
                    <span className="pyg-modal-trend-label">{`Posición en ${aseguradoSnapshot.target.aseguradora || "su aseguradora"}`}</span>
                    <span className="pyg-modal-trend-value">
                      {`#${aseguradoSnapshot.rank} de ${aseguradoSnapshot.sameInsurerCount} asegurados`}
                    </span>
                    <span className="pyg-modal-trend-sub">
                      {`${aseguradoSnapshot.diffPct >= 0 ? "+" : ""}${aseguradoSnapshot.diffPct.toFixed(1)}% vs promedio de la aseguradora (${formatMoney(aseguradoSnapshot.sameInsurerAvg)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
