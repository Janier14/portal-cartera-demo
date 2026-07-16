"use client";

import "@/lib/modules/charts";

import { Building2, ClipboardList, Coins, FileSpreadsheet, FileText, Files, PieChart, TrendingUp } from "lucide-react";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { ChartSkeleton, KpiCardSkeleton, LoadingState, YearFilter } from "@/components/ui";
import { EmptyState } from "@/components/ui/dashboard-primitives";
import {
  aggregateArlByArlForYear,
  aggregateArlCities,
  aggregateArlCompanies,
  aggregateArlCompaniesByMonth,
  aggregateArlInsurersByYear,
  aggregateArlMonthly,
  aggregateArlSummaryByInsurerAndMonth,
  arlYears,
  ARL_COLORS,
  ArlData,
  ArlMode,
  getArlSummary,
  getArlTopCompanies,
  MONTH_LABELS,
  MONTH_ORDER,
  resolveArlYear
} from "@/lib/modules/arl";
import { formatCompactCurrency, formatCurrency, formatNumber } from "@/lib/modules/format";

type ArlTab = "resumen" | "detalle" | "pyg" | "arl";
type ExcelCell = string | number;
type ExcelSheetSpec = { name: string; headers: ExcelCell[]; rows: ExcelCell[][]; cols?: Array<{ wch: number }> };
type DetailMetric = "comision" | "cotizacion";
type ArlApiData = ArlData & { cutoff_label: string | null };

const DETAIL_MONTH_OPTIONS = MONTH_ORDER.map((month, index) => ({ value: month, label: MONTH_LABELS[index] }));
const YEAR_BAR_ACTIVE = "rgba(0,212,255,0.9)";
const YEAR_BAR_BASE = "rgba(0,212,255,0.7)";
const YEAR_BAR_MUTED = "rgba(0,212,255,0.2)";
const LINE_COMISION = "#0077c8";
const LINE_COTIZACION = "#cc0000";
const CITY_BAR_GRADIENT = "linear-gradient(90deg, #7c3aed, #00d4ff)";
const CHART_TICK = "#64748b";
const CHART_GRID = "rgba(30,45,69,0.5)";
const CHART_TOOLTIP_BG = "#1a2235";
const CHART_TOOLTIP_BORDER = "#1e2d45";
const CHART_TOOLTIP_TITLE = "#e2e8f0";
const CHART_TOOLTIP_BODY = "#94a3b8";

function formatArlCompactCurrency(value: number) {
  if (Math.abs(value) >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (Math.abs(value) >= 1e6) return `$${Math.round(value / 1e6)}M`;
  return `$${Math.round(value || 0).toLocaleString("es-CO")}`;
}

function formatArlCompactNumber(value: number) {
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return formatNumber(value);
}

function formatArlKpi(value: number, selectedYear: number | "all") {
  return selectedYear === "all" ? formatArlCompactCurrency(value) : formatCurrency(value);
}

function buildAreaGradient(context: { chart?: { ctx: CanvasRenderingContext2D; chartArea?: { top: number; bottom: number } } }, rgb: string) {
  const chart = context.chart;
  if (!chart?.chartArea) return `rgba(${rgb},0.12)`;
  const gradient = chart.ctx.createLinearGradient(0, chart.chartArea.top, 0, chart.chartArea.bottom);
  gradient.addColorStop(0, `rgba(${rgb},0.3)`);
  gradient.addColorStop(1, `rgba(${rgb},0.02)`);
  return gradient;
}

function formatChartMoney(value: number) {
  return `$${Math.round(value || 0).toLocaleString("es-CO")}`;
}

function formatChartMillions(value: string | number) {
  return `$${(Number(value) / 1e6).toFixed(0)}M`;
}

function DualScrollTable({ topId, children }: { topId: string; children: ReactNode }) {
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
      <div id={`${topId}Top`} ref={topRef} className="dual-scroll-top">
        <div id={`${topId}Inner`} ref={innerRef} className="dual-scroll-top-inner" />
      </div>
      <div id={`${topId}Bottom`} ref={bottomRef} className="dual-scroll-bottom dual-scroll-wrap">
        {children}
      </div>
    </>
  );
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

function createArlChartOptions({
  legend = false,
  tooltipMode = "nearest",
  stacked = false,
  rightAxis = false
}: {
  legend?: boolean;
  tooltipMode?: "nearest" | "index";
  stacked?: boolean;
  rightAxis?: boolean;
} = {}) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: legend
        ? {
            display: true,
            position: "bottom",
            labels: {
              color: CHART_TICK,
              font: { family: "Space Mono", size: 9 },
              boxWidth: 10,
              padding: 12
            }
          }
        : { display: false },
      tooltip: {
        mode: tooltipMode,
        backgroundColor: CHART_TOOLTIP_BG,
        borderColor: CHART_TOOLTIP_BORDER,
        borderWidth: 1,
        titleColor: CHART_TOOLTIP_TITLE,
        bodyColor: CHART_TOOLTIP_BODY,
        titleFont: { family: "Space Mono", size: 11 },
        bodyFont: { family: "DM Sans", size: 13, weight: "bold" },
        padding: 10
      }
    },
    scales: {
      x: {
        stacked,
        grid: { color: CHART_GRID },
        ticks: { color: CHART_TICK, font: { family: "Space Mono", size: 10 } }
      },
      y: {
        stacked,
        position: "left",
        grid: { color: CHART_GRID },
        ticks: {
          color: CHART_TICK,
          font: { family: "Space Mono", size: 10 },
          callback: (value: any) => formatChartMillions(value)
        }
      },
      ...(rightAxis
        ? {
            y2: {
              position: "right",
              grid: { drawOnChartArea: false, color: CHART_GRID },
              ticks: {
                color: CHART_TICK,
                font: { family: "Space Mono", size: 10 },
                callback: (value: string | number) => formatChartMillions(value)
              }
            }
          }
        : {})
    }
  };
}

export function ArlDashboard() {
  const [data, setData] = useState<ArlApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [mode, setMode] = useState<ArlMode>("BRUTO");
  const [year, setYear] = useState<number | "all">("all");
  const [tab, setTab] = useState<ArlTab>("resumen");
  const [search, setSearch] = useState("");
  const [arlFilter, setArlFilter] = useState("");
  const [detailYearFilter, setDetailYearFilter] = useState("");
  const [detailMetric, setDetailMetric] = useState<DetailMetric>("comision");
  const [arlYearFilter, setArlYearFilter] = useState("");
  const [arlMonthFilter, setArlMonthFilter] = useState("");
  const [arlMetric, setArlMetric] = useState<DetailMetric>("comision");
  const [pygYearFilter, setPygYearFilter] = useState("");
  const [pygArlFilter, setPygArlFilter] = useState("");
  const [pygSearch, setPygSearch] = useState("");
  const [selectedPygCompany, setSelectedPygCompany] = useState<string | null>(null);
  const [selectedDetalleKey, setSelectedDetalleKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/arl/datos")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<ArlApiData>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Error cargando datos ARL");
        setLoading(false);
      });
  }, [reloadKey]);

  const years = useMemo(() => (data ? arlYears(data) : []), [data]);
  const arls = useMemo(() => (data ? Array.from(new Set(data.detalle.map((row) => row.ARL))).sort() : []), [data]);
  const summary = useMemo(() => (data ? getArlSummary(data, mode, year) : null), [data, mode, year]);
  const topCompanies = useMemo(() => (data ? getArlTopCompanies(data, mode, year) : []), [data, mode, year]);
  const trend = useMemo(() => (data ? aggregateArlMonthly(data, mode, year) : []), [data, mode, year]);
  const arlBreakdown = useMemo(() => (data ? aggregateArlByArlForYear(data, mode, year) : []), [data, mode, year]);
  const arlStacked = useMemo(() => (data ? aggregateArlInsurersByYear(data, mode) : { years: [], arls: [], series: [] }), [data, mode]);
  const cityBreakdown = useMemo(() => (data ? aggregateArlCities(data, mode, year) : []), [data, mode, year]);
  const insurerSummary = useMemo(() => (data ? aggregateArlSummaryByInsurerAndMonth(data, mode, year) : { months: [], rows: [], totals: [], grandTotal: 0 }), [data, mode, year]);
  const totalRecordsOverall = useMemo(() => (data ? Number(data.total_registros ?? data.detalle.length ?? 0) : 0), [data]);
  const loadError = error || !data || !summary ? new Error(error ?? "No se pudieron cargar los datos ARL.") : null;
  const moduleSkeleton = (
    <div className="module-page-standard arl-page arl-legacy">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`arl-kpi-skeleton-${index}`} />)}
      </div>
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "2fr 1fr" }} className="max-[900px]:!grid-cols-1">
        <ChartSkeleton height={300} />
        <ChartSkeleton height={300} />
      </div>
    </div>
  );
  const totalCitiesOverall = useMemo(() => (data ? Object.keys(data.por_ciudad ?? {}).length : 0), [data]);
  const totalRecordsVisible = summary?.totalRegistros ?? totalRecordsOverall;
  const totalCitiesVisible = year === "all" ? totalCitiesOverall : cityBreakdown.length;
  const totalArlsVisible = year === "all" ? arls.length : arlBreakdown.length;

  const companies = useMemo(() => {
    if (!data) return [];
    const selectedYear = detailYearFilter ? Number(detailYearFilter) : "all";
    const base = aggregateArlCompaniesByMonth(data, detailMetric === "comision" ? mode : "BRUTO", selectedYear);
    return base
      .filter((item) => item.empresa.toLowerCase().includes(search.toLowerCase()) && (!arlFilter || item.arl === arlFilter))
      .sort((a, b) => (detailMetric === "comision" ? b.comision - a.comision : b.cotizacion - a.cotizacion));
  }, [data, mode, detailMetric, detailYearFilter, search, arlFilter]);

  const arlDetailData = useMemo(() => {
    if (!data) {
      return {
        monthKeys: [] as string[],
        rows: [] as Array<{ label: string; months: number[]; total: number }>
      };
    }
    const selectedYear = arlYearFilter ? Number(arlYearFilter) : "all";
    const rows = selectedYear === "all" ? data.detalle : data.detalle.filter((row) => resolveArlYear(row) === selectedYear);
    const monthKeys = arlMonthFilter ? [arlMonthFilter] : MONTH_ORDER.filter((month) => rows.some((row) => row.MES.toLowerCase().startsWith(month)));
    const map = new Map<string, number[]>();

    rows
      .filter((row) => !arlMonthFilter || row.MES.toLowerCase().startsWith(arlMonthFilter))
      .forEach((row) => {
        const arl = row.ARL;
        const monthIndex = monthKeys.findIndex((month) => row.MES.toLowerCase().startsWith(month));
        if (monthIndex === -1) return;
        const amount = arlMetric === "comision" ? Number(row[mode === "NETO" ? "COMISION_NETA" : "COMISION"] || 0) : Number(row.COTIZACION || 0);
        const current = map.get(arl) ?? monthKeys.map(() => 0);
        current[monthIndex] += amount;
        map.set(arl, current);
      });

    return {
      monthKeys,
      rows: Array.from(map.entries())
        .map(([label, months]) => ({ label, months, total: months.reduce((sum, value) => sum + value, 0) }))
        .sort((a, b) => b.total - a.total)
    };
  }, [data, arlYearFilter, arlMonthFilter, arlMetric, mode]);

  const pygRows = useMemo(() => {
    if (!data) return [];
    let rows = data.detalle;
    if (pygYearFilter) rows = rows.filter((row) => resolveArlYear(row) === Number(pygYearFilter));
    if (pygArlFilter) rows = rows.filter((row) => row.ARL === pygArlFilter);
    if (pygSearch) rows = rows.filter((row) => row.EMPRESA.toLowerCase().includes(pygSearch.toLowerCase()));

    const grouped = new Map<string, { empresa: string; bruto: number; neto: number; retencion: number; retorno: number }>();
    rows.forEach((row) => {
      const current = grouped.get(row.EMPRESA) ?? { empresa: row.EMPRESA, bruto: 0, neto: 0, retencion: 0, retorno: 0 };
      current.bruto += Number(row.COMISION || 0);
      current.neto += Number(row.COMISION_NETA || 0);
      current.retencion += Number(row.VALOR_RETENCION || 0);
      current.retorno += Number(row.VALOR_RETORNO || 0);
      grouped.set(row.EMPRESA, current);
    });

    return Array.from(grouped.values())
      .map((item) => ({
        ...item,
        margen: item.bruto > 0 ? (item.neto / item.bruto) * 100 : 0
      }))
      .sort((a, b) => b.bruto - a.bruto);
  }, [data, pygYearFilter, pygArlFilter, pygSearch]);

  const pygSnapshot = useMemo(() => {
    if (!data || !selectedPygCompany) return null;

    let records = data.detalle.filter((row) => row.EMPRESA === selectedPygCompany);
    if (pygYearFilter) records = records.filter((row) => resolveArlYear(row) === Number(pygYearFilter));
    if (pygArlFilter) records = records.filter((row) => row.ARL === pygArlFilter);
    if (!records.length) return null;

    const bruto = records.reduce((sum, row) => sum + Number(row.COMISION || 0), 0);
    const neto = records.reduce((sum, row) => sum + Number(row.COMISION_NETA || 0), 0);
    const retencion = records.reduce((sum, row) => sum + Number(row.VALOR_RETENCION || 0), 0);
    const retorno = records.reduce((sum, row) => sum + Number(row.VALOR_RETORNO || 0), 0);
    const margen = bruto > 0 ? (neto / bruto) * 100 : 0;
    const retentionPct = bruto > 0 ? (retencion / bruto) * 100 : 0;
    const retornoPct = bruto > 0 ? (retorno / bruto) * 100 : 0;

    const principalArl =
      Array.from(records.reduce((map, row) => map.set(row.ARL, (map.get(row.ARL) ?? 0) + Number(row.COMISION || 0)), new Map<string, number>()))
        .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

    const nit = records.find((row) => String((row as Record<string, unknown>).NIT ?? "").trim())?.NIT ?? "";
    const companyHistory = data.detalle.filter((row) => row.EMPRESA === selectedPygCompany && (!pygArlFilter || row.ARL === pygArlFilter));
    const yearMonthMap = new Map<number, Set<string>>();

    companyHistory.forEach((row) => {
      const yearValue = resolveArlYear(row);
      const monthKey = String(row.MES || "").trim().slice(0, 3).toLowerCase();
      if (!yearValue || !monthKey) return;
      const months = yearMonthMap.get(yearValue) ?? new Set<string>();
      months.add(monthKey);
      yearMonthMap.set(yearValue, months);
    });

    const fullYears = Array.from(yearMonthMap.entries())
      .filter(([, months]) => months.size >= 12)
      .map(([yearValue]) => yearValue)
      .sort((a, b) => a - b);

    const requestedYear = pygYearFilter ? Number(pygYearFilter) : null;
    const referenceYear = requestedYear
      ? [...fullYears].reverse().find((yearValue) => yearValue <= requestedYear) ?? null
      : fullYears[fullYears.length - 1] ?? null;
    const previousYear = referenceYear ? [...fullYears].reverse().find((yearValue) => yearValue < referenceYear) ?? null : null;
    const referenceNet = referenceYear
      ? companyHistory.filter((row) => resolveArlYear(row) === referenceYear).reduce((sum, row) => sum + Number(row.COMISION_NETA || 0), 0)
      : 0;
    const previousNet = previousYear
      ? companyHistory.filter((row) => resolveArlYear(row) === previousYear).reduce((sum, row) => sum + Number(row.COMISION_NETA || 0), 0)
      : 0;

    let trendState: "up" | "down" | "flat" = "flat";
    let trendText = "Sin base previa";
    let trendSub = "No hay un a\u00f1o anterior comparable para esta empresa.";

    if (previousYear) {
      trendState = referenceNet > previousNet ? "up" : referenceNet < previousNet ? "down" : "flat";
      trendText = trendState === "up" ? "Subi\u00f3 vs a\u00f1o anterior" : trendState === "down" ? "Baj\u00f3 vs a\u00f1o anterior" : "Sin variaci\u00f3n vs a\u00f1o anterior";
      const diff = referenceNet - previousNet;
      const diffPct = previousNet > 0 ? (diff / previousNet) * 100 : 0;
      trendSub = `${referenceYear}: ${formatCurrency(referenceNet)} vs ${previousYear}: ${formatCurrency(previousNet)} (${diff >= 0 ? "+" : ""}${diffPct.toFixed(1)}%)`;
    }

    return {
      empresa: selectedPygCompany,
      nit: String(nit || ""),
      principalArl,
      bruto,
      retencion,
      retentionPct,
      retorno,
      retornoPct,
      neto,
      margen,
      trendState,
      trendText,
      trendSub
    };
  }, [data, pygArlFilter, pygYearFilter, selectedPygCompany]);

  const detalleSnapshot = useMemo(() => {
    if (!selectedDetalleKey) return null;
    const company = companies.find((c) => `${c.empresa}|${c.arl}` === selectedDetalleKey);
    if (!company) return null;

    const months = detailMetric === "comision" ? company.comisionMonths : company.cotizacionMonths;
    const total = detailMetric === "comision" ? company.comision : company.cotizacion;
    const metricLabel = detailMetric === "comision" ? "Comisión" : "Cotización";

    const activeMonths = months
      .map((value, index) => ({ value, index }))
      .filter((m) => m.value > 0);
    const activeCount = activeMonths.length;
    const avg = activeCount > 0 ? total / activeCount : 0;

    let peak: { value: number; index: number } | null = null;
    let valley: { value: number; index: number } | null = null;
    if (activeCount > 0) {
      const sorted = [...activeMonths].sort((a, b) => b.value - a.value);
      peak = sorted[0];
      valley = sorted[sorted.length - 1];
    }

    let firstMonth: { value: number; index: number } | null = null;
    let lastMonth: { value: number; index: number } | null = null;
    if (activeCount > 0) {
      firstMonth = activeMonths[0];
      lastMonth = activeMonths[activeMonths.length - 1];
    }
    const variationPct = firstMonth && lastMonth && firstMonth.value > 0 && firstMonth.index !== lastMonth.index
      ? ((lastMonth.value - firstMonth.value) / firstMonth.value) * 100
      : null;

    const sameArl = companies.filter((c) => c.arl === company.arl);
    const sameArlTotals = sameArl.map((c) => detailMetric === "comision" ? c.comision : c.cotizacion);
    const sameArlAvg = sameArlTotals.length > 0 ? sameArlTotals.reduce((a, b) => a + b, 0) / sameArlTotals.length : 0;
    const rank = sameArlTotals.filter((t) => t > total).length + 1;
    const diffPct = sameArlAvg > 0 ? ((total - sameArlAvg) / sameArlAvg) * 100 : 0;
    const arlTrendState: "up" | "down" | "flat" = diffPct > 2 ? "up" : diffPct < -2 ? "down" : "flat";

    const maxMonthValue = months.reduce((max, v) => Math.max(max, v), 0);

    return {
      company,
      metricLabel,
      months,
      total,
      avg,
      activeCount,
      peak,
      valley,
      variationPct,
      sameArlAvg,
      sameArlCount: sameArl.length,
      rank,
      diffPct,
      arlTrendState,
      maxMonthValue
    };
  }, [selectedDetalleKey, companies, detailMetric]);

  async function exportDetalleExcel() {
    const monthCols = MONTH_LABELS.map((m) => ({ wch: 14 }));
    await downloadExcelWorkbook(
      "Detalle_Empresas_CMYM.xlsx",
      [{
        name: "Detalle_ARL",
        headers: ["Empresa", "ARL", "NIT", ...MONTH_LABELS, "Total", "Promedio"],
        rows: companies.map((item) => {
          const months = detailMetric === "comision" ? item.comisionMonths : item.cotizacionMonths;
          const total = detailMetric === "comision" ? item.comision : item.cotizacion;
          const monthsWithData = months.filter((v) => v > 0).length;
          const avg = monthsWithData > 0 ? total / monthsWithData : 0;
          return [
            item.empresa, item.arl, item.nit,
            ...months.map((v) => Math.round(v)),
            Math.round(total),
            Math.round(avg)
          ];
        }),
        cols: [{ wch: 32 }, { wch: 18 }, { wch: 16 }, ...monthCols, { wch: 16 }, { wch: 16 }]
      }]
    );
  }

  async function exportPygExcel() {
    await downloadExcelWorkbook(
      "PyG_Rentabilidad_CMYM.xlsx",
      [{
        name: "P&G_Rentabilidad",
        headers: ["Empresa", "Comisi\u00f3n Bruta", "Retenci\u00f3n", "Retorno", "Ganancia Neta", "Margen"],
        rows: pygRows.map((item) => [
          item.empresa,
          Math.round(item.bruto),
          Math.round(item.retencion),
          Math.round(item.retorno),
          Math.round(item.neto),
          `${item.margen.toFixed(1)}%`
        ]),
        cols: [{ wch: 32 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 12 }]
      }]
    );
  }

  if (loading || loadError) {
    return (
      <LoadingState
        isLoading={loading}
        error={loading ? null : loadError}
        skeleton={moduleSkeleton}
        onRetry={() => setReloadKey((current) => current + 1)}
        errorMessage="No se pudieron cargar los datos ARL."
      >
        <></>
      </LoadingState>
    );
  }

  if (!data || !summary) {
    return null;
  }

  return (
    <div className="module-page-standard arl-page arl-legacy">
      <AssistantShell
        title="Control ARL"
        contextBuilder={(question) => {
          const yearMatches = Array.from((question ?? "").matchAll(/\b(20\d{2})\b/g));
          const askedYears = Array.from(new Set(yearMatches.map((m) => Number(m[1])))).filter((y) => years.includes(y));
          const askedYear = askedYears.length === 1 ? askedYears[0] : null;
          const isComparison = askedYears.length >= 2;

          if (isComparison) {
            const limitYears = askedYears.slice(0, 3);
            const perYear = limitYears.map((yr) => {
              const block: Record<string, unknown> = {
                anio: yr,
                resumen: getArlSummary(data, mode, yr),
                topEmpresas: aggregateArlCompanies(data, mode, yr).slice(0, 10).map((item) => ({
                  empresa: item.empresa,
                  arl: item.arl,
                  comision: item.comision,
                  cotizacion: item.cotizacion
                })),
                arl: aggregateArlByArlForYear(data, mode, yr),
                tendencia: aggregateArlMonthly(data, mode, yr).slice(-12)
              };
              if (tab === "detalle") {
                const cmps = aggregateArlCompaniesByMonth(data, detailMetric === "comision" ? mode : "BRUTO", yr);
                block.empresasDetalle = cmps.slice(0, 30).map((item) => ({
                  empresa: item.empresa,
                  arl: item.arl,
                  total: Math.round(item.comision / 1000),
                  meses: item.comisionMonths.map((v) => Math.round(v / 1000))
                }));
              }
              if (tab === "pyg") {
                const rowsForYear = data.detalle.filter((row) => resolveArlYear(row) === yr);
                const grouped = new Map<string, { empresa: string; bruto: number; neto: number; retencion: number; retorno: number }>();
                rowsForYear.forEach((row) => {
                  const current = grouped.get(row.EMPRESA) ?? { empresa: row.EMPRESA, bruto: 0, neto: 0, retencion: 0, retorno: 0 };
                  current.bruto += Number(row.COMISION || 0);
                  current.neto += Number(row.COMISION_NETA || 0);
                  current.retencion += Number(row.VALOR_RETENCION || 0);
                  current.retorno += Number(row.VALOR_RETORNO || 0);
                  grouped.set(row.EMPRESA, current);
                });
                block.pygEmpresas = Array.from(grouped.values())
                  .map((item) => ({ ...item, margen: item.bruto > 0 ? (item.neto / item.bruto) * 100 : 0 }))
                  .sort((a, b) => b.bruto - a.bruto)
                  .slice(0, 30)
                  .map((item) => ({
                    empresa: item.empresa,
                    bruto: Math.round(item.bruto / 1000),
                    neto: Math.round(item.neto / 1000),
                    retencion: Math.round(item.retencion / 1000),
                    retorno: Math.round(item.retorno / 1000),
                    margen: item.margen.toFixed(1) + "%"
                  }));
              }
              return block;
            });
            return JSON.stringify({
              tabActual: tab,
              aniosConsultados: limitYears,
              metrica: tab === "detalle" ? detailMetric : undefined,
              mesesOrden: MONTH_LABELS,
              nota: `Comparativo entre los anios ${limitYears.join(" y ")}. Valores monetarios en miles de COP (multiplica por 1000 al responder). Cada anio trae su propio bloque en 'comparativo'.`,
              comparativo: perYear
            });
          }

          const baseSummary = askedYear && askedYear !== year ? getArlSummary(data, mode, askedYear) : summary;
          const baseTopRaw = askedYear && askedYear !== year
            ? aggregateArlCompanies(data, mode, askedYear).slice(0, 8)
            : aggregateArlCompanies(data, mode, year)
                .filter((item) => topCompanies.slice(0, 8).some((company) => company.empresa === item.empresa))
                .slice(0, 8);
          const baseArl = askedYear && askedYear !== year ? aggregateArlByArlForYear(data, mode, askedYear) : arlBreakdown;
          const baseTrend = askedYear && askedYear !== year ? aggregateArlMonthly(data, mode, askedYear).slice(-12) : trend.slice(-12);

          const base = {
            tabActual: tab,
            anioConsultado: askedYear ?? null,
            resumen: baseSummary,
            topEmpresas: baseTopRaw.map((item) => ({
              empresa: item.empresa,
              arl: item.arl,
              nit: item.nit,
              comision: item.comision,
              cotizacion: item.cotizacion,
              retencion: item.retencion,
              retorno: item.retorno
            })),
            arl: baseArl,
            tendencia: baseTrend
          };

          if (tab === "detalle") {
            const currentDetailYear = detailYearFilter ? Number(detailYearFilter) : ("all" as const);
            const detailCompanies = askedYear && askedYear !== currentDetailYear
              ? aggregateArlCompaniesByMonth(data, detailMetric === "comision" ? mode : "BRUTO", askedYear)
              : companies;
            const effectiveDetailYear = askedYear ?? currentDetailYear;
            return JSON.stringify({
              ...base,
              filtroAnio: effectiveDetailYear === "all" ? "todos" : String(effectiveDetailYear),
              metrica: detailMetric,
              mesesOrden: MONTH_LABELS,
              nota: askedYear
                ? `Datos filtrados al anio ${askedYear} segun la pregunta. Valores en miles de COP.`
                : "Valores en miles de COP",
              empresasDetalle: detailCompanies.slice(0, 100).map((item) => ({
                empresa: item.empresa,
                arl: item.arl,
                total: Math.round(item.comision / 1000),
                meses: item.comisionMonths.map((v) => Math.round(v / 1000))
              }))
            });
          }

          if (tab === "pyg") {
            const currentPygYear = pygYearFilter ? Number(pygYearFilter) : ("all" as const);
            let pygRowsEffective = pygRows;
            if (askedYear && askedYear !== currentPygYear) {
              let rowsForYear = data.detalle.filter((row) => resolveArlYear(row) === askedYear);
              if (pygArlFilter) rowsForYear = rowsForYear.filter((row) => row.ARL === pygArlFilter);
              if (pygSearch) rowsForYear = rowsForYear.filter((row) => row.EMPRESA.toLowerCase().includes(pygSearch.toLowerCase()));
              const grouped = new Map<string, { empresa: string; bruto: number; neto: number; retencion: number; retorno: number }>();
              rowsForYear.forEach((row) => {
                const current = grouped.get(row.EMPRESA) ?? { empresa: row.EMPRESA, bruto: 0, neto: 0, retencion: 0, retorno: 0 };
                current.bruto += Number(row.COMISION || 0);
                current.neto += Number(row.COMISION_NETA || 0);
                current.retencion += Number(row.VALOR_RETENCION || 0);
                current.retorno += Number(row.VALOR_RETORNO || 0);
                grouped.set(row.EMPRESA, current);
              });
              pygRowsEffective = Array.from(grouped.values())
                .map((item) => ({ ...item, margen: item.bruto > 0 ? (item.neto / item.bruto) * 100 : 0 }))
                .sort((a, b) => b.bruto - a.bruto);
            }
            const effectivePygYear = askedYear ?? currentPygYear;
            return JSON.stringify({
              ...base,
              filtroAnio: effectivePygYear === "all" ? "todos" : String(effectivePygYear),
              nota: askedYear
                ? `Datos filtrados al anio ${askedYear} segun la pregunta. Valores en miles de COP.`
                : "Valores en miles de COP",
              pygEmpresas: pygRowsEffective.slice(0, 60).map((item) => ({
                empresa: item.empresa,
                bruto: Math.round(item.bruto / 1000),
                neto: Math.round(item.neto / 1000),
                retencion: Math.round(item.retencion / 1000),
                retorno: Math.round(item.retorno / 1000),
                margen: item.margen.toFixed(1) + "%"
              }))
            });
          }

          return JSON.stringify(base);
        }}
        systemInstruction={
          tab === "detalle"
            ? "Estas en la hoja DETALLE POR EMPRESA. Los valores monetarios estan en miles de COP (ejemplo: 26093 = $26.093.000). El campo meses es un array de 12 valores (ENE a DIC). El campo filtroAnio indica el anio seleccionado: si vale 'todos', los valores de meses son la suma acumulada de todos los anios y NO puedes distinguir un anio especifico; en ese caso, si el usuario pregunta por un anio puntual, indica amablemente que debe seleccionar ese anio en el filtro de la tabla para obtener el dato exacto. Si filtroAnio es un anio especifico, los valores corresponden a ese anio. Para calcular el promedio mensual de una empresa, suma los meses con valor mayor a 0 y divide entre la cantidad de esos meses. Al responder, multiplica por 1000 y formatea en pesos colombianos."
            : tab === "pyg"
              ? "Estas en la hoja P&G RENTABILIDAD. Los valores monetarios estan en miles de COP. Los datos muestran comision bruta, retenciones, retornos y ganancia neta por empresa. Al responder, multiplica por 1000 y formatea en pesos colombianos."
              : undefined
        }
        executiveReportTitle="REPORTE EJECUTIVO - IA"
        executiveReportPrompt={() =>
          `Actua como analista financiero senior. Redacta un resumen ejecutivo formal y analitico de 3 parrafos basandote EXACTAMENTE en estos datos del tablero demo:
- Vista actual: ${mode}
 - Periodo analizado: ${year === "all" ? "Todos los años" : year}
- Total Comisiones ingresadas: ${formatArlKpi(summary.totalComision, year)}
- Total Cotización ARL (Base): ${formatArlKpi(summary.totalCotizacion, year)}
- Cantidad de Empresas Activas: ${formatNumber(summary.totalEmpresas)}
- Top 3 Empresas por ingreso: ${topCompanies.slice(0, 3).map((item) => item.empresa).join(", ") || "Sin datos"}

Instrucciones:
1. Parrafo 1: panorama global, ingresos y base de cotización.
2. Parrafo 2: empresas clave que sostienen el ingreso.
3. Parrafo 3: conclusion financiera breve para comite directivo.
No saludes y no hables con el usuario. Entrega solo el texto final del informe.`
        }
      />

      <ModuleHeader titulo="ANALITICA ARL" subtitulo="// COMISIONES DEMO - RECAUDO - COTIZACION" cutoffLabel={data?.cutoff_label ?? null} />

      <div className="tab-nav arl-main-tabs">
        {([
          ["resumen", "RESUMEN", <PieChart key="i1" size={15} />],
          ["detalle", "DETALLE POR EMPRESA", <ClipboardList key="i2" size={15} />],
          ["pyg", "P&G RENTABILIDAD", <TrendingUp key="i3" size={15} />],
          ["arl", "DETALLE POR ASEGURADORA", <Building2 key="i4" size={15} />]
        ] as const).map(([key, label, icon]) => (
          <button key={key} onClick={() => setTab(key)} className={`tab-btn ${tab === key ? "active" : ""}`}>
            {icon} {label}
          </button>
        ))}
      </div>

      {tab === "resumen" ? (
        <>
          <div className="module-filter-inline arl-summary-filter-bar" style={{ flexWrap: "wrap" }}>
            <YearFilter years={years} value={year} onChange={setYear} />
            <div className="toggle-group filter-bar__mode">
              {(["BRUTO", "NETO"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} className={`toggle-btn ${mode === m ? "active" : ""}`}>
                  {m === "BRUTO" ? "VISTA BRUTA" : "VISTA NETA"}
                </button>
              ))}
            </div>
          </div>

          <div className="kpi-grid arl-summary-kpis">
            <div className="kpi-card fade-in">
              <div className="kpi-icon" style={{ color: "var(--module-accent)" }}><Coins size={20} /></div>
              <div className="kpi-label">Total Comisiones</div>
              <div className="kpi-value">{formatArlKpi(summary.totalComision, year)}</div>
              <div className="kpi-sub">{"COP - "}{year === "all" ? "todos los a\u00f1os" : year}</div>
            </div>
            <div className="kpi-card green fade-in">
              <div className="kpi-icon" style={{ color: "#10b981" }}><FileText size={20} /></div>
              <div className="kpi-label">{"Total Cotizaci\u00f3n ARL"}</div>
              <div className="kpi-value">{formatArlKpi(summary.totalCotizacion, year)}</div>
              <div className="kpi-sub">{"COP - base de c\u00e1lculo"}</div>
            </div>
            <div className="kpi-card amber fade-in">
              <div className="kpi-icon" style={{ color: "#f59e0b" }}><Building2 size={20} /></div>
              <div className="kpi-label">Empresas Activas</div>
              <div className="kpi-value">{formatNumber(summary.totalEmpresas)}</div>
              <div className="kpi-sub">{"clientes \u00fanicos"}</div>
            </div>
            <div className="kpi-card purple fade-in">
              <div className="kpi-icon" style={{ color: "#8b5cf6" }}><Files size={20} /></div>
              <div className="kpi-label">Registros Totales</div>
              <div className="kpi-value">{formatArlCompactNumber(totalRecordsVisible)}</div>
              <div className="kpi-sub">facturas procesadas</div>
            </div>
          </div>

          <div className="charts-row three-one" style={{ marginTop: "-8px", marginBottom: "16px" }}>
            <div className="chart-card fade-in">
              <div className="chart-header">
                <span className="chart-title">{"COMISIONES POR A\u00d1O"}</span>
                <span className="chart-tag">COP - millones</span>
              </div>
              <div className="h-[220px]">
                <Bar
                  data={{
                    labels: years.map(String),
                    datasets: [
                      {
                        label: "Comisi\u00f3n",
                        data: years.map((y) => Number((mode === "NETO" ? data.por_anio_neta : data.por_anio)[String(y)] || 0)),
                        backgroundColor: years.map((y) => year === "all" ? YEAR_BAR_BASE : y === year ? YEAR_BAR_ACTIVE : YEAR_BAR_MUTED),
                        borderColor: "transparent",
                        borderWidth: 0,
                        borderRadius: 4
                      }
                    ]
                  }}
                  options={{
                    ...createArlChartOptions(),
                    plugins: {
                      ...createArlChartOptions().plugins,
                      tooltip: {
                        ...createArlChartOptions().plugins?.tooltip,
                        callbacks: { label: (context: any) => ` ${formatArlCompactCurrency(Number(context.raw || 0))}` }
                      }
                    }
                  } as any}
                />
              </div>
            </div>

            <div className="chart-card fade-in">
              <div className="chart-header">
                <span className="chart-title">{"DISTRIBUCI\u00d3N ARL"}</span>
                <span className="chart-tag">{"por comisi\u00f3n"}</span>
              </div>
              <div className="h-[180px]">
                <Doughnut
                  data={{
                    labels: arlBreakdown.map((item) => item.label),
                    datasets: [
                      {
                        data: arlBreakdown.map((item) => item.value),
                        backgroundColor: arlBreakdown.map((item) => `${ARL_COLORS[item.label] ?? "#64748b"}cc`),
                        borderColor: arlBreakdown.map((item) => ARL_COLORS[item.label] ?? "#64748b"),
                        borderWidth: 2
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "68%",
                    plugins: {
                      legend: { display: false },
                      tooltip: {
                        backgroundColor: CHART_TOOLTIP_BG,
                        borderColor: CHART_TOOLTIP_BORDER,
                        borderWidth: 1,
                        titleColor: CHART_TOOLTIP_TITLE,
                        bodyColor: CHART_TOOLTIP_BODY,
                        titleFont: { family: "Space Mono", size: 11 },
                        bodyFont: { family: "DM Sans", size: 13, weight: "bold" },
                        padding: 10,
                        callbacks: {
                          label: (context: any) => ` ${context.label}: ${formatArlCompactCurrency(Number(context.raw || 0))}`
                        }
                      }
                    }
                  } as any}
                />
              </div>
              <div className="arl-legend-grid">
                {arlBreakdown.map((item) => {
                  const total = arlBreakdown.reduce((sum, row) => sum + row.value, 0);
                  const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={item.label} className="arl-legend-item">
                      <span className="arl-legend-item__dot" style={{ backgroundColor: ARL_COLORS[item.label] ?? "#64748b" }} />
                      <span>{item.label}</span>
                      <span className="arl-legend-item__pct">{pct}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="charts-row one-three" style={{ marginBottom: "16px" }}>
            <div className="chart-card fade-in">
              <div className="chart-header">
                <span className="chart-title">TENDENCIA MENSUAL</span>
                <span className="chart-tag">{"comisi\u00f3n vs cotizaci\u00f3n"}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
              <div className="h-[240px]" style={{ minWidth: "500px" }}>
                <Line
                  data={{
                    labels: trend.map((item) => item.label),
                    datasets: [
                      { label: "Comisi\u00f3n", data: trend.map((item) => item.comision), borderColor: LINE_COMISION, backgroundColor: (context) => buildAreaGradient(context, "0,119,200"), pointBackgroundColor: LINE_COMISION, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, fill: true, tension: 0.4 },
                      { label: "Cotizaci\u00f3n", data: trend.map((item) => item.cotizacion), borderColor: LINE_COTIZACION, backgroundColor: (context) => buildAreaGradient(context, "204,0,0"), pointBackgroundColor: LINE_COTIZACION, pointRadius: 4, pointHoverRadius: 6, borderWidth: 2, fill: true, tension: 0.4, yAxisID: "y2" }
                    ]
                  }}
                  options={{
                    ...createArlChartOptions({ legend: true, tooltipMode: "index", rightAxis: true }),
                    plugins: {
                      ...createArlChartOptions({ legend: true, tooltipMode: "index", rightAxis: true }).plugins,
                      tooltip: {
                        ...createArlChartOptions({ legend: true, tooltipMode: "index", rightAxis: true }).plugins?.tooltip,
                        callbacks: {
                          label: (context: any) => ` ${context.dataset.label}: ${formatChartMoney(Number(context.raw || 0))}`
                        }
                      }
                    }
                  } as any}
                />
              </div>
              </div>
            </div>

            <div className="chart-card fade-in">
              <div className="chart-header">
                <span className="chart-title">TOP 10 EMPRESAS</span>
                <span className="chart-tag">{"por comisi\u00f3n acumulada"}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
              <div className="module-table-wrap">
                <table className="arl-top-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Empresa</th>
                      <th>{"Comisi\u00f3n"}</th>
                      <th>{"Participaci\u00f3n"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCompanies.map((item, index) => {
                      const total = summary.totalComision;
                      const pct = total > 0 ? ((item.valor / total) * 100).toFixed(1) : "0.0";
                      const maxValue = topCompanies[0]?.valor || 1;
                      const barWidth = Math.round((item.valor / maxValue) * 80);
                      const rankClass = index === 0 ? "rank-1" : index === 1 ? "rank-2" : index === 2 ? "rank-3" : "rank-other";
                      return (
                        <tr key={item.empresa}>
                          <td><span className={`arl-rank-badge ${rankClass}`}>{index + 1}</span></td>
                          <td><span className="arl-top-table__empresa">{item.empresa}</span></td>
                          <td><span className="arl-top-table__money">{formatCompactCurrency(item.valor)}</span></td>
                          <td>
                        <span className="arl-top-table__pct">{pct}%</span>
                        <span className="arl-top-table__bar" style={{ width: `${barWidth}px`, background: CITY_BAR_GRADIENT }} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </div>
          </div>

          <div className="charts-row two-col">
            <div className="chart-card fade-in">
              <div className="chart-header">
                <span className="chart-title">{"COMISIONES POR ARL - A\u00d1O"}</span>
                <span className="chart-tag">barras apiladas</span>
              </div>
              <div className="h-[240px]">
                <Bar
                  data={{
                    labels: arlStacked.years.map(String),
                    datasets: arlStacked.arls.map((arl, index) => ({
                      label: arl,
                      data: arlStacked.series[index],
                      backgroundColor: ARL_COLORS[arl] ?? "#64748b",
                      borderColor: ARL_COLORS[arl] ?? "#64748b",
                      borderWidth: 1,
                      borderRadius: 2
                    }))
                  }}
                  options={{
                    ...createArlChartOptions({ legend: true, tooltipMode: "index", stacked: true }),
                    plugins: {
                      ...createArlChartOptions({ legend: true, tooltipMode: "index", stacked: true }).plugins,
                      tooltip: {
                        ...createArlChartOptions({ legend: true, tooltipMode: "index", stacked: true }).plugins?.tooltip,
                        callbacks: {
                          label: (context: any) => ` ${context.dataset.label}: ${formatArlCompactCurrency(Number(context.raw || 0))}`
                        }
                      }
                    }
                  } as any}
                />
              </div>
            </div>

            <div className="chart-card fade-in">
              <div className="chart-header">
                <span className="chart-title">COMISIONES POR CIUDAD</span>
                <span className="chart-tag">COP - millones</span>
              </div>
              <div className="arl-city-bars">
                {cityBreakdown.map((item) => {
                  const max = cityBreakdown[0]?.value || 1;
                  const width = `${(item.value / max) * 100}%`;
                  return (
                    <div key={item.city} className="arl-city-row">
                      <div className="arl-city-row__name">{item.city}</div>
                      <div className="arl-city-row__track">
                        <div className="arl-city-row__fill" style={{ width, background: CITY_BAR_GRADIENT }} />
                      </div>
                      <div className="arl-city-row__value">{formatCompactCurrency(item.value)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="footer fade-in">
            <span>FUENTE: dataset demo ARL</span>
            <span>{formatArlCompactNumber(totalRecordsVisible)} REGISTROS - {formatNumber(totalArlsVisible)} ARLs - {formatNumber(totalCitiesVisible)} CIUDADES</span>
          </div>

          <div className="chart-card fade-in" style={{ marginTop: "16px" }}>
            <div className="chart-header">
              <span className="chart-title">RESUMEN POR ASEGURADORA</span>
              <span className="chart-tag">{year === "all" ? "todos los per\u00edodos" : `a\u00f1o ${year}`}</span>
            </div>
            <DualScrollTable topId="arlResumenScroll">
              <table className="detalle-table" style={{ minWidth: 600 }}>
                <thead>
                  <tr>
                    <th>Aseguradora</th>
                    {insurerSummary.months.map((month) => <th key={month}>{MONTH_LABELS[MONTH_ORDER.indexOf(month)]}</th>)}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {insurerSummary.rows.map((row) => (
                    <tr key={row.arl}>
                      <td className="font-medium">
                        <span className="inline-block h-2 w-2 rounded-full mr-2" style={{ backgroundColor: ARL_COLORS[row.arl] ?? "#64748b" }} />
                        {row.arl}
                      </td>
                      {row.months.map((value, index) => (
                        <td key={`${row.arl}-${index}`} className="font-mono text-[0.72rem]">{value > 0 ? formatCompactCurrency(value) : "-"}</td>
                      ))}
                      <td className="font-mono text-[0.72rem] text-[var(--module-accent)]">{formatCompactCurrency(row.total)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[rgba(229,31,47,0.04)]">
                    <td className="font-semibold text-[var(--module-accent)]">TOTAL GENERAL</td>
                    {insurerSummary.totals.map((value, index) => (
                      <td key={`total-${index}`} className="font-mono text-[0.72rem] text-[var(--module-accent)]">{formatCompactCurrency(value)}</td>
                    ))}
                    <td className="font-mono text-[0.72rem] text-[var(--module-accent)]">{formatCompactCurrency(insurerSummary.grandTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </DualScrollTable>
          </div>
        </>
      ) : null}

      {tab === "detalle" ? (
        <div className="tab-page active">
          <div className="detalle-controls">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresa..." className="search-box" />
            <select value={arlFilter} onChange={(e) => setArlFilter(e.target.value)} className="select-box">
              <option value="">Todas las ARL</option>
              {arls.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={detailYearFilter} onChange={(e) => setDetailYearFilter(e.target.value)} className="select-box">
              <option value="">{"Todos los a\u00f1os"}</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div className="toggle-group">
              <button onClick={() => setDetailMetric("comision")} className={`toggle-btn ${detailMetric === "comision" ? "active" : ""}`}>COMISION</button>
              <button onClick={() => setDetailMetric("cotizacion")} className={`toggle-btn ${detailMetric === "cotizacion" ? "active" : ""}`}>{"COTIZACIÓN"}</button>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
              <button type="button" className="filter-btn filter-btn--excel" onClick={exportDetalleExcel}><FileSpreadsheet size={14} />Excel</button>
            </div>
          </div>
          <div className="detalle-info">{companies.length} empresas{companies.length > 200 ? " (mostrando primeras 200)" : ""} - {detailMetric === "comision" ? "Comisión" : "Cotización"}{detailYearFilter ? ` · ${detailYearFilter}` : " · todos los años"}</div>
          <DualScrollTable topId="detalleEmpresaScroll">
            <table className="detalle-table" style={{ minWidth: 900 }}>
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>ARL</th>
                  <th>NIT</th>
                  {MONTH_LABELS.map((m) => <th key={m}>{m}</th>)}
                  <th>Total</th>
                  <th>Promedio</th>
                </tr>
              </thead>
              <tbody>
                {companies.length === 0 ? (
                  <tr><td colSpan={16} className="text-center">No se encontraron resultados</td></tr>
                ) : companies.slice(0, 200).map((item) => {
                  const months = detailMetric === "comision" ? item.comisionMonths : item.cotizacionMonths;
                  const total = detailMetric === "comision" ? item.comision : item.cotizacion;
                  const monthsWithData = months.filter((v) => v > 0).length;
                  const avg = monthsWithData > 0 ? total / monthsWithData : 0;
                  return (
                    <tr key={`${item.empresa}-${item.arl}`} className="pyg-row-clickable" onClick={() => setSelectedDetalleKey(`${item.empresa}|${item.arl}`)}>
                      <td className="font-medium">{item.empresa}</td>
                      <td>{item.arl}</td>
                      <td className="font-mono text-[0.72rem]">{item.nit}</td>
                      {months.map((v, i) => (
                        <td key={i} className="font-mono text-[0.72rem]">{v > 0 ? formatCurrency(v) : "-"}</td>
                      ))}
                      <td className="font-mono text-[0.72rem] text-[var(--module-accent)]">{formatCurrency(total)}</td>
                      <td className="font-mono text-[0.72rem]">{monthsWithData > 0 ? formatCurrency(avg) : "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </DualScrollTable>
        </div>
      ) : null}

      {tab === "pyg" ? (
        <div className="tab-page active">
          <div className="detalle-controls">
            <input value={pygSearch} onChange={(e) => setPygSearch(e.target.value)} placeholder="Buscar empresa..." className="search-box" />
            <select value={pygArlFilter} onChange={(e) => setPygArlFilter(e.target.value)} className="select-box">
              <option value="">Todas las ARL</option>
              {arls.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={pygYearFilter} onChange={(e) => setPygYearFilter(e.target.value)} className="select-box">
              <option value="">{"Todos los a\u00f1os"}</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
              <button type="button" className="filter-btn filter-btn--excel" onClick={exportPygExcel}><FileSpreadsheet size={14} />Excel</button>
            </div>
          </div>
          <div className="detalle-info">Mostrando deducciones y ganancia real para {pygRows.length} empresas.</div>
          <div className="module-table-wrap">
            <table className="detalle-table">
              <thead>
                <tr>
                  <th>Empresa</th>
                  <th>{"Comisi\u00f3n Bruta"}</th>
                  <th>{"- Retenci\u00f3n"}</th>
                  <th>- Retorno</th>
                  <th>Ganancia Neta</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {pygRows.length === 0 ? (
                  <tr><td colSpan={6} className="text-center">No se encontraron registros.</td></tr>
                ) : pygRows.map((item) => (
                  <tr key={item.empresa} className="pyg-row-clickable" onClick={() => setSelectedPygCompany(item.empresa)}>
                    <td className="font-medium">{item.empresa}</td>
                    <td className="font-mono text-[0.72rem]">{formatCurrency(item.bruto)}</td>
                    <td className="font-mono text-[0.72rem] text-amber-600">- {formatCurrency(item.retencion)}</td>
                    <td className="font-mono text-[0.72rem] text-rose-600">- {formatCurrency(item.retorno)}</td>
                    <td className="font-mono text-[0.72rem] text-[var(--module-accent)]">{formatCurrency(item.neto)}</td>
                    <td className="font-mono text-[0.72rem]">{item.margen.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {detalleSnapshot ? (
        <div className="pyg-modal-overlay" onClick={() => setSelectedDetalleKey(null)}>
          <div className="pyg-modal-panel" role="dialog" aria-modal="true" aria-labelledby="detalleModalTitle" onClick={(event) => event.stopPropagation()}>
            <div className="pyg-modal-header">
              <div>
                <div className="pyg-modal-kicker">{`Ficha de ${detalleSnapshot.metricLabel} · Detalle por Empresa`}</div>
                <h3 className="pyg-modal-title" id="detalleModalTitle">{detalleSnapshot.company.empresa}</h3>
                <div className="pyg-modal-subtitle">
                  NIT: {detalleSnapshot.company.nit} {"·"} {detalleSnapshot.company.arl} {"·"} {detailYearFilter || "todos los años"}
                </div>
              </div>
              <button className="pyg-modal-close" type="button" aria-label="Cerrar panel" onClick={() => setSelectedDetalleKey(null)}>
                &times;
              </button>
            </div>

            <div className="pyg-modal-body">
              <div className="pyg-modal-grid">
                <div className="pyg-modal-stat" data-kind="arl">
                  <span className="pyg-modal-stat-label">ARL</span>
                  <span className="pyg-modal-stat-value">{detalleSnapshot.company.arl}</span>
                </div>

                <div className="pyg-modal-stat" data-kind="bruto">
                  <span className="pyg-modal-stat-label">{`Total ${detalleSnapshot.metricLabel}`}</span>
                  <span className="pyg-modal-stat-value money">{formatCurrency(detalleSnapshot.total)}</span>
                </div>

                <div className="pyg-modal-stat" data-kind="neto">
                  <span className="pyg-modal-stat-label">Promedio Mensual</span>
                  <span className="pyg-modal-stat-value money">{formatCurrency(detalleSnapshot.avg)}</span>
                  <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)" }}>
                    {detalleSnapshot.activeCount} de 12 meses con actividad
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="margen">
                  <span className="pyg-modal-stat-label">Variación primer → último mes</span>
                  <span className="pyg-modal-stat-value">
                    {detalleSnapshot.variationPct === null ? "Sin dato" : `${detalleSnapshot.variationPct >= 0 ? "+" : ""}${detalleSnapshot.variationPct.toFixed(1)}%`}
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="retorno">
                  <span className="pyg-modal-stat-label">Mes Más Alto</span>
                  <span className="pyg-modal-stat-value money">
                    {detalleSnapshot.peak ? formatCurrency(detalleSnapshot.peak.value) : "-"}
                    {detalleSnapshot.peak ? (
                      <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)", marginLeft: 6 }}>
                        ({MONTH_LABELS[detalleSnapshot.peak.index]})
                      </span>
                    ) : null}
                  </span>
                </div>

                <div className="pyg-modal-stat" data-kind="retencion">
                  <span className="pyg-modal-stat-label">Mes Más Bajo</span>
                  <span className="pyg-modal-stat-value money">
                    {detalleSnapshot.valley ? formatCurrency(detalleSnapshot.valley.value) : "-"}
                    {detalleSnapshot.valley ? (
                      <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)", marginLeft: 6 }}>
                        ({MONTH_LABELS[detalleSnapshot.valley.index]})
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--module-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {`Distribución mensual · ${detalleSnapshot.metricLabel}`}
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 60, padding: "8px 4px", background: "var(--module-surface-soft, rgba(0,0,0,0.03))", borderRadius: 6 }}>
                  {detalleSnapshot.months.map((value, index) => {
                    const heightPct = detalleSnapshot.maxMonthValue > 0 ? (value / detalleSnapshot.maxMonthValue) * 100 : 0;
                    const isPeak = detalleSnapshot.peak?.index === index;
                    return (
                      <div key={index} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, height: "100%" }}>
                        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                          <div
                            title={`${MONTH_LABELS[index]}: ${value > 0 ? formatCurrency(value) : "Sin dato"}`}
                            style={{
                              width: "100%",
                              height: `${heightPct}%`,
                              minHeight: value > 0 ? 2 : 0,
                              background: isPeak ? "#0077c8" : value > 0 ? "rgba(0,119,200,0.4)" : "transparent",
                              borderRadius: "2px 2px 0 0",
                              transition: "background 0.15s"
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "0.6rem", color: "var(--module-muted)" }}>{MONTH_LABELS[index].slice(0, 3)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className={`pyg-trend-${detalleSnapshot.arlTrendState}`}>
                <div className="pyg-modal-trend">
                  <div className="pyg-modal-trend-icon">
                    {detalleSnapshot.arlTrendState === "up" ? "↑" : detalleSnapshot.arlTrendState === "down" ? "↓" : "→"}
                  </div>
                  <div className="pyg-modal-trend-copy">
                    <span className="pyg-modal-trend-label">{`Posición en ${detalleSnapshot.company.arl}`}</span>
                    <span className="pyg-modal-trend-value">
                      {`#${detalleSnapshot.rank} de ${detalleSnapshot.sameArlCount} empresas`}
                    </span>
                    <span className="pyg-modal-trend-sub">
                      {`${detalleSnapshot.diffPct >= 0 ? "+" : ""}${detalleSnapshot.diffPct.toFixed(1)}% vs promedio del ARL (${formatCurrency(detalleSnapshot.sameArlAvg)})`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {pygSnapshot ? (
        <div className="pyg-modal-overlay" onClick={() => setSelectedPygCompany(null)}>
          <div className="pyg-modal-panel" role="dialog" aria-modal="true" aria-labelledby="pygModalTitle" onClick={(event) => event.stopPropagation()}>

            {/* Cabecera */}
            <div className="pyg-modal-header">
              <div>
                <div className="pyg-modal-kicker">{"Ficha de Rentabilidad \u00b7 P&G"}</div>
                <h3 className="pyg-modal-title" id="pygModalTitle">{pygSnapshot.empresa}</h3>
                {pygSnapshot.nit ? <div className="pyg-modal-subtitle">NIT: {pygSnapshot.nit}</div> : null}
              </div>
              <button className="pyg-modal-close" type="button" aria-label="Cerrar panel" onClick={() => setSelectedPygCompany(null)}>
                &times;
              </button>
            </div>

            {/* Cuerpo */}
            <div className="pyg-modal-body">
              <div className="pyg-modal-grid">

                {/* ARL Principal */}
                <div className="pyg-modal-stat" data-kind="arl">
                  <span className="pyg-modal-stat-label">ARL Principal</span>
                  <span className="pyg-modal-stat-value">{pygSnapshot.principalArl || "Sin dato"}</span>
                </div>

                {/* Comisión bruta */}
                <div className="pyg-modal-stat" data-kind="bruto">
                  <span className="pyg-modal-stat-label">{"Comisi\u00f3n Bruta Total"}</span>
                  <span className="pyg-modal-stat-value money">{formatCurrency(pygSnapshot.bruto)}</span>
                </div>

                {/* Retención */}
                <div className="pyg-modal-stat" data-kind="retencion">
                  <span className="pyg-modal-stat-label">{"Retenci\u00f3n"}</span>
                  <span className="pyg-modal-stat-value money">
                    {formatCurrency(pygSnapshot.retencion)}
                    <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)", marginLeft: 6 }}>
                      ({pygSnapshot.retentionPct.toFixed(1)}%)
                    </span>
                  </span>
                </div>

                {/* Retorno */}
                <div className="pyg-modal-stat" data-kind="retorno">
                  <span className="pyg-modal-stat-label">Retorno</span>
                  <span className="pyg-modal-stat-value money">
                    {formatCurrency(pygSnapshot.retorno)}
                    <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)", marginLeft: 6 }}>
                      ({pygSnapshot.retornoPct.toFixed(1)}%)
                    </span>
                  </span>
                </div>

                {/* Ganancia neta */}
                <div className="pyg-modal-stat" data-kind="neto">
                  <span className="pyg-modal-stat-label">Ganancia Neta</span>
                  <span className="pyg-modal-stat-value money">{formatCurrency(pygSnapshot.neto)}</span>
                </div>

                {/* Margen con barra visual */}
                <div className="pyg-modal-stat" data-kind="margen">
                  <span className="pyg-modal-stat-label">Margen Neto</span>
                  <span className="pyg-modal-stat-value">{pygSnapshot.margen.toFixed(1)}%</span>
                  <div className="pyg-modal-margin-bar">
                    <div
                      className="pyg-modal-margin-bar-fill"
                      style={{ width: `${Math.min(Math.max(pygSnapshot.margen, 0), 100)}%` }}
                    />
                  </div>
                </div>

              </div>

              {/* Bloque de tendencia */}
              <div className={`pyg-trend-${pygSnapshot.trendState}`}>
                <div className="pyg-modal-trend">
                  <div className="pyg-modal-trend-icon">
                    {pygSnapshot.trendState === "up" ? "\u2191" : pygSnapshot.trendState === "down" ? "\u2193" : "\u2192"}
                  </div>
                  <div className="pyg-modal-trend-copy">
                    <span className="pyg-modal-trend-label">{"Tendencia vs a\u00f1o anterior"}</span>
                    <span className="pyg-modal-trend-value">{pygSnapshot.trendText}</span>
                    <span className="pyg-modal-trend-sub">{pygSnapshot.trendSub}</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      ) : null}

      {tab === "arl" ? (
        <div className="tab-page active">
          <div className="detalle-controls">
            <select value={arlYearFilter} onChange={(e) => setArlYearFilter(e.target.value)} className="select-box">
              <option value="">{"Todos los a\u00f1os"}</option>
              {years.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={arlMonthFilter} onChange={(e) => setArlMonthFilter(e.target.value)} className="select-box">
              <option value="">Todos los meses</option>
              {DETAIL_MONTH_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <div className="toggle-group">
              <button onClick={() => setArlMetric("comision")} className={`toggle-btn ${arlMetric === "comision" ? "active" : ""}`}>COMISION</button>
              <button onClick={() => setArlMetric("cotizacion")} className={`toggle-btn ${arlMetric === "cotizacion" ? "active" : ""}`}>{"COTIZACIÓN"}</button>
            </div>
          </div>
          <div className="detalle-info">{arlDetailData.rows.length} aseguradoras - {arlMetric === "comision" ? "Comisi\u00f3n" : "Cotizaci\u00f3n"}</div>
          <div className="module-table-wrap">
            <table className="detalle-table">
              <thead>
                <tr>
                  <th>Aseguradora</th>
                  {arlDetailData.monthKeys.map((item) => (
                    <th key={item}>{MONTH_LABELS[MONTH_ORDER.indexOf(item)]}</th>
                  ))}
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {arlDetailData.rows.length === 0 ? (
                  <tr><td colSpan={14} className="text-center">No hay datos</td></tr>
                ) : arlDetailData.rows.map((row) => (
                  <tr key={row.label}>
                    <td className="font-medium">{row.label}</td>
                    {row.months.map((value, index) => (
                        <td key={`${row.label}-${index}`} className="font-mono text-[0.72rem]">{value > 0 ? formatCurrency(value) : "-"}</td>
                    ))}
                    <td className="font-mono text-[0.72rem] text-[var(--module-accent)]">{formatCurrency(row.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}


