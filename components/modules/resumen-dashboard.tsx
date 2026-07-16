"use client";

import "@/lib/modules/charts";

import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  CheckCircle,
  Clock,
  Minus,
  Star,
  TrendingDown,
  TrendingUp,
  UserPlus,
  UserX,
  Users,
  Calendar,
  ChevronDown
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Line } from "react-chartjs-2";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { CompanyBadge } from "@/components/ui/company-badge";
import { InlineTooltip, KpiCardSkeleton, LoadingState, Skeleton } from "@/components/ui";
import { COMPANY_THEME } from "@/lib/company-theme";
import { formatCurrency, formatNumber } from "@/lib/modules/format";

type PeriodKey = "current-month" | "rolling-3m" | "year-to-date" | string;
type TrendDirection = "up" | "down" | "flat";
type EmpresaCode = "CMYM" | "SYSO" | "SANUM";
type AlertSeverity = "critica" | "advertencia" | "informativa" | "positiva";
type AlertIcon = "AlertOctagon" | "TrendingUp" | "AlertCircle" | "TrendingDown" | "Users" | "Star" | "AlertTriangle" | "UserX" | "UserPlus" | "Clock";

type KpiResponse = {
  value: number | null;
  previous_value: number | null;
  change_pct: number | null;
  valor_actual: number | null;
  valor_anterior: number | null;
  variacion_absoluta: number | null;
  variacion_porcentual: number | null;
  base_baja: boolean;
  direction: TrendDirection;
  favorable: boolean | null;
  error: string | null;
};

type ComparisonPeriod = {
  label: string;
};

type EmpresaBreakdownValue = KpiResponse & {
  participacion: number | null;
  sparkline: Array<{ mes: string; valor: number }>;
};

type ResumenKpiPayload = {
  period: PeriodKey;
  cutoff: string;
  cutoff_label: string | null;
  comparison_period: ComparisonPeriod;
  kpis: {
    facturacion_total: KpiResponse;
    recaudo_total: KpiResponse;
    cartera_vencida: KpiResponse & { ratio_over_facturacion: number | null };
    clientes_activos: KpiResponse;
  };
  por_empresa: Record<EmpresaCode, EmpresaBreakdownValue>;
  por_empresa_recaudo?: Record<EmpresaCode, EmpresaBreakdownValue>;
  por_empresa_cartera?: Record<EmpresaCode, EmpresaBreakdownValue>;
};

type ResumenAlertItem = {
  id: string;
  tipo: string;
  severidad: AlertSeverity;
  icono: AlertIcon;
  titulo: string;
  descripcion: string;
  monto: number | null;
  magnitud: number;
};

type ResumenAlertPayload = {
  period: PeriodKey;
  cutoff: string;
  alerts: ResumenAlertItem[];
  all_clear: boolean;
};
type EmpresaCard = {
  empresa: EmpresaCode;
  accent: string;
  solidRgb: string;
};

type ForecastResult = {
  projected: number;
  daysElapsed: number;
  totalDays: number;
  dailyRate: number;
  stable: boolean;
};

function getBogotaToday(): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const year = Number(get("year"));
  const month = Number(get("month"));
  const day = Number(get("day"));
  return new Date(Date.UTC(year, month - 1, day));
}

function computeForecast(currentValue: number | null | undefined, period: string, today: Date): ForecastResult | null {
  if (currentValue === null || currentValue === undefined || currentValue <= 0) return null;

  let startDate: Date | null = null;
  let endDate: Date | null = null;

  if (period === "current-month") {
    startDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    endDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  } else if (period === "year-to-date") {
    startDate = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));
    endDate = new Date(Date.UTC(today.getUTCFullYear(), 11, 31));
  } else if (/^range:\d{4}-\d{2}:\d{4}-\d{2}$/.test(period)) {
    const match = period.match(/^range:(\d{4})-(\d{2}):(\d{4})-(\d{2})$/);
    if (!match) return null;
    const [, sy, sm, ey, em] = match.map(Number);
    startDate = new Date(Date.UTC(sy, sm - 1, 1));
    endDate = new Date(Date.UTC(ey, em, 0));
  } else if (/^\d{4}-\d{2}$/.test(period)) {
    const [y, m] = period.split("-").map(Number);
    startDate = new Date(Date.UTC(y, m - 1, 1));
    endDate = new Date(Date.UTC(y, m, 0));
  } else {
    return null;
  }

  if (!startDate || !endDate) return null;
  if (today.getTime() < startDate.getTime() || today.getTime() > endDate.getTime()) return null;

  const totalDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  const daysElapsed = Math.floor((today.getTime() - startDate.getTime()) / 86400000) + 1;

  if (daysElapsed >= totalDays) return null;
  if (daysElapsed < 1) return null;

  const dailyRate = currentValue / daysElapsed;
  const projected = dailyRate * totalDays;
  const stable = daysElapsed >= 3;

  return { projected, daysElapsed, totalDays, dailyRate, stable };
}

function formatPeriodLabel(periodo: string): string {
  if (periodo === "current-month") return "Mes en curso";
  if (periodo === "rolling-3m") return "Últimos 3 meses";
  if (periodo === "year-to-date") return "Año en curso";

  const MONTHS = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  if (/^\d{4}-\d{2}$/.test(periodo)) {
    const [y, m] = periodo.split("-");
    const monthName = MONTHS[Number(m) - 1] ?? m;
    return `${monthName} ${y}`;
  } 
  
  if (/^range:\d{4}-\d{2}:\d{4}-\d{2}$/.test(periodo)) {
    const [, startStr, endStr] = periodo.match(/^range:(\d{4}-\d{2}):(\d{4}-\d{2})$/) || [];
    const [sy, sm] = startStr.split("-");
    const [ey, em] = endStr.split("-");
    const sMonthName = MONTHS[Number(sm) - 1] ?? sm;
    const eMonthName = MONTHS[Number(em) - 1] ?? em;
    if (sy === ey) {
      if (sm === em) return `${sMonthName} ${sy}`;
      return `${sMonthName} a ${eMonthName} ${sy}`;
    }
    return `${sMonthName} ${sy} a ${eMonthName} ${ey}`;
  }
  
  return periodo;
}

const EMPRESA_ITEMS: EmpresaCard[] = [
  { empresa: "CMYM", accent: COMPANY_THEME.CMYM.accent, solidRgb: COMPANY_THEME.CMYM.solidRgb },
  { empresa: "SYSO", accent: COMPANY_THEME.SYSO.accent, solidRgb: COMPANY_THEME.SYSO.solidRgb },
  { empresa: "SANUM", accent: COMPANY_THEME.SANUM.accent, solidRgb: COMPANY_THEME.SANUM.solidRgb }
];

function PeriodFilter({
  periodo,
  onChange
}: {
  periodo: string;
  onChange: (period: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);

  const [year, setYear] = useState(new Date().getFullYear());
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(new Date().getMonth() + 1);

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

  const handleApply = () => {
    if (startMonth > endMonth) {
      alert("El mes final debe ser igual o posterior al inicial.");
      return;
    }
    const startStr = `${year}-${String(startMonth).padStart(2, "0")}`;
    const endStr = `${year}-${String(endMonth).padStart(2, "0")}`;
    onChange(`range:${startStr}:${endStr}`);
    setOpen(false);
  };

  const handleQuickSelect = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const MONTHS = [
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" }
  ];

  const currentYear = new Date().getFullYear();
  const YEARS = [currentYear + 1, currentYear, currentYear - 1, currentYear - 2, currentYear - 3];

  let displayLabel = formatPeriodLabel(periodo);
  if (displayLabel === periodo && !["current-month", "rolling-3m", "year-to-date"].includes(periodo) && !periodo.includes("-")) {
    displayLabel = "Seleccionar Periodo";
  }

  return (
    <div ref={shellRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "var(--module-surface-2)",
          border: "1px solid var(--module-border)",
          borderRadius: 8,
          color: "var(--module-text)",
          fontSize: "0.8rem",
          fontWeight: 600,
          cursor: "pointer",
          transition: "all 0.2s"
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--module-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--module-border)"; e.currentTarget.style.boxShadow = "none"; }}
      >
        <Calendar size={14} style={{ color: "var(--module-muted)" }} />
        {displayLabel}
        <ChevronDown size={14} style={{ color: "var(--module-muted)" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 8,
          background: "var(--module-surface-2)",
          border: "1px solid var(--module-border)",
          borderRadius: 12,
          boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)",
          width: 320,
          zIndex: 50,
          overflow: "hidden"
        }}>
          <div style={{ padding: 12, borderBottom: "1px solid var(--module-border)", background: "rgba(0,0,0,0.02)" }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--module-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "block" }}>Rápidos</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              <button 
                type="button" 
                onClick={() => handleQuickSelect("current-month")} 
                style={{ padding: "6px 10px", fontSize: "0.75rem", fontWeight: 600, background: "#fff", border: "1px solid var(--module-border)", borderRadius: 6, cursor: "pointer", color: "var(--module-text)" }}
              >Mes en curso</button>
              <button 
                type="button" 
                onClick={() => handleQuickSelect("rolling-3m")} 
                style={{ padding: "6px 10px", fontSize: "0.75rem", fontWeight: 600, background: "#fff", border: "1px solid var(--module-border)", borderRadius: 6, cursor: "pointer", color: "var(--module-text)" }}
              >Últimos 3 meses</button>
              <button 
                type="button" 
                onClick={() => handleQuickSelect("year-to-date")} 
                style={{ gridColumn: "span 2", padding: "6px 10px", fontSize: "0.75rem", fontWeight: 600, background: "#fff", border: "1px solid var(--module-border)", borderRadius: 6, cursor: "pointer", color: "var(--module-text)" }}
              >Año en curso</button>
            </div>
          </div>
          <div style={{ padding: 16 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--module-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12, display: "block" }}>Rango Específico</span>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <label style={{ fontSize: "0.75rem", color: "var(--module-muted)" }}>Año</label>
              <select 
                style={{ padding: "8px", fontSize: "0.8rem", borderRadius: 6, border: "1px solid var(--module-border)", background: "#fff", outline: "none" }}
                value={year} 
                onChange={(e) => setYear(Number(e.target.value))}
              >
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: "0.75rem", color: "var(--module-muted)" }}>Desde el mes de</label>
                <select 
                  style={{ padding: "8px", fontSize: "0.8rem", borderRadius: 6, border: "1px solid var(--module-border)", background: "#fff", outline: "none" }}
                  value={startMonth} 
                  onChange={(e) => setStartMonth(Number(e.target.value))}
                >
                  {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: "0.75rem", color: "var(--module-muted)" }}>Hasta</label>
                <select 
                  style={{ padding: "8px", fontSize: "0.8rem", borderRadius: 6, border: "1px solid var(--module-border)", background: "#fff", outline: "none" }}
                  value={endMonth} 
                  onChange={(e) => setEndMonth(Number(e.target.value))}
                >
                  {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>

            <button 
              type="button" 
              onClick={handleApply} 
              style={{ width: "100%", marginTop: 16, padding: "8px", background: "var(--module-accent)", color: "#fff", border: "none", borderRadius: 6, fontWeight: 600, fontSize: "0.8rem", cursor: "pointer" }}
            >
              Aplicar filtro
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const RESUMEN_CHAT_SUGGESTIONS = [
  "Dame un resumen ejecutivo del holding en 3 líneas",
  "¿Cuál es la alerta más importante que debo atender?",
  "¿Qué empresa del holding está creciendo más rápido?",
  "Explícame la evolución de la cartera vencida"
];

const RESUMEN_CHAT_SYSTEM_INSTRUCTION = `Estas asistiendo a un usuario que visualiza el modulo Resumen General de un proyecto demo de portafolio. Este modulo muestra una vista ejecutiva consolidada de tres unidades de negocio ficticias. Los datos que te paso en el contexto corresponden a lo que el usuario ve en pantalla en este momento. Responde de forma directa, ejecutiva y concreta. Si te piden analisis, interpreta los numeros y explica implicaciones de negocio; no te limites a repetirlos. Si te preguntan por algo que no tienes en el contexto, dilo claramente. Formato: texto plano sin Markdown, listas con guiones, moneda colombiana con separador de miles (ej: 3.824.000.000 COP).`;

function buildErrorPayload(message: string, period: PeriodKey): ResumenKpiPayload {
  const fallback: KpiResponse = {
    value: null,
    previous_value: null,
    change_pct: null,
    valor_actual: null,
    valor_anterior: null,
    variacion_absoluta: null,
    variacion_porcentual: null,
    base_baja: false,
    direction: "flat",
    favorable: null,
    error: message
  };

  return {
    period,
    cutoff: "",
    cutoff_label: null,
    comparison_period: { label: "" },
    kpis: {
      facturacion_total: { ...fallback },
      recaudo_total: { ...fallback },
      cartera_vencida: { ...fallback, ratio_over_facturacion: null },
      clientes_activos: { ...fallback }
    },
    por_empresa: {
      CMYM: { ...fallback, participacion: null, sparkline: [] },
      SYSO: { ...fallback, participacion: null, sparkline: [] },
      SANUM: { ...fallback, participacion: null, sparkline: [] }
    }
  };
}

function formatCompactDelta(value: number) {
  const absolute = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";

  if (absolute >= 1e9) {
    return `${sign}$${(absolute / 1e9).toFixed(1)}B`;
  }

  if (absolute >= 1e6) {
    return `${sign}$${(absolute / 1e6).toFixed(1)}M`;
  }

  if (absolute >= 1e3) {
    return `${sign}$${Math.round(absolute / 1e3)}K`;
  }

  return `${sign}$${Math.round(absolute).toLocaleString("es-CO")}`;
}

function buildAlertsFallback(period: PeriodKey): ResumenAlertPayload {
  return {
    period,
    cutoff: "",
    alerts: [],
    all_clear: false
  };
}

function getAlertStyles(severity: AlertSeverity) {
  if (severity === "critica") {
    return {
      item: { borderLeft: "4px solid #cc0000", background: "rgba(204,0,0,0.06)", borderColor: "rgba(204,0,0,0.14)" },
      icon: { background: "rgba(204,0,0,0.12)", color: "#cc0000" }
    };
  }

  if (severity === "advertencia") {
    return {
      item: { borderLeft: "4px solid #d97706", background: "rgba(217,119,6,0.08)", borderColor: "rgba(217,119,6,0.16)" },
      icon: { background: "rgba(217,119,6,0.12)", color: "#d97706" }
    };
  }

  if (severity === "informativa") {
    return {
      item: { borderLeft: "4px solid #0077c8", background: "rgba(0,119,200,0.07)", borderColor: "rgba(0,119,200,0.14)" },
      icon: { background: "rgba(0,119,200,0.12)", color: "#0077c8" }
    };
  }

  return {
    item: { borderLeft: "4px solid #2e8b7a", background: "rgba(46,139,122,0.08)", borderColor: "rgba(46,139,122,0.16)" },
    icon: { background: "rgba(46,139,122,0.12)", color: "#2e8b7a" }
  };
}

function renderAlertIcon(icon: AlertIcon) {
  switch (icon) {
    case "AlertOctagon":
      return <AlertOctagon size={16} />;
    case "TrendingUp":
      return <TrendingUp size={16} />;
    case "AlertCircle":
      return <AlertCircle size={16} />;
    case "TrendingDown":
      return <TrendingDown size={16} />;
    case "Users":
      return <Users size={16} />;
    case "Star":
      return <Star size={16} />;
    case "AlertTriangle":
      return <AlertTriangle size={16} />;
    case "UserX":
      return <UserX size={16} />;
    case "UserPlus":
      return <UserPlus size={16} />;
    case "Clock":
      return <Clock size={16} />;
    default:
      return <AlertTriangle size={16} />;
  }
}

function TrendBadge({
  kpi,
  loading
}: {
  kpi: KpiResponse;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="resumen-trend is-neutral">
        <Minus size={14} />
        <span>...</span>
      </div>
    );
  }

  if (kpi.error) {
    return (
      <div className="resumen-trend is-neutral">
        <Minus size={14} />
        <span>No disponible</span>
      </div>
    );
  }

  const change = kpi.variacion_porcentual;
  const absoluteChange = kpi.variacion_absoluta;
  if (change === null || absoluteChange === null) {
    return (
      <div className="resumen-trend is-neutral">
        <Minus size={14} />
        <span>Sin base comparable</span>
      </div>
    );
  }

  if (kpi.base_baja) {
    return (
      <div
        className="resumen-trend is-neutral"
        title="El periodo anterior fue muy bajo, el porcentaje no es representativo."
      >
        <Minus size={14} />
        <span>{`vs base baja (${formatCompactDelta(absoluteChange)})`}</span>
      </div>
    );
  }

  if (kpi.direction === "flat") {
    return (
      <div className="resumen-trend is-neutral">
        <Minus size={14} />
        <span>{`${Math.abs(change).toFixed(1)}% (${formatCompactDelta(absoluteChange)})`}</span>
      </div>
    );
  }

  const positive = Boolean(kpi.favorable);
  const Icon = kpi.direction === "up" ? TrendingUp : TrendingDown;

  return (
    <div className={`resumen-trend ${positive ? "is-positive" : "is-negative"}`}>
      <Icon size={14} />
      <span>{`${Math.abs(change).toFixed(1)}% (${formatCompactDelta(absoluteChange)})`}</span>
    </div>
  );
}

function ComparisonSubtitle({
  kpi,
  label,
  loading
}: {
  kpi: KpiResponse;
  label: string;
  loading: boolean;
}) {
  if (loading || kpi.error || kpi.base_baja) return null;

  const hasNoPreviousPeriod =
    kpi.previous_value === 0 && (kpi.value ?? 0) > 0;

  if (!hasNoPreviousPeriod && !label) return null;

  return (
    <p
      style={{
        marginTop: 4,
        color: "var(--module-muted)",
        fontFamily: "Space Mono,monospace",
        fontSize: "0.66rem",
        lineHeight: 1.2,
        whiteSpace: "nowrap"
      }}
    >
      {hasNoPreviousPeriod ? "sin periodo previo" : label}
    </p>
  );
}

function renderKpiValue(value: number | null, loading: boolean, formatter: (input: number) => string) {
  if (loading) return "...";
  if (value === null) return "-";
  return formatter(value);
}

function formatMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;

  return new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota"
  }).format(new Date(Date.UTC(year, month - 1, 1))).replace(".", "").toUpperCase();
}

function EmpresaSparkline({
  points,
  accent,
  solidRgb,
  loading,
  error
}: {
  points: Array<{ mes: string; valor: number }>;
  accent: string;
  solidRgb: string;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return <div className="resumen-spark-empty">Cargando tendencia...</div>;
  }

  if (error) {
    return <div className="resumen-spark-empty">Sin datos historicos</div>;
  }

  const hasHistory = points.some((point) => point.valor > 0);
  if (!hasHistory) {
    return <div className="resumen-spark-empty">Sin datos historicos</div>;
  }

  return (
    <div className="resumen-spark-chart">
      <Line
        data={{
          labels: points.map((point) => formatMonthLabel(point.mes)),
          datasets: [
            {
              data: points.map((point) => point.valor),
              borderColor: accent,
              backgroundColor: `rgba(${solidRgb},0.18)`,
              borderWidth: 2,
              fill: true,
              pointRadius: 0,
              pointHoverRadius: 3,
              pointBackgroundColor: accent,
              pointBorderWidth: 0,
              tension: 0.35
            }
          ]
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              displayColors: false,
              callbacks: {
                title: (items) => items[0]?.label ?? "",
                label: (context) => formatCurrency(Number(context.raw ?? 0))
              }
            }
          },
          scales: {
            x: { display: false, grid: { display: false } },
            y: { display: false, grid: { display: false } }
          },
          elements: {
            line: { capBezierPoints: true }
          }
        }}
      />
    </div>
  );
}

function ForecastLine({ forecast, accent }: { forecast: ForecastResult | null; accent: string }) {
  if (!forecast) return null;
  return (
    <p style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, fontSize: "0.76rem", color: "var(--module-muted)" }}>
      <TrendingUp size={12} style={{ color: accent }} />
      <span>
        <InlineTooltip
          label={`Proyectado al cierre: ${formatCurrency(forecast.projected)}`}
          text={`Cálculo: $${Math.round(forecast.dailyRate).toLocaleString("es-CO")}/día (ritmo actual) × ${forecast.totalDays} días del periodo. ${forecast.daysElapsed} de ${forecast.totalDays} días transcurridos.${!forecast.stable ? " Atención: ritmo aún inestable porque el periodo recién empezó." : ""} Proyección lineal — no considera estacionalidad.`}
        />
      </span>
    </p>
  );
}

type KpiDrillDownRow = {
  empresa: EmpresaCode;
  accent: string;
  value: number;
  previousValue: number;
  participacion: number | null;
  variacionPct: number | null;
  variacionAbs: number;
  direction: TrendDirection;
  favorable: boolean | null;
  sparkline: Array<{ mes: string; valor: number }>;
};

type KpiDrillDownSnapshot = {
  total: number;
  previous: number;
  varAbs: number;
  varPct: number | null;
  direction: TrendDirection;
  favorable: boolean | null;
  baseBaja: boolean;
  lider: KpiDrillDownRow | null;
  rows: KpiDrillDownRow[];
  monthlyTrend: Array<{ mes: string; valor: number }>;
  maxMonthly: number;
  forecast: ForecastResult | null;
};

type KpiDrillDownConfig = {
  kicker: string;
  title: string;
  subtitle: string;
  liderLabel: string;
  liderHint?: string;
  chartGradient: string;
  isHigherBetter: boolean;
  closingPhrase: (snapshot: KpiDrillDownSnapshot) => string;
};

function buildEmpresaRows(byEmpresa: Record<EmpresaCode, EmpresaBreakdownValue> | undefined): KpiDrillDownRow[] {
  if (!byEmpresa) return [];
  return EMPRESA_ITEMS.map((item) => {
    const kpi = byEmpresa[item.empresa];
    return {
      empresa: item.empresa,
      accent: item.accent,
      value: kpi?.value ?? 0,
      previousValue: kpi?.previous_value ?? 0,
      participacion: kpi?.participacion ?? null,
      variacionPct: kpi?.variacion_porcentual ?? null,
      variacionAbs: kpi?.variacion_absoluta ?? 0,
      direction: kpi?.direction ?? "flat",
      favorable: kpi?.favorable ?? null,
      sparkline: kpi?.sparkline ?? []
    };
  }).sort((a, b) => b.value - a.value);
}

function buildMonthlyTrend(rows: KpiDrillDownRow[]) {
  const monthMap = new Map<string, number>();
  for (const row of rows) {
    for (const point of row.sparkline) {
      monthMap.set(point.mes, (monthMap.get(point.mes) ?? 0) + (point.valor ?? 0));
    }
  }
  const trend = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, valor]) => ({ mes, valor }));
  const maxMonthly = trend.reduce((max, p) => Math.max(max, p.valor), 0);
  return { trend, maxMonthly };
}

function buildKpiSnapshot(
  kpi: (KpiResponse & { ratio_over_facturacion?: number | null }) | null,
  byEmpresa: Record<EmpresaCode, EmpresaBreakdownValue> | undefined,
  forecast: ForecastResult | null = null
): KpiDrillDownSnapshot | null {
  if (!kpi) return null;
  const rows = buildEmpresaRows(byEmpresa);
  const { trend, maxMonthly } = buildMonthlyTrend(rows);
  return {
    total: kpi.value ?? 0,
    previous: kpi.previous_value ?? 0,
    varAbs: kpi.variacion_absoluta ?? 0,
    varPct: kpi.variacion_porcentual,
    direction: kpi.direction,
    favorable: kpi.favorable,
    baseBaja: kpi.base_baja,
    lider: rows[0] ?? null,
    rows,
    monthlyTrend: trend,
    maxMonthly,
    forecast
  };
}

function KpiDrillDownModal({
  snapshot,
  config,
  comparisonLabel,
  onClose
}: {
  snapshot: KpiDrillDownSnapshot;
  config: KpiDrillDownConfig;
  comparisonLabel: string;
  onClose: () => void;
}) {
  const directionDataKind =
    snapshot.direction === "flat"
      ? "arl"
      : (config.isHigherBetter ? snapshot.direction === "up" : snapshot.direction === "down")
        ? "neto"
        : "retencion";
  const trendStateForCopy: "up" | "down" | "flat" =
    snapshot.direction === "flat"
      ? "flat"
      : (config.isHigherBetter ? snapshot.direction === "up" : snapshot.direction === "down")
        ? "up"
        : "down";

  return (
    <div className="pyg-modal-overlay" onClick={onClose}>
      <div className="pyg-modal-panel" role="dialog" aria-modal="true" aria-labelledby="resumenKpiModalTitle" onClick={(event) => event.stopPropagation()}>
        <div className="pyg-modal-header">
          <div>
            <div className="pyg-modal-kicker">{config.kicker}</div>
            <h3 className="pyg-modal-title" id="resumenKpiModalTitle">{config.title}</h3>
            <div className="pyg-modal-subtitle">{config.subtitle}</div>
          </div>
          <button className="pyg-modal-close" type="button" aria-label="Cerrar panel" onClick={onClose}>
            &times;
          </button>
        </div>

        <div className="pyg-modal-body">
          <div className="pyg-modal-grid">
            <div className="pyg-modal-stat" data-kind="bruto">
              <span className="pyg-modal-stat-label">Total Holding</span>
              <span className="pyg-modal-stat-value money">{formatCurrency(snapshot.total)}</span>
            </div>

            <div className="pyg-modal-stat" data-kind="neto">
              <span className="pyg-modal-stat-label">Periodo anterior</span>
              <span className="pyg-modal-stat-value money">{formatCurrency(snapshot.previous)}</span>
              <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)" }}>{comparisonLabel}</span>
            </div>

            <div className="pyg-modal-stat" data-kind={directionDataKind}>
              <span className="pyg-modal-stat-label">Variación absoluta</span>
              <span className="pyg-modal-stat-value money">
                {`${snapshot.varAbs >= 0 ? "+" : ""}${formatCurrency(snapshot.varAbs)}`}
              </span>
              <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)" }}>
                {snapshot.varPct === null ? "Sin comparación" : `${snapshot.varPct >= 0 ? "+" : ""}${snapshot.varPct.toFixed(1)}%`}
                {snapshot.baseBaja ? " · base baja" : ""}
              </span>
            </div>

            <div className="pyg-modal-stat" data-kind="arl">
              <span className="pyg-modal-stat-label">{config.liderLabel}</span>
              <span className="pyg-modal-stat-value">{snapshot.lider?.empresa ?? "-"}</span>
              <span style={{ fontWeight: 400, fontSize: "0.72rem", color: "var(--module-muted)" }}>
                {snapshot.lider ? `${formatCurrency(snapshot.lider.value)} · ${snapshot.lider.participacion?.toFixed(1) ?? "-"}% del holding` : "-"}
                {config.liderHint ? ` · ${config.liderHint}` : ""}
              </span>
            </div>
          </div>

          {snapshot.forecast ? (
            <div style={{ marginTop: 16, padding: "12px 14px", background: "rgba(0,119,200,0.06)", border: "1px solid rgba(0,119,200,0.18)", borderRadius: 8, display: "grid", gap: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <TrendingUp size={16} style={{ color: "#0077c8" }} />
                <span style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#0077c8", fontWeight: 700 }}>
                  Proyectado al cierre del periodo
                </span>
              </div>
              <div style={{ fontSize: "1.15rem", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>
                {formatCurrency(snapshot.forecast.projected)}
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--module-muted)" }}>
                {`Ritmo de ${formatCurrency(snapshot.forecast.dailyRate)}/día · ${snapshot.forecast.daysElapsed} de ${snapshot.forecast.totalDays} días transcurridos`}
                {!snapshot.forecast.stable ? " · ritmo aún inestable" : ""}
              </div>
              <div style={{ fontSize: "0.68rem", color: "var(--module-muted)", fontStyle: "italic" }}>
                Proyección lineal — no considera estacionalidad
              </div>
            </div>
          ) : null}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--module-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tendencia del holding · últimos 6 meses
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 90, padding: "10px 4px", background: "var(--module-surface-soft, rgba(0,0,0,0.03))", borderRadius: 6 }}>
              {snapshot.monthlyTrend.length === 0 ? (
                <div style={{ width: "100%", textAlign: "center", color: "var(--module-muted)", fontSize: "0.75rem", alignSelf: "center" }}>
                  Sin datos suficientes para mostrar tendencia
                </div>
              ) : snapshot.monthlyTrend.map((point) => {
                const heightPct = snapshot.maxMonthly > 0 ? (point.valor / snapshot.maxMonthly) * 100 : 0;
                const [year, monthIdx] = point.mes.split("-");
                const shortLabel = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][Number(monthIdx) - 1] ?? point.mes;
                return (
                  <div key={point.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%" }}>
                    <div style={{ flex: 1, display: "flex", alignItems: "flex-end", width: "100%" }}>
                      <div
                        title={`${shortLabel} ${year}: ${formatCurrency(point.valor)}`}
                        style={{
                          width: "100%",
                          height: `${heightPct}%`,
                          minHeight: point.valor > 0 ? 2 : 0,
                          background: config.chartGradient,
                          borderRadius: "3px 3px 0 0",
                          transition: "background 0.15s"
                        }}
                      />
                    </div>
                    <span style={{ fontSize: "0.62rem", color: "var(--module-muted)" }}>{`${shortLabel} ${year.slice(2)}`}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--module-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Desglose por empresa
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {snapshot.rows.map((row) => {
                const participacion = row.participacion ?? 0;
                const arrow = row.direction === "up" ? "↑" : row.direction === "down" ? "↓" : "→";
                const isGood = row.direction === "flat"
                  ? false
                  : (config.isHigherBetter ? row.direction === "up" : row.direction === "down");
                const isBad = row.direction === "flat"
                  ? false
                  : (config.isHigherBetter ? row.direction === "down" : row.direction === "up");
                const arrowColor = isGood ? "#2e8b7a" : isBad ? "#cc0000" : "var(--module-muted)";
                return (
                  <div key={row.empresa} style={{ display: "grid", gridTemplateColumns: "minmax(80px, 100px) 1fr auto", gap: 12, alignItems: "center", padding: "10px 12px", background: "var(--module-surface-2, rgba(0,0,0,0.02))", borderRadius: 8, borderLeft: `3px solid ${row.accent}` }}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>{row.empresa}</span>
                      <span style={{ fontSize: "0.7rem", color: "var(--module-muted)" }}>{`${participacion.toFixed(1)}% del holding`}</span>
                    </div>
                    <div style={{ position: "relative", height: 8, background: "rgba(0,0,0,0.06)", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ position: "absolute", inset: 0, width: `${Math.min(Math.max(participacion, 0), 100)}%`, background: row.accent, borderRadius: 4 }} />
                    </div>
                    <div style={{ display: "grid", gap: 2, textAlign: "right", minWidth: 130 }}>
                      <span style={{ fontSize: "0.85rem", fontWeight: 700, fontFamily: "var(--font-mono, monospace)" }}>{formatCurrency(row.value)}</span>
                      <span style={{ fontSize: "0.7rem", color: arrowColor, fontWeight: 600 }}>
                        {`${arrow} ${row.variacionPct === null ? "Sin dato" : `${row.variacionPct >= 0 ? "+" : ""}${row.variacionPct.toFixed(1)}%`}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={`pyg-trend-${trendStateForCopy}`}>
            <div className="pyg-modal-trend">
              <div className="pyg-modal-trend-icon">
                {snapshot.direction === "up" ? "↑" : snapshot.direction === "down" ? "↓" : "→"}
              </div>
              <div className="pyg-modal-trend-copy">
                <span className="pyg-modal-trend-label">{`Tendencia vs ${comparisonLabel || "período anterior"}`}</span>
                <span className="pyg-modal-trend-value">
                  {snapshot.varPct === null ? "Sin comparación" : `${snapshot.varPct >= 0 ? "+" : ""}${snapshot.varPct.toFixed(1)}% (${snapshot.varAbs >= 0 ? "+" : ""}${formatCurrency(snapshot.varAbs)})`}
                </span>
                <span className="pyg-modal-trend-sub">
                  {snapshot.baseBaja
                    ? "Comparación con base baja — interpretar con cuidado"
                    : config.closingPhrase(snapshot)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ResumenDashboard() {
  const [periodo, setPeriodo] = useState<PeriodKey>("current-month");
  const [payload, setPayload] = useState<ResumenKpiPayload | null>(null);
  const [alertPayload, setAlertPayload] = useState<ResumenAlertPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedKpiModal, setSelectedKpiModal] = useState<"facturacion" | "recaudo" | "cartera" | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadKpis() {
      setLoading(true);
      setKpiError(null);
      setAlertsLoading(true);
      setAlertsError(null);

      try {
        const response = await fetch(`/api/resumen/kpis?period=${periodo}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        const kpiData = await response.json();
        if (!response.ok) {
          throw new Error(kpiData?.detail ?? "No fue posible cargar los KPIs");
        }
        setPayload(kpiData as ResumenKpiPayload);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "No fue posible cargar los KPIs";
        setPayload(null);
        setKpiError(message);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }

      try {
        const response = await fetch(`/api/resumen/alertas?period=${periodo}`, {
          signal: controller.signal,
          cache: "no-store"
        });
        const alertData = await response.json();
        if (!response.ok) {
          throw new Error(alertData?.detail ?? "No fue posible cargar las alertas");
        }
        setAlertPayload(alertData as ResumenAlertPayload);
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = error instanceof Error ? error.message : "No fue posible cargar las alertas";
        setAlertPayload(buildAlertsFallback(periodo));
        setAlertsError(message);
      } finally {
        if (!controller.signal.aborted) {
          setAlertsLoading(false);
        }
      }
    }

    void loadKpis();
    return () => controller.abort();
  }, [periodo, reloadKey]);

  const facturacion = payload?.kpis.facturacion_total ?? null;
  const recaudo = payload?.kpis.recaudo_total ?? null;
  const cartera = payload?.kpis.cartera_vencida ?? null;
  const clientes = payload?.kpis.clientes_activos ?? null;
  const porEmpresa = payload?.por_empresa ?? buildErrorPayload("Sin datos", periodo).por_empresa;
  const comparisonLabel = payload?.comparison_period.label ?? "";
  const alertas = alertPayload?.alerts ?? [];

  const eficienciaCobro = useMemo(() => {
    if (!facturacion || !recaudo) return null;
    if (facturacion.error || recaudo.error) return null;
    const facturacionValue = facturacion.value ?? 0;
    const recaudoValue = recaudo.value ?? 0;
    if (facturacionValue <= 0) return null;
    return (recaudoValue / facturacionValue) * 100;
  }, [facturacion, recaudo]);

  const facturacionForecast = useMemo(
    () => computeForecast(facturacion?.value ?? null, periodo, getBogotaToday()),
    [facturacion?.value, periodo]
  );

  const recaudoForecast = useMemo(
    () => computeForecast(recaudo?.value ?? null, periodo, getBogotaToday()),
    [recaudo?.value, periodo]
  );

  const facturacionSnapshot = useMemo(
    () => (selectedKpiModal === "facturacion" ? buildKpiSnapshot(facturacion, porEmpresa, facturacionForecast) : null),
    [selectedKpiModal, facturacion, porEmpresa, facturacionForecast]
  );

  const recaudoSnapshot = useMemo(
    () => (selectedKpiModal === "recaudo" ? buildKpiSnapshot(recaudo, payload?.por_empresa_recaudo, recaudoForecast) : null),
    [selectedKpiModal, recaudo, payload?.por_empresa_recaudo, recaudoForecast]
  );

  const carteraSnapshot = useMemo(
    () => (selectedKpiModal === "cartera" ? buildKpiSnapshot(cartera, payload?.por_empresa_cartera) : null),
    [selectedKpiModal, cartera, payload?.por_empresa_cartera]
  );


  const kpiLoadError = kpiError ? new Error(kpiError) : null;
  const alertsLoadError = alertsError ? new Error(alertsError) : null;
  const periodLabel = formatPeriodLabel(periodo);
  const chatContext = useMemo(() => JSON.stringify({
    modulo: "resumen_general",
    fecha_corte: payload?.cutoff ?? alertPayload?.cutoff ?? "",
    periodo: periodLabel,
    kpis: {
      facturacion_total: facturacion
        ? {
            valor: facturacion.value,
            variacion_pct: facturacion.variacion_porcentual,
            variacion_abs: facturacion.variacion_absoluta,
            base_baja: facturacion.base_baja,
            proyectado_cierre: facturacionForecast?.projected ?? null,
            dias_transcurridos: facturacionForecast?.daysElapsed ?? null,
            dias_totales: facturacionForecast?.totalDays ?? null
          }
        : null,
      recaudo_total: recaudo
        ? {
            valor: recaudo.value,
            variacion_pct: recaudo.variacion_porcentual,
            variacion_abs: recaudo.variacion_absoluta,
            eficiencia_cobro_pct: eficienciaCobro,
            base_baja: recaudo.base_baja,
            proyectado_cierre: recaudoForecast?.projected ?? null,
            dias_transcurridos: recaudoForecast?.daysElapsed ?? null,
            dias_totales: recaudoForecast?.totalDays ?? null
          }
        : null,
      cartera_vencida: cartera
        ? {
            valor: cartera.value,
            variacion_pct: cartera.variacion_porcentual,
            variacion_abs: cartera.variacion_absoluta,
            pct_sobre_facturacion: cartera.ratio_over_facturacion,
            base_baja: cartera.base_baja
          }
        : null,
      clientes_activos: clientes
        ? {
            valor: clientes.value,
            variacion_pct: clientes.variacion_porcentual,
            variacion_abs: clientes.variacion_absoluta,
            base_baja: clientes.base_baja
          }
        : null
    },
    empresas: {
      CMYM: {
        facturacion: porEmpresa.CMYM.value,
        pct_holding: porEmpresa.CMYM.participacion,
        variacion_pct: porEmpresa.CMYM.variacion_porcentual,
        variacion_abs: porEmpresa.CMYM.variacion_absoluta,
        base_baja: porEmpresa.CMYM.base_baja
      },
      SYSO: {
        facturacion: porEmpresa.SYSO.value,
        pct_holding: porEmpresa.SYSO.participacion,
        variacion_pct: porEmpresa.SYSO.variacion_porcentual,
        variacion_abs: porEmpresa.SYSO.variacion_absoluta,
        base_baja: porEmpresa.SYSO.base_baja
      },
      SANUM: {
        facturacion: porEmpresa.SANUM.value,
        pct_holding: porEmpresa.SANUM.participacion,
        variacion_pct: porEmpresa.SANUM.variacion_porcentual,
        variacion_abs: porEmpresa.SANUM.variacion_absoluta,
        base_baja: porEmpresa.SANUM.base_baja
      }
    },
    alertas: alertas.map((item) => ({
      id: item.id,
      severidad: item.severidad,
      titulo: item.titulo,
      descripcion: item.descripcion
    }))
  }), [alertPayload?.cutoff, alertas, cartera, clientes, eficienciaCobro, facturacion, facturacionForecast, payload?.cutoff, periodLabel, porEmpresa, recaudo, recaudoForecast]);

  const kpiSkeleton = (
    <div className="resumen-kpi-grid">
      {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`resumen-kpi-skeleton-${index}`} />)}
    </div>
  );

  const empresaSkeleton = (
    <div className="resumen-empresas-grid">
      {EMPRESA_ITEMS.map((item) => (
        <section key={`empresa-skeleton-${item.empresa}`} className="module-card module-card--plain resumen-empresa-card">
          <div className="resumen-empresa-card__head">
            <div style={{ display: "grid", gap: 10 }}>
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="h-8 w-20" />
          </div>
          <Skeleton className="mb-3 h-3 w-28" />
          <Skeleton className="mb-4 h-3 w-24" />
          <div className="resumen-spark-shell">
            <Skeleton className="h-[68px] w-full" />
          </div>
        </section>
      ))}
    </div>
  );

  const alertSkeleton = (
    <section className="module-card module-card--plain resumen-alert-card" style={{ borderTop: "3px solid #cc0000" }}>
      <div className="resumen-card-title-wrap">
        <Skeleton className="mb-2 h-3 w-14" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="resumen-alert-list">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={`alert-skeleton-${index}`} className="resumen-alert-item">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div style={{ display: "grid", gap: 6, flex: 1 }}>
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  return (
    <div className="module-page-standard resumen-page">
      <AssistantShell
        title="Resumen General"
        contextBuilder={() => chatContext}
        suggestedQuestions={RESUMEN_CHAT_SUGGESTIONS}
        systemInstruction={RESUMEN_CHAT_SYSTEM_INSTRUCTION}
      />
      <ModuleHeader
        titulo="RESUMEN GENERAL"
        subtitulo="// VISTA EJECUTIVA DEL PROYECTO DEMO"
        cutoffLabel={payload?.cutoff_label ?? null}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--module-muted)", letterSpacing: "0.05em", textTransform: "uppercase" }}>PERIODO</span>
            <PeriodFilter periodo={periodo} onChange={(p) => setPeriodo(p)} />
          </div>
        }
      />

      <LoadingState
        isLoading={loading}
        error={kpiLoadError}
        skeleton={kpiSkeleton}
        onRetry={() => setReloadKey((current) => current + 1)}
        errorMessage="No se pudieron cargar los KPIs."
      >
      <div className="resumen-kpi-grid">
        <section
          className="module-card module-kpi module-card--plain resumen-kpi-card"
          style={{ borderTop: "3px solid #cc0000", cursor: facturacion && !facturacion.error ? "pointer" : "default", transition: "transform 0.15s, box-shadow 0.15s" }}
          onClick={() => { if (facturacion && !facturacion.error) setSelectedKpiModal("facturacion"); }}
          onMouseEnter={(e) => { if (facturacion && !facturacion.error) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(204,0,0,0.12)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          role={facturacion && !facturacion.error ? "button" : undefined}
          tabIndex={facturacion && !facturacion.error ? 0 : undefined}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && facturacion && !facturacion.error) { e.preventDefault(); setSelectedKpiModal("facturacion"); } }}
        >
          <p className="module-kpi__label">Facturacion Total</p>
          <p className="module-kpi__value">{renderKpiValue(facturacion?.value ?? null, loading, formatCurrency)}</p>
          <p className="module-kpi__sub">
            <InlineTooltip
              label="holding consolidado"
              text="Suma de CMYM + SYSO + SANUM, excluyendo facturas anuladas."
            />
          </p>
          <TrendBadge kpi={facturacion ?? buildErrorPayload("Sin datos", periodo).kpis.facturacion_total} loading={loading} />
          <ComparisonSubtitle kpi={facturacion ?? buildErrorPayload("Sin datos", periodo).kpis.facturacion_total} loading={loading} label={comparisonLabel} />
          {!loading && !facturacion?.error ? <ForecastLine forecast={facturacionForecast} accent="#cc0000" /> : null}
          {facturacion?.error ? <p className="resumen-kpi-note">Sin sincronizacion disponible</p> : null}
        </section>

        <section
          className="module-card module-kpi module-card--plain resumen-kpi-card"
          style={{ borderTop: "3px solid #2e8b7a", cursor: recaudo && !recaudo.error ? "pointer" : "default", transition: "transform 0.15s, box-shadow 0.15s" }}
          onClick={() => { if (recaudo && !recaudo.error) setSelectedKpiModal("recaudo"); }}
          onMouseEnter={(e) => { if (recaudo && !recaudo.error) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(46,139,122,0.12)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          role={recaudo && !recaudo.error ? "button" : undefined}
          tabIndex={recaudo && !recaudo.error ? 0 : undefined}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && recaudo && !recaudo.error) { e.preventDefault(); setSelectedKpiModal("recaudo"); } }}
        >
          <p className="module-kpi__label">Recaudo Total</p>
          <p className="module-kpi__value">{renderKpiValue(recaudo?.value ?? null, loading, formatCurrency)}</p>
          <p className="module-kpi__sub">
            {loading
              ? "..."
              : eficienciaCobro === null
                ? (
                  <InlineTooltip
                    label="flujo confirmado"
                    text="Dinero efectivamente recibido. Solo incluye facturas con pago registrado."
                  />
                )
                : (
                  <InlineTooltip
                    label={`${eficienciaCobro.toFixed(1)}% eficiencia de cobro`}
                    text="Recaudo del periodo dividido por facturación del periodo. Indica qué porcentaje de lo facturado ya ha sido cobrado."
                  />
                )}
          </p>
          <TrendBadge kpi={recaudo ?? buildErrorPayload("Sin datos", periodo).kpis.recaudo_total} loading={loading} />
          <ComparisonSubtitle kpi={recaudo ?? buildErrorPayload("Sin datos", periodo).kpis.recaudo_total} loading={loading} label={comparisonLabel} />
          {!loading && !recaudo?.error ? <ForecastLine forecast={recaudoForecast} accent="#2e8b7a" /> : null}
          {recaudo?.error ? <p className="resumen-kpi-note">Sin sincronizacion disponible</p> : null}
        </section>

        <section
          className="module-card module-kpi module-card--plain resumen-kpi-card"
          style={{ borderTop: "3px solid #d97706", cursor: cartera && !cartera.error ? "pointer" : "default", transition: "transform 0.15s, box-shadow 0.15s" }}
          onClick={() => { if (cartera && !cartera.error) setSelectedKpiModal("cartera"); }}
          onMouseEnter={(e) => { if (cartera && !cartera.error) { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(217,119,6,0.12)"; } }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
          role={cartera && !cartera.error ? "button" : undefined}
          tabIndex={cartera && !cartera.error ? 0 : undefined}
          onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && cartera && !cartera.error) { e.preventDefault(); setSelectedKpiModal("cartera"); } }}
        >
          <p className="module-kpi__label">
            <InlineTooltip
              label="Cartera Vencida"
              text="Saldos pendientes de facturas con mas de 30 dias desde su emision. Es stock acumulado al corte actual, no flujo del periodo seleccionado."
            />
          </p>
          <p className="module-kpi__value">{renderKpiValue(cartera?.value ?? null, loading, formatCurrency)}</p>
          <p className="module-kpi__sub">
            {loading
              ? "..."
              : (cartera?.ratio_over_facturacion ?? null) === null
                ? "- sobre facturacion"
                : (
                  <InlineTooltip
                    label={`${(cartera?.ratio_over_facturacion ?? 0).toFixed(1)}% sobre facturacion`}
                    text="Cartera vencida dividida por facturacion del periodo actual. Compara stock acumulado con flujo del periodo."
                  />
                )}
          </p>
          <TrendBadge kpi={cartera ?? buildErrorPayload("Sin datos", periodo).kpis.cartera_vencida} loading={loading} />
          <ComparisonSubtitle kpi={cartera ?? buildErrorPayload("Sin datos", periodo).kpis.cartera_vencida} loading={loading} label={comparisonLabel} />
          {cartera?.error ? <p className="resumen-kpi-note">Sin sincronizacion disponible</p> : null}
        </section>

        <section className="module-card module-kpi module-card--plain resumen-kpi-card" style={{ borderTop: "3px solid #0077c8" }}>
          <p className="module-kpi__label">Clientes Activos</p>
          <p className="module-kpi__value">{renderKpiValue(clientes?.value ?? null, loading, formatNumber)}</p>
          <p className="module-kpi__sub">clientes que facturaron en el periodo</p>
          <TrendBadge kpi={clientes ?? buildErrorPayload("Sin datos", periodo).kpis.clientes_activos} loading={loading} />
          <ComparisonSubtitle kpi={clientes ?? buildErrorPayload("Sin datos", periodo).kpis.clientes_activos} loading={loading} label={comparisonLabel} />
          {clientes?.error ? <p className="resumen-kpi-note">Sin sincronizacion disponible</p> : null}
        </section>
      </div>
      </LoadingState>

      <section className="resumen-section-grid">
        <LoadingState
          isLoading={loading}
          error={kpiLoadError}
          skeleton={empresaSkeleton}
          onRetry={() => setReloadKey((current) => current + 1)}
          errorMessage="No se pudieron cargar las tarjetas por empresa."
        >
        <div className="resumen-empresas-grid">
          {EMPRESA_ITEMS.map((item) => (
            <section key={item.empresa} className="module-card module-card--plain resumen-empresa-card" style={{ borderTop: `3px solid ${item.accent}` }}>
              <div className="resumen-empresa-card__head">
                <div>
                  <CompanyBadge empresa={item.empresa} />
                  <h2 className="resumen-empresa-card__value">
                    {renderKpiValue(porEmpresa[item.empresa].value ?? null, loading, formatCurrency)}
                  </h2>
                </div>
                <TrendBadge kpi={porEmpresa[item.empresa]} loading={loading} />
              </div>
              <ComparisonSubtitle kpi={porEmpresa[item.empresa]} loading={loading} label={comparisonLabel} />
              <p className="resumen-empresa-card__share">
                {loading
                  ? "..."
                  : porEmpresa[item.empresa].participacion === null
                    ? "- del holding"
                    : `${porEmpresa[item.empresa].participacion?.toFixed(1)}% del holding`}
              </p>
              <div className="resumen-spark-shell" style={{ borderColor: `${item.accent}33` }}>
                <EmpresaSparkline
                  points={porEmpresa[item.empresa].sparkline}
                  accent={item.accent}
                  solidRgb={item.solidRgb}
                  loading={loading}
                  error={porEmpresa[item.empresa].error}
                />
              </div>
              {porEmpresa[item.empresa].error ? <p className="resumen-kpi-note">Sin sincronizacion disponible</p> : null}
            </section>
          ))}
        </div>
        </LoadingState>

        <LoadingState
          isLoading={alertsLoading}
          error={alertsLoadError}
          skeleton={alertSkeleton}
          onRetry={() => setReloadKey((current) => current + 1)}
          errorMessage="No se pudieron cargar las alertas."
        >
        <section className="module-card module-card--plain resumen-alert-card" style={{ borderTop: "3px solid #cc0000" }}>
          <div className="resumen-card-title-wrap">
            <p className="module-kpi__label">Alertas</p>
            <h2 className="resumen-card-title">REQUIERE ATENCION</h2>
          </div>
          <div className="resumen-alert-list">
            {alertas.length > 0 ? (
              alertas.map((item) => {
                const styles = getAlertStyles(item.severidad);
                return (
                  <div key={item.id} className="resumen-alert-item" style={styles.item}>
                    <div className="resumen-alert-item__icon" style={styles.icon}>
                      {renderAlertIcon(item.icono)}
                    </div>
                    <div style={{ display: "grid", gap: "4px", minWidth: 0 }}>
                      <strong style={{ fontSize: "0.83rem", lineHeight: 1.2 }}>{item.titulo}</strong>
                      <span style={{ fontSize: "0.74rem", color: "var(--module-muted)", lineHeight: 1.4 }}>{item.descripcion}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                className="resumen-alert-item"
                style={{
                  borderLeft: "4px solid #2e8b7a",
                  background: "rgba(46,139,122,0.08)",
                  borderColor: "rgba(46,139,122,0.16)",
                  minHeight: "96px"
                }}
              >
                <div className="resumen-alert-item__icon" style={{ background: "rgba(46,139,122,0.14)", color: "#2e8b7a" }}>
                  <CheckCircle size={18} />
                </div>
                <div style={{ display: "grid", gap: "4px" }}>
                  <strong style={{ fontSize: "0.88rem" }}>Todo en orden</strong>
                  <span style={{ fontSize: "0.76rem", color: "var(--module-muted)", lineHeight: 1.45 }}>
                    No hay situaciones que requieran atencion
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
        </LoadingState>
      </section>

      {facturacionSnapshot ? (
        <KpiDrillDownModal
          snapshot={facturacionSnapshot}
          config={{
            kicker: `Desglose · Facturación · ${periodLabel}`,
            title: "Facturación Total",
            subtitle: `Holding consolidado · vs ${comparisonLabel || "período anterior"}`,
            liderLabel: "Empresa líder del periodo",
            chartGradient: "linear-gradient(180deg, #cc0000 0%, rgba(204,0,0,0.55) 100%)",
            isHigherBetter: true,
            closingPhrase: (snap) => `Holding facturó ${formatCurrency(snap.total)} este periodo vs ${formatCurrency(snap.previous)} anterior`
          }}
          comparisonLabel={comparisonLabel}
          onClose={() => setSelectedKpiModal(null)}
        />
      ) : null}

      {recaudoSnapshot ? (
        <KpiDrillDownModal
          snapshot={recaudoSnapshot}
          config={{
            kicker: `Desglose · Recaudo · ${periodLabel}`,
            title: "Recaudo Total",
            subtitle: `Dinero efectivamente recibido · vs ${comparisonLabel || "período anterior"}`,
            liderLabel: "Empresa que más cobró",
            chartGradient: "linear-gradient(180deg, #2e8b7a 0%, rgba(46,139,122,0.55) 100%)",
            isHigherBetter: true,
            closingPhrase: (snap) => `Holding recaudó ${formatCurrency(snap.total)} este periodo vs ${formatCurrency(snap.previous)} anterior`
          }}
          comparisonLabel={comparisonLabel}
          onClose={() => setSelectedKpiModal(null)}
        />
      ) : null}

      {carteraSnapshot ? (
        <KpiDrillDownModal
          snapshot={carteraSnapshot}
          config={{
            kicker: `Desglose · Cartera Vencida · ${periodLabel}`,
            title: "Cartera Vencida",
            subtitle: `Saldo pendiente a la fecha · vs ${comparisonLabel || "período anterior"}`,
            liderLabel: "Empresa con mayor cartera",
            liderHint: "subir cartera no es deseable",
            chartGradient: "linear-gradient(180deg, #d97706 0%, rgba(217,119,6,0.55) 100%)",
            isHigherBetter: false,
            closingPhrase: (snap) => `Holding acumula ${formatCurrency(snap.total)} en cartera vencida vs ${formatCurrency(snap.previous)} antes`
          }}
          comparisonLabel={comparisonLabel}
          onClose={() => setSelectedKpiModal(null)}
        />
      ) : null}
    </div>
  );
}
