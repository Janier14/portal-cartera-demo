"use client";

import "@/lib/modules/charts";

import { AlertTriangle, ArrowRight, Building2, Calculator, CheckCircle, CheckSquare, Clock, Download, Edit3, FileSpreadsheet, Info, LoaderCircle, Mail, MailPlus, PieChart, Plus, Search, Trash2, TrendingUp, TriangleAlert, Users, Wallet, X, XCircle } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bar, Doughnut } from "react-chartjs-2";

import { ModalGenerarCorreo } from "@/components/cartera/ModalGenerarCorreo";
import { ModalRecordatoriosCobranza } from "@/components/cartera/ModalRecordatoriosCobranza";
import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { CarteraAportesTab, computeAportesClientes } from "@/components/modules/cartera-aportes-tab";
import { CarteraRegistroTab } from "@/components/modules/cartera-registro-tab";
import { CompanyBadge } from "@/components/ui/company-badge";
import { ChartSkeleton, CompanyFilter, KpiCardSkeleton, LoadingState, TableSkeleton } from "@/components/ui";
import { DashboardCard, EmptyState, SectionTitle } from "@/components/ui/dashboard-primitives";
import { Toast } from "@/components/ui/toast";
import type { MorosoPorTerceroItem } from "@/lib/cartera-recordatorios";
import { getFacturaSuffix } from "@/lib/company-theme";
import {
  buildCarteraRaw,
  CarteraProjectionPayload,
  PlanillaMap,
  PlanillaRow,
  RecaudoRow
} from "@/lib/modules/cartera";
import { formatCompactCurrency, formatCurrency, formatNumber } from "@/lib/modules/format";
import type { CompaniaAlert, QuincenaAlert } from "@/lib/planillas-alertas";

type PlanillaAlertMap = Record<string, CompaniaAlert>;

type PlanillaCompania = {
  id: number;
  nombre: string;
  tipo: string;
  frecuencia_quincenas: 1 | 2;
  alertas_activas?: boolean;
  portal_detalle?: string;
  correo_remitente?: string;
  correo_destino?: string;
  recepcion_notas?: string;
};

type CarteraDashboardProps = {
  recaudos: RecaudoRow[];
  planillas: { companias: PlanillaCompania[] };
  canEdit: boolean;
  lastImportDate?: string | null;
};
type FacturaToastOptions = {
  title: string;
  description?: string;
};

type CompaniaFormState = {
  nombre: string;
  tipo: "ARL" | "Seguros" | "SALUD";
  frecuencia_quincenas: 1 | 2;
  alertas_activas: boolean;
  portal_detalle: string;
  correo_remitente: string;
  correo_destino: string;
  recepcion_notas: string;
};

type CompaniaModalMode = { kind: "create" } | { kind: "edit"; compania: PlanillaCompania };

type TabKey = "resumen" | "facturacion" | "proyeccion" | "planillas" | "aportes" | "registro";
type ExcelCell = string | number;
type ExcelSheetSpec = { name: string; headers: ExcelCell[]; rows: ExcelCell[][]; cols?: Array<{ wch: number }> };
type ToastState = { kind: "success" | "error"; title: string; description?: string } | null;

const MONTHS_S = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MONTHS_L = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const MES_LABELS = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
const FACTURACION_TIPOS_POR_EMPRESA = {
  TODAS: ["all", "ARL", "SEGUROS", "SALUD", "OTROS"],
  CMYM: ["all", "ARL", "SEGUROS", "SALUD"],
  SYSO: ["all", "OTROS"],
  SANUM: ["all", "OTROS"]
} as const;
const DEFAULT_FACTURACION_DESDE_MES = "01";
const DEFAULT_FACTURACION_DESDE_ANIO = String(new Date().getFullYear());

const PROJECTION_COLORS = {
  ALTA: "rgba(46,139,122,.75)",
  MEDIA: "rgba(245,158,11,.75)",
  BAJA: "rgba(204,0,0,.65)"
} as const;

function formatCutoffLabel(date: Date) {
  const month = new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota"
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();

  return `${String(date.getDate()).padStart(2, "0")}-${month}-${date.getFullYear()}`;
}

function planillaKey(nombre: string, tipo: string) {
  return `${nombre}||${tipo}`;
}

function getDateNum(mes: string, anio: string) {
  if (!mes || !anio) return null;
  return parseInt(anio, 10) * 100 + parseInt(mes, 10);
}

function formatPeriodo(periodo: string) {
  if (!periodo || periodo === "-") return periodo;
  const [mm, yyyy] = periodo.split("/");
  const m = parseInt(mm, 10);
  return MONTHS_S[m] ? `${MONTHS_S[m]} ${yyyy}` : periodo;
}

const estadoBadge: Record<string, string> = {
  PAGADA: "background:rgba(46,139,122,.12);color:#2e8b7a",
  PENDIENTE: "background:rgba(245,158,11,.12);color:#f59e0b",
  ANULADA: "background:rgba(204,0,0,.1);color:#cc0000"
};

const estadoIcon: Record<string, React.ReactNode> = {
  PENDIENTE: <Clock size={12} />,
  PAGADA: <CheckCircle size={12} />,
  ANULADA: <XCircle size={12} />
};

const tipoBadge: Record<string, string> = {
  ARL: "background:rgba(0,119,200,.1);color:#0077c8",
  SEGUROS: "background:rgba(204,0,0,.1);color:#cc0000",
  SALUD: "background:rgba(46,139,122,.1);color:#2e8b7a",
  VIDA: "background:rgba(46,139,122,.1);color:#2e8b7a",
  OTROS: "background:rgba(130,130,127,.1);color:#82827f"
};

const MODAL_LABEL_STYLE: CSSProperties = {
  fontFamily: "DM Sans,sans-serif", fontSize: ".7rem", color: "#82827f",
  letterSpacing: ".04em", textTransform: "uppercase", fontWeight: 600
};
const MODAL_FIELD_STYLE: CSSProperties = {
  height: "38px", width: "100%", background: "var(--module-surface-2)",
  border: "1px solid var(--module-border)", borderRadius: "8px", padding: "6px 11px",
  color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".85rem",
  outline: "none", transition: "border-color .15s, box-shadow .15s"
};
function modalFieldFocus(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "#cc0000";
  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(204,0,0,.1)";
}
function modalFieldBlur(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
  e.currentTarget.style.borderColor = "var(--module-border)";
  e.currentTarget.style.boxShadow = "none";
}

const diasBadge = (dias: number, estado: string) => {
  if (estado !== "PENDIENTE") return null;
  const bg = dias > 30 ? "background:rgba(204,0,0,.15);color:#cc0000" : dias > 7 ? "background:rgba(245,158,11,.15);color:#f59e0b" : "background:rgba(46,139,122,.12);color:#2e8b7a";
  return { style: bg, label: dias > 0 ? `${dias}d` : "<1d" };
};

const semColor: Record<string, string> = { verde: "#16a34a", amarillo: "#d97706", rojo: "#dc2626" };

const BADGE_BASE = "display:inline-block;padding:3px 10px;border-radius:20px;font-size:.65rem;font-family:Space Mono,monospace;font-weight:700;";
const TYPE_BASE = "display:inline-block;padding:2px 8px;border-radius:4px;font-size:.62rem;font-family:Space Mono,monospace;font-weight:700;";

function emptyPlanillaRow(): PlanillaRow {
  return { q1: false, fq1: "", q2: false, fq2: "", fact_q1: false, fact_q2: false, obs: "" };
}

function clonePlanillaMap(source: PlanillaMap) {
  return Object.fromEntries(Object.entries(source).map(([key, row]) => [key, { ...row }])) as PlanillaMap;
}

function normalizePlanillaMap(companies: Array<{ nombre: string; tipo: string }>, source: PlanillaMap) {
  const next: PlanillaMap = {};
  companies.forEach((company) => {
    const key = planillaKey(company.nombre, company.tipo);
    next[key] = { ...emptyPlanillaRow(), ...(source[key] ?? {}) };
  });
  return next;
}

function countPlanillaFieldChanges(current: PlanillaMap, original: PlanillaMap, companies: Array<{ nombre: string; tipo: string }>) {
  let changes = 0;
  companies.forEach((company) => {
    const key = planillaKey(company.nombre, company.tipo);
    const left = current[key] ?? emptyPlanillaRow();
    const right = original[key] ?? emptyPlanillaRow();
    if (left.q1 !== right.q1) changes++;
    if (left.fq1 !== right.fq1) changes++;
    if (left.q2 !== right.q2) changes++;
    if (left.fq2 !== right.fq2) changes++;
    if (left.fact_q1 !== right.fact_q1) changes++;
    if (left.fact_q2 !== right.fact_q2) changes++;
    if (left.obs !== right.obs) changes++;
  });
  return changes;
}

function getPlanillaProgress(row: PlanillaRow, frecuencia: 1 | 2) {
  const totalSteps = frecuencia === 2 ? 4 : 2;
  const completedSteps =
    (row.q1 ? 1 : 0) +
    (row.fact_q1 ? 1 : 0) +
    (frecuencia === 2 ? (row.q2 ? 1 : 0) + (row.fact_q2 ? 1 : 0) : 0);
  const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
  const color = completedSteps === 0 ? "#82827f" : completedSteps < totalSteps ? "#f59e0b" : "#2e8b7a";
  return { completedSteps, totalSteps, pct, color };
}

function isPlanillaCompleta(row: PlanillaRow, frecuencia: 1 | 2) {
  return frecuencia === 2
    ? (row.q1 && row.fact_q1 && row.q2 && row.fact_q2)
    : (row.q1 && row.fact_q1);
}

function isPlanillaSinFacturar(row: PlanillaRow, frecuencia: 1 | 2) {
  if (row.q1 && !row.fact_q1) return true;
  if (frecuencia === 2 && row.q2 && !row.fact_q2) return true;
  return false;
}

function quincenaAlertLabel(label: string, q: QuincenaAlert): string | null {
  const sufijo = q.estimated ? " (estimado)" : "";
  if (q.status === "overdue") {
    const dias = q.daysDiff ?? 0;
    return `${label} sin enviar a facturar — normalmente la envías ~día ${q.typicalDay}${sufijo} — ${dias === 0 ? "vence hoy" : `+${dias} día(s) de atraso`}`;
  }
  if (q.status === "upcoming") {
    const faltan = Math.abs(q.daysDiff ?? 0);
    return `${label} por enviar — normalmente la envías ~día ${q.typicalDay}${sufijo} — ${faltan === 0 ? "es hoy" : `faltan ${faltan} día(s)`}`;
  }
  return null;
}

function PlanillaAlertIcon({ alert }: { alert?: CompaniaAlert }) {
  if (!alert || alert.worst === "none") return null;
  const color = alert.worst === "overdue" ? "#ea580c" : "#eab308";
  const parts: string[] = [];
  const l1 = quincenaAlertLabel("1ra quincena", alert.q1);
  if (l1) parts.push(l1);
  if (alert.q2) {
    const l2 = quincenaAlertLabel("2da quincena", alert.q2);
    if (l2) parts.push(l2);
  }
  return (
    <span
      title={parts.join("\n")}
      className={alert.worst === "upcoming" ? "pl-alert-icon pl-alert-pulse" : "pl-alert-icon"}
      style={{ color, display: "inline-flex", verticalAlign: "middle", cursor: "help" }}
    >
      <TriangleAlert size={17} strokeWidth={2.6} fill={alert.worst === "overdue" ? "rgba(234,88,12,.15)" : "rgba(234,179,8,.18)"} />
    </span>
  );
}

function RecepcionInfoIcon({ compania }: { compania: PlanillaCompania }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const portal = (compania.portal_detalle ?? "").trim();
  const remitente = (compania.correo_remitente ?? "").trim();
  const destino = (compania.correo_destino ?? "").trim();
  const notas = (compania.recepcion_notas ?? "").trim();
  if (!(portal || remitente || destino || notas)) return null;

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ top: rect.bottom + 6, left: rect.left });
    setOpen((v) => !v);
  }

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        title="Recepción de planilla"
        style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#0077c8", display: "inline-flex", alignItems: "center", flexShrink: 0 }}
      >
        <Info size={15} />
      </button>
      {open && (
        <>
          <div onClick={(e) => { e.stopPropagation(); setOpen(false); }} style={{ position: "fixed", inset: 0, zIndex: 1200 }} />
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed", top: pos.top, left: pos.left, zIndex: 1201,
              minWidth: "240px", maxWidth: "320px",
              background: "var(--module-surface)", border: "1px solid var(--module-border)",
              borderRadius: "10px", padding: "12px 14px", boxShadow: "0 10px 28px rgba(0,0,0,.22)",
              fontFamily: "DM Sans,sans-serif"
            }}
          >
            <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".62rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "#82827f", marginBottom: "8px" }}>
              Recepción · {compania.nombre}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "9px", fontSize: ".8rem", color: "var(--module-text)", lineHeight: 1.35 }}>
              {portal && (
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <Download size={14} style={{ color: "#0077c8", flexShrink: 0, marginTop: "2px" }} />
                  <div><span style={{ fontSize: ".66rem", color: "#82827f", textTransform: "uppercase", letterSpacing: ".05em" }}>Portal</span><br />{portal}</div>
                </div>
              )}
              {(remitente || destino) && (
                <div style={{ display: "flex", gap: "8px", alignItems: "flex-start" }}>
                  <Mail size={14} style={{ color: "#cc0000", flexShrink: 0, marginTop: "2px" }} />
                  <div>
                    <span style={{ fontSize: ".66rem", color: "#82827f", textTransform: "uppercase", letterSpacing: ".05em" }}>Correo</span><br />
                    {remitente && <div>De: <span style={{ userSelect: "all" }}>{remitente}</span></div>}
                    {destino && <div>A: <span style={{ userSelect: "all" }}>{destino}</span></div>}
                  </div>
                </div>
              )}
              {notas && (
                <div style={{ fontSize: ".76rem", color: "#82827f", borderTop: "1px dashed var(--module-border)", paddingTop: "7px" }}>{notas}</div>
              )}
            </div>
          </div>
        </>
      )}
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

function buildSemanasMesClient(year: number, month: number): Array<{ semana: number; desde: number; hasta: number; label: string }> {
  const shortNames = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const lastDay = new Date(year, month, 0).getDate();
  let firstMonday = 1;
  for (let d = 1; d <= 7; d++) {
    if (new Date(year, month - 1, d).getDay() === 1) { firstMonday = d; break; }
  }
  const offset = firstMonday - 1;
  const cuts = [offset + 1, offset + 8, offset + 15, offset + 22, lastDay + 1];
  return ([1, 2, 3, 4] as const).map((semana, i) => {
    const desde = Math.min(cuts[i], lastDay);
    const hasta = Math.min(cuts[i + 1] - 1, lastDay);
    return { semana, desde, hasta, label: `${desde}-${hasta} ${shortNames[month - 1]}` };
  });
}

const ACTION_BTN_BASE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: "6px",
  fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700,
  letterSpacing: ".06em", textTransform: "uppercase",
  borderRadius: "6px", padding: "7px 14px", cursor: "pointer",
};

export function CarteraDashboard({ recaudos, planillas, canEdit, lastImportDate }: CarteraDashboardProps) {
  const [tab, setTab] = useState<TabKey>("resumen");
  const facturacionTableRef = useRef<HTMLDivElement | null>(null);
  const [recaudosState, setRecaudosState] = useState<RecaudoRow[]>(recaudos);

  // Empresa selector
  const [empresa, setEmpresa] = useState<"CMYM" | "SYSO" | "SANUM" | "TODAS">("TODAS");

  // Proyeccion (fetched dynamically)
  const [proyeccion, setProyeccion] = useState<CarteraProjectionPayload | null>(null);
  const [loadingProyeccion, setLoadingProyeccion] = useState(false);
  const [proyeccionError, setProyeccionError] = useState<string | null>(null);
  const [proyeccionReloadKey, setProyeccionReloadKey] = useState(0);
  const [proyeccionSemana, setProyeccionSemana] = useState<string>("actual-todas");
  // Proyeccion mes siguiente (incluye el mes actual como cerrado en el historial)
  const [proyeccionSig, setProyeccionSig] = useState<CarteraProjectionPayload | null>(null);
  const [loadingProyeccionSig, setLoadingProyeccionSig] = useState(false);

  // Facturacion filters
  const [estado, setEstado] = useState("all");
  const [tipo, setTipo] = useState("all");
  const [search, setSearch] = useState("");
  const [onlyMora, setOnlyMora] = useState(false);
  const [agingBucket, setAgingBucket] = useState<"all" | "0-30" | "31-60" | "61-90" | "90+">("all");
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const raw = useMemo(() => buildCarteraRaw(recaudosState), [recaudosState]);
  const cutoffLabel = useMemo(() => {
    if (lastImportDate) {
      const d = new Date(lastImportDate);
      if (!isNaN(d.getTime())) return formatCutoffLabel(d);
    }
    let latest = 0;
    raw.facturas.forEach((row) => {
      if (empresa !== "TODAS" && row.empresa !== empresa) return;
      if (row.fechaFactSortNum > latest) latest = row.fechaFactSortNum;
    });
    if (!latest) return null;
    const year = Math.floor(latest / 10000);
    const month = Math.floor((latest % 10000) / 100) - 1;
    const day = latest % 100;
    return formatCutoffLabel(new Date(year, month, day));
  }, [lastImportDate, empresa, raw.facturas]);
  const [desdeMes, setDesdeMes] = useState(DEFAULT_FACTURACION_DESDE_MES);
  const [desdeAnio, setDesdeAnio] = useState(DEFAULT_FACTURACION_DESDE_ANIO);
  const [hastaMes, setHastaMes] = useState("");
  const [hastaAnio, setHastaAnio] = useState("");
  const [sortCol, setSortCol] = useState("dias");
  const [sortAsc, setSortAsc] = useState(false);

  // Planillas
  const [planillaData, setPlanillaData] = useState<PlanillaMap>({});
  const [planillaSnapshot, setPlanillaSnapshot] = useState<PlanillaMap>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const now = new Date();
  const nextMonthYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
  const nextMonthNum = now.getMonth() === 11 ? 1 : now.getMonth() + 2;
  const nextMesLabel = `${MES_LABELS[nextMonthNum - 1]}-${nextMonthYear}`;
  const sigSemanas = buildSemanasMesClient(nextMonthYear, nextMonthNum);
  const [plYear, setPlYear] = useState(now.getFullYear());
  const [plMonth, setPlMonth] = useState(now.getMonth()); // 0-based
  const [plFiltroTipo, setPlFiltroTipo] = useState("todos");
  const [plFiltroEstado, setPlFiltroEstado] = useState("todos");
  const [plSearchNombre, setPlSearchNombre] = useState("");
  const [companias, setCompanias] = useState<PlanillaCompania[]>(planillas.companias);
  const [companiaModal, setCompaniaModal] = useState<CompaniaModalMode | null>(null);
  const [companiaForm, setCompaniaForm] = useState<CompaniaFormState>({ nombre: "", tipo: "Seguros", frecuencia_quincenas: 2, alertas_activas: true, portal_detalle: "", correo_remitente: "", correo_destino: "", recepcion_notas: "" });
  const [plAlertas, setPlAlertas] = useState<PlanillaAlertMap>({});
  const [companiaSaving, setCompaniaSaving] = useState(false);
  const [companiaError, setCompaniaError] = useState("");
  const [recordatoriosOpen, setRecordatoriosOpen] = useState(false);
  const [recordatorioTarget, setRecordatorioTarget] = useState<MorosoPorTerceroItem | null>(null);
  const [recordatoriosRefreshKey, setRecordatoriosRefreshKey] = useState(0);

  const showTipoBlocks = empresa === "CMYM" || empresa === "TODAS";
  const tipoFilterOptions: string[] = [...FACTURACION_TIPOS_POR_EMPRESA[empresa]];

  useEffect(() => {
    setRecaudosState(recaudos);
  }, [recaudos]);

  useEffect(() => {
    if (!tipoFilterOptions.includes(tipo)) {
      setTipo("all");
    }
  }, [empresa, tipo, tipoFilterOptions]);

  // Available years from data
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    set.add(DEFAULT_FACTURACION_DESDE_ANIO);
    raw.facturas.forEach((factura) => {
      if (factura.fechaFactMonthNum > 0) {
        set.add(String(Math.floor(factura.fechaFactMonthNum / 100)));
      }
    });
    return [...set].sort((a, b) => Number(a) - Number(b));
  }, [raw.facturas]);

  const availableMonthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    [...availableYears].sort().forEach(year => {
      for (let m = 1; m <= 12; m++) {
        opts.push({ value: `${String(m).padStart(2, "0")}-${year}`, label: `${MONTHS_S[m]} ${year}` });
      }
    });
    return opts;
  }, [availableYears]);

  const filtered = useMemo(() => {
    const desde = getDateNum(desdeMes, desdeAnio);
    const hasta = getDateNum(hastaMes, hastaAnio);
    const q = deferredSearch;

    let rows = raw.facturas.filter(r => {
      if (empresa !== "TODAS" && r.empresa !== empresa) return false;
      if (estado !== "all" && r.estado !== estado) return false;
      if (tipo !== "all" && r.tipo !== tipo) return false;
      if (onlyMora && !(r.estado === "PENDIENTE" && r.dias > 30)) return false;
      if (agingBucket !== "all") {
        if (r.estado !== "PENDIENTE") return false;
        const d = r.dias;
        if (agingBucket === "0-30" && !(d >= 0 && d <= 30)) return false;
        if (agingBucket === "31-60" && !(d >= 31 && d <= 60)) return false;
        if (agingBucket === "61-90" && !(d >= 61 && d <= 90)) return false;
        if (agingBucket === "90+" && !(d > 90)) return false;
      }
      if (q && !(r.companiaSearch.includes(q) || r.facturaSearch.includes(q))) return false;
      const rDate = r.fechaFactMonthNum;
      if (desde && rDate && rDate < desde) return false;
      if (hasta && rDate && rDate > hasta) return false;
      return true;
    });

    rows = [...rows].sort((a, b) => {
      const va = (a as any)[sortCol];
      const vb = (b as any)[sortCol];
      if (sortCol === "fecha_fact" || sortCol === "fecha_pago") {
        const leftDate = sortCol === "fecha_fact" ? a.fechaFactSortNum : a.fechaPagoSortNum;
        const rightDate = sortCol === "fecha_fact" ? b.fechaFactSortNum : b.fechaPagoSortNum;
        return sortAsc ? leftDate - rightDate : rightDate - leftDate;
      }
      if (typeof va === "string") return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortAsc ? va - vb : vb - va;
    });

    return rows;
  }, [raw.facturas, empresa, estado, tipo, onlyMora, agingBucket, deferredSearch, desdeMes, desdeAnio, hastaMes, hastaAnio, sortCol, sortAsc]);

  function sortBy(col: string) {
    if (sortCol === col) setSortAsc(v => !v);
    else { setSortCol(col); setSortAsc(true); }
  }

  function limpiarFiltros() {
    setEstado("all"); setTipo("all"); setSearch("");
    setDesdeMes(DEFAULT_FACTURACION_DESDE_MES); setDesdeAnio(DEFAULT_FACTURACION_DESDE_ANIO); setHastaMes(""); setHastaAnio("");
    setOnlyMora(false);
  }

  function verFacturasMora() {
    setTab("facturacion");
    setEstado("PENDIENTE");
    setTipo("all");
    setSearch("");
    setDesdeMes(DEFAULT_FACTURACION_DESDE_MES);
    setDesdeAnio(DEFAULT_FACTURACION_DESDE_ANIO);
    setHastaMes("");
    setHastaAnio("");
    setOnlyMora(true);
    setSortCol("dias");
    setSortAsc(false);

    requestAnimationFrame(() => {
      facturacionTableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function openRecordatoriosModal() {
    setRecordatorioTarget(null);
    setRecordatoriosOpen(true);
  }

  function closeRecordatoriosModal() {
    setRecordatoriosOpen(false);
    setRecordatorioTarget(null);
  }

  function handleSelectRecordatorio(item: MorosoPorTerceroItem) {
    setRecordatorioTarget(item);
  }

  function handleBackFromRecordatorio() {
    setRecordatorioTarget(null);
  }

  function handleSeguimientoSaved() {
    setRecordatoriosRefreshKey((current) => current + 1);
  }

  useEffect(() => {
    if (onlyMora && estado !== "PENDIENTE") {
      setOnlyMora(false);
    }
  }, [estado, onlyMora]);

  const { facturado, pagado, pendiente, anulado, nPend, tipoBars, moraAlta, moraMedia, chartMesData } = useMemo(() => {
    const tipoMap: Record<string, number> = {};
    const chartMap: Record<string, { facturado: number; pagado: number; count: number }> = {};
    const moraAltaRows: typeof filtered = [];
    const moraMediaRows: typeof filtered = [];
    let totalFacturado = 0;
    let totalPagado = 0;
    let totalPendiente = 0;
    let totalAnulado = 0;
    let totalPendCount = 0;

    filtered.forEach((row) => {
      if (row.estado !== "ANULADA") totalFacturado += row.valor;
      if (row.estado === "PAGADA") totalPagado += row.valor;
      if (row.estado === "ANULADA") totalAnulado += row.valor;

      if (row.estado === "PENDIENTE") {
        totalPendiente += row.valor;
        totalPendCount += 1;
        tipoMap[row.tipo] = (tipoMap[row.tipo] || 0) + row.valor;
        if (row.dias >= 60) moraAltaRows.push(row);
        else if (row.dias >= 30) moraMediaRows.push(row);
      }

      if (row.estado === "ANULADA" || !row.monthKey) return;

      const paidAmount =
        typeof row.pagado === "number" && Number.isFinite(row.pagado)
          ? Math.max(0, Number(row.pagado ?? 0))
          : row.estado === "PAGADA"
            ? Math.max(0, row.valor)
            : 0;

      chartMap[row.monthKey] = chartMap[row.monthKey] ?? { facturado: 0, pagado: 0, count: 0 };
      chartMap[row.monthKey].facturado += Math.max(0, row.valor);
      chartMap[row.monthKey].pagado += Math.min(Math.max(0, paidAmount), Math.max(0, row.valor));
      chartMap[row.monthKey].count += 1;
    });

    const totalPendingByType = Object.values(tipoMap).reduce((sum, value) => sum + value, 0);
    const colors: Record<string, string> = { ARL: "#0077c8", SEGUROS: "#cc0000", SALUD: "#2e8b7a", OTROS: "#82827f" };
    const sortedMonths = Object.keys(chartMap).sort((a, b) => a.localeCompare(b));

    return {
      facturado: totalFacturado,
      pagado: totalPagado,
      pendiente: totalPendiente,
      anulado: totalAnulado,
      nPend: totalPendCount,
      tipoBars: Object.entries(tipoMap)
        .sort((a, b) => b[1] - a[1])
        .map(([tipoLabel, valor]) => ({
          tipo: tipoLabel,
          valor,
          pct: totalPendingByType > 0 ? (valor / totalPendingByType * 100).toFixed(1) : "0.0",
          color: colors[tipoLabel] || "#82827f"
        })),
      moraAlta: moraAltaRows,
      moraMedia: moraMediaRows,
      chartMesData: {
        labels: sortedMonths.map((monthKey) => {
          const [year, month] = monthKey.split("-");
          return `${MONTHS_S[parseInt(month, 10)] ?? month}-${year.slice(2)}`;
        }),
        facturado: sortedMonths.map((monthKey) => Math.round(chartMap[monthKey].facturado)),
        pagado: sortedMonths.map((monthKey) => Math.round(Math.min(chartMap[monthKey].pagado, chartMap[monthKey].facturado))),
        meses: sortedMonths,
        totalMeses: sortedMonths.length
      }
    };
  }, [filtered]);
  const pct = facturado > 0 ? (pagado / facturado * 100).toFixed(1) : "0.0";

  const agingBuckets = useMemo(() => {
    const desde = getDateNum(desdeMes, desdeAnio);
    const hasta = getDateNum(hastaMes, hastaAnio);
    const q = deferredSearch;
    const buckets = {
      "0-30":  { count: 0, total: 0 },
      "31-60": { count: 0, total: 0 },
      "61-90": { count: 0, total: 0 },
      "90+":   { count: 0, total: 0 }
    };

    raw.facturas.forEach((r) => {
      if (r.estado !== "PENDIENTE") return;
      if (empresa !== "TODAS" && r.empresa !== empresa) return;
      if (tipo !== "all" && r.tipo !== tipo) return;
      if (q && !(r.companiaSearch.includes(q) || r.facturaSearch.includes(q))) return;
      const rDate = r.fechaFactMonthNum;
      if (desde && rDate && rDate < desde) return;
      if (hasta && rDate && rDate > hasta) return;

      const d = r.dias;
      const bucket = d > 90 ? "90+" : d >= 61 ? "61-90" : d >= 31 ? "31-60" : "0-30";
      buckets[bucket].count += 1;
      buckets[bucket].total += r.valor;
    });

    const totalPendiente = (Object.values(buckets) as Array<{ count: number; total: number }>).reduce((s, b) => s + b.total, 0);
    return { buckets, totalPendiente };
  }, [raw.facturas, empresa, tipo, deferredSearch, desdeMes, desdeAnio, hastaMes, hastaAnio]);

  // Resumen operativo de cartera (respeta filtro de empresa, vista global)
  const resumenStats = useMemo(() => {
    const aging = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
    const deudorMap = new Map<string, { total: number; maxDias: number; tipo: string }>();
    let facturado = 0;
    let pagado = 0;
    let pendiente = 0;
    let nPend = 0;

    raw.facturas.forEach((r) => {
      if (empresa !== "TODAS" && r.empresa !== empresa) return;
      if (r.estado !== "ANULADA") facturado += r.valor;
      if (r.estado === "PAGADA") {
        pagado += typeof r.pagado === "number" && Number.isFinite(r.pagado) ? Math.max(0, r.pagado) : Math.max(0, r.valor);
      }
      if (r.estado === "PENDIENTE") {
        pendiente += r.valor;
        nPend += 1;
        const d = r.dias;
        const b = d > 90 ? "90+" : d >= 61 ? "61-90" : d >= 31 ? "31-60" : "0-30";
        aging[b] += r.valor;
        const cur = deudorMap.get(r.compania) ?? { total: 0, maxDias: 0, tipo: r.tipo };
        cur.total += r.valor;
        cur.maxDias = Math.max(cur.maxDias, d);
        deudorMap.set(r.compania, cur);
      }
    });

    const eficiencia = facturado > 0 ? (pagado / facturado) * 100 : 0;
    const pctVencida = facturado > 0 ? (pendiente / facturado) * 100 : 0;
    const vencidaCritica = aging["61-90"] + aging["90+"];
    const topDeudores = [...deudorMap.entries()]
      .map(([compania, v]) => ({ compania, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
    return { facturado, pagado, pendiente, nPend, aging, eficiencia, pctVencida, vencidaCritica, topDeudores };
  }, [raw.facturas, empresa]);

  const aportesData = useMemo(() => computeAportesClientes(recaudosState, empresa), [recaudosState, empresa]);

  const planillaAlertCounts = useMemo(() => {
    let overdue = 0;
    let upcoming = 0;
    Object.values(plAlertas).forEach((a) => {
      if (a.worst === "overdue") overdue += 1;
      else if (a.worst === "upcoming") upcoming += 1;
    });
    return { overdue, upcoming };
  }, [plAlertas]);

  // Proyeccion
  const { projectionRows, proyeccionKpis } = useMemo(() => {
    const isSig = proyeccionSemana.startsWith("sig-");
    const activeData = isSig ? proyeccionSig : proyeccion;
    const rawRows = activeData?.proyecciones ?? [];
    const dashIdx = proyeccionSemana.indexOf("-");
    const weekPart = dashIdx >= 0 ? proyeccionSemana.slice(dashIdx + 1) : proyeccionSemana;

    if (weekPart === "todas") {
      return {
        projectionRows: rawRows,
        proyeccionKpis: {
           total: activeData?.total_proyectado ?? 0,
           alta: activeData?.total_alta ?? 0,
           media: activeData?.total_media ?? 0,
           baja: activeData?.total_baja ?? 0
        }
      };
    }

    const weekIndex = parseInt(weekPart, 10) - 1;
    const newRows = rawRows.map(r => {
       const ratio = r.distribucion_semanas?.[weekIndex] ?? 0.25;
       return { ...r, proyeccion: Math.round(r.proyeccion * ratio) };
    }).filter(r => r.proyeccion > 0);

    const tAlta = newRows.filter(p => p.estabilidad === "ALTA").reduce((s, p) => s + p.proyeccion, 0);
    const tMedia = newRows.filter(p => p.estabilidad === "MEDIA").reduce((s, p) => s + p.proyeccion, 0);
    const tBaja = newRows.filter(p => p.estabilidad === "BAJA").reduce((s, p) => s + p.proyeccion, 0);
    const tProyectado = tAlta + tMedia + tBaja;

    return {
       projectionRows: newRows.sort((a,b) => b.proyeccion - a.proyeccion),
       proyeccionKpis: { total: tProyectado, alta: tAlta, media: tMedia, baja: tBaja }
    };
  }, [proyeccion, proyeccionSig, proyeccionSemana]);
  const noRecurrentes = (proyeccionSemana.startsWith("sig-") ? proyeccionSig : proyeccion)?.no_recurrentes ?? [];

  // Recaudado en el mes proyectado (facturas PAGADAS ese mes ya registradas)
  const recaudadoMesProyeccion = useMemo(() => {
    if (proyeccionSemana.startsWith("sig-")) return 0;
    if (!proyeccion?.mes_proyeccion) return 0;
    const [mesLabel, anioStr] = proyeccion.mes_proyeccion.split("-");
    const mesNum = MES_LABELS.indexOf(mesLabel) + 1;
    const anioNum = parseInt(anioStr, 10);
    if (mesNum < 1 || !anioNum) return 0;
    return recaudosState
      .filter(r => Number(r.mes) === mesNum && Number(r.anio) === anioNum && r.estado === "PAGADA"
        && (empresa === "TODAS" || String(r.empresa ?? "").toUpperCase() === empresa))
      .reduce((s, r) => s + r.valor, 0);
  }, [proyeccion?.mes_proyeccion, recaudosState, empresa, proyeccionSemana]);

  const activeMesLabel = proyeccionSemana.startsWith("sig-")
    ? (proyeccionSig?.mes_proyeccion ?? nextMesLabel)
    : (proyeccion?.mes_proyeccion ?? "—");

  const projectionLabels = projectionRows.map(p => p.compania.length > 16 ? `${p.compania.slice(0, 16)}…` : p.compania);
  const allProjectionMonths = Array.from(new Set(projectionRows.flatMap(p => Object.keys(p.historico || {})))).sort();

  // Pending invoices top 3 for AI report
  const pendingTop3 = useMemo(() =>
    raw.facturas.filter(r => r.estado === "PENDIENTE").sort((a, b) => b.valor - a.valor).slice(0, 3),
    [raw.facturas]
  );

  // Planillas
  const plCompanies = useMemo(
    () => [...companias].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [companias]
  );
  const normalizedPlanillaData = useMemo(() => normalizePlanillaMap(plCompanies, planillaData), [plCompanies, planillaData]);
  const normalizedPlanillaSnapshot = useMemo(() => normalizePlanillaMap(plCompanies, planillaSnapshot), [plCompanies, planillaSnapshot]);
  const planillaDirtyCount = useMemo(
    () => countPlanillaFieldChanges(normalizedPlanillaData, normalizedPlanillaSnapshot, plCompanies),
    [normalizedPlanillaData, normalizedPlanillaSnapshot, plCompanies]
  );
  const hasUnsavedPlanillaChanges = planillaDirtyCount > 0;
  const tiposMap = useMemo(() => {
    const out: Record<string, string> = {};
    companias.forEach((c) => { out[c.nombre] = c.tipo; });
    return out;
  }, [companias]);
  const frecMap = useMemo(() => {
    const out: Record<string, 1 | 2> = {};
    companias.forEach((c) => { out[c.nombre] = c.frecuencia_quincenas; });
    return out;
  }, [companias]);
  const isFutureMonth = (plYear > now.getFullYear()) || (plYear === now.getFullYear() && plMonth >= now.getMonth());
  const isPastMonth = !isFutureMonth && !(plYear === now.getFullYear() && plMonth === now.getMonth());

  const totalEnviadas = plCompanies.reduce((s, c) => {
    const r = planillaData[planillaKey(c.nombre, c.tipo)];
    if (!r) return s;
    const q1 = r.q1 ? 1 : 0;
    const q2 = c.frecuencia_quincenas === 2 && r.q2 ? 1 : 0;
    return s + q1 + q2;
  }, 0);
  const totalFacturadas = plCompanies.reduce((s, c) => {
    const r = planillaData[planillaKey(c.nombre, c.tipo)];
    if (!r) return s;
    return s + (r.fact_q1 ? 1 : 0) + (c.frecuencia_quincenas === 2 && r.fact_q2 ? 1 : 0);
  }, 0);
  const maxEnv = plCompanies.reduce((s, c) => s + c.frecuencia_quincenas, 0);
  const pctEnv = maxEnv > 0 ? Math.round(totalEnviadas / maxEnv * 100) : 0;
  const pctFact = maxEnv > 0 ? Math.round(totalFacturadas / maxEnv * 100) : 0;

  const plKpis = useMemo(() => {
    let pq1 = 0, pq2 = 0, sf = 0, comp = 0;
    plCompanies.forEach((c) => {
      const r = planillaData[planillaKey(c.nombre, c.tipo)] || emptyPlanillaRow();
      if (!r.q1) pq1++;
      if (c.frecuencia_quincenas === 2 && !r.q2) pq2++;
      if (isPlanillaSinFacturar(r, c.frecuencia_quincenas)) sf++;
      if (isPlanillaCompleta(r, c.frecuencia_quincenas)) comp++;
    });
    return { pq1, pq2, sf, comp };
  }, [plCompanies, planillaData]);

  const filteredCompanies = useMemo(() => {
    const q = plSearchNombre.trim().toLowerCase();
    return plCompanies.filter((c) => {
      if (q && !c.nombre.toLowerCase().includes(q)) return false;
      if (plFiltroTipo !== "todos" && c.tipo !== plFiltroTipo) return false;
      if (plFiltroEstado !== "todos") {
        const r = planillaData[planillaKey(c.nombre, c.tipo)] || emptyPlanillaRow();
        if (plFiltroEstado === "pend_q1" && r.q1) return false;
        if (plFiltroEstado === "pend_q2") {
          if (c.frecuencia_quincenas === 1) return false;
          if (r.q2) return false;
        }
        if (plFiltroEstado === "sin_fact" && !isPlanillaSinFacturar(r, c.frecuencia_quincenas)) return false;
        if (plFiltroEstado === "completas" && !isPlanillaCompleta(r, c.frecuencia_quincenas)) return false;
      }
      return true;
    });
  }, [plCompanies, plFiltroTipo, plFiltroEstado, planillaData, plSearchNombre]);

  async function loadPlanillas(y = plYear, m = plMonth) {
    const res = await fetch(`/api/planillas?mes=${m + 1}&anio=${y}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(typeof data?.detail === "string" ? data.detail : "No fue posible cargar las planillas.");
    }
    const byKey = data as Record<string, PlanillaMap[string]>;
    const next: PlanillaMap = {};
    companias.forEach((c) => {
      const src = byKey[planillaKey(c.nombre, c.tipo)];
      if (src) next[planillaKey(c.nombre, c.tipo)] = { ...src };
    });
    const cloned = clonePlanillaMap(next);
    setPlanillaData(cloned);
    setPlanillaSnapshot(clonePlanillaMap(cloned));
    void loadPlanillaAlertas(y, m);
  }

  async function loadPlanillaAlertas(y = plYear, m = plMonth) {
    try {
      const res = await fetch(`/api/planillas/alertas?mes=${m + 1}&anio=${y}`);
      if (!res.ok) return;
      const data = await res.json();
      setPlAlertas((data?.alerts ?? {}) as PlanillaAlertMap);
    } catch {
      // las alertas son informativas; si fallan no interrumpimos la vista
    }
  }

  async function savePlanillas() {
    setSaving(true);
    const upsert = Object.entries(normalizedPlanillaData).map(([key, row]) => {
      const sep = key.indexOf("||");
      const compania = sep >= 0 ? key.slice(0, sep) : key;
      const tipo = sep >= 0 ? key.slice(sep + 2) : (tiposMap[compania] || "Seguros");
      return {
        compania,
        tipo,
        mes: plMonth + 1,
        anio: plYear,
        ...row
      };
    });
    try {
      const responses = await Promise.all(
        upsert.map((row) =>
          fetch("/api/planillas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(row)
          })
        )
      );
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        let detail = "";
        try {
          const payload = await failed.json() as { detail?: string };
          detail = payload.detail ?? "";
        } catch {
          detail = "";
        }
        throw new Error(detail || "No se pudieron guardar las planillas.");
      }
      setPlanillaSnapshot(clonePlanillaMap(normalizedPlanillaData));
      setToast({ kind: "success", title: "Cambios guardados correctamente", description: `Planillas ${plMesNombre(plYear, plMonth)} actualizadas.` });
    } catch (error) {
      setToast({
        kind: "error",
        title: "Error al guardar. Intenta de nuevo.",
        description: error instanceof Error ? error.message : "Se produjo un error guardando en Supabase."
      });
      throw error;
    } finally {
      setSaving(false);
    }
  }

  function discardPlanillaChanges() {
    setPlanillaData(clonePlanillaMap(planillaSnapshot));
  }

  function confirmPlanillaDiscard(message: string) {
    if (!hasUnsavedPlanillaChanges) return true;
    const confirmed = window.confirm(message);
    if (!confirmed) return false;
    discardPlanillaChanges();
    return true;
  }

  function plNavMes(dir: number) {
    if (!confirmPlanillaDiscard("Hay cambios sin guardar en Planillas. Si continúas, se descartarán. ¿Quieres seguir?")) return;
    let nm = plMonth + dir;
    let ny = plYear;
    if (nm < 0) { nm = 11; ny--; }
    if (nm > 11) { nm = 0; ny++; }
    setPlMonth(nm);
    setPlYear(ny);
    setPlanillaData({});
    setPlanillaSnapshot({});
    void loadPlanillas(ny, nm).catch((error) => {
      setToast({
        kind: "error",
        title: "Error al cargar planillas",
        description: error instanceof Error ? error.message : "No fue posible cambiar de periodo."
      });
    });
  }

  function updatePlanillaField(key: string, field: string, value: any) {
    setPlanillaData(prev => ({
      ...prev,
      [key]: { ...(prev[key] ?? emptyPlanillaRow()), [field]: value }
    }));
  }

  function handleTabChange(nextTab: TabKey) {
    if (nextTab === tab) return;
    if (!confirmPlanillaDiscard("Hay cambios sin guardar en Planillas. Si sales de esta pestaña, se descartarán. ¿Quieres continuar?")) return;
    setTab(nextTab);
  }

  function handleEmpresaChange(nextEmpresa: "CMYM" | "SYSO" | "SANUM" | "TODAS") {
    if (nextEmpresa === empresa) return;
    if (!confirmPlanillaDiscard("Hay cambios sin guardar en Planillas. Si cambias de empresa, se descartarán. ¿Quieres continuar?")) return;
    setEmpresa(nextEmpresa);
  }

  function upsertFacturaRow(nextRow: RecaudoRow, toastOptions?: FacturaToastOptions) {
    const targetKey = `${String(nextRow.empresa || "").toUpperCase()}::${nextRow.numero_factura}`;
    setRecaudosState((prev) => {
      const filteredRows = prev.filter((row) => `${String(row.empresa || "").toUpperCase()}::${row.numero_factura}` !== targetKey);
      return [nextRow, ...filteredRows];
    });
    setToast({ kind: "success", title: toastOptions?.title ?? "Factura guardada correctamente ✓", description: toastOptions?.description });
  }

  function upsertFacturasBatch(nextRows: RecaudoRow[], toastOptions?: FacturaToastOptions) {
    if (nextRows.length === 0) return;
    const keys = new Set(nextRows.map((row) => `${String(row.empresa || "").toUpperCase()}::${row.numero_factura}`));
    setRecaudosState((prev) => {
      const filteredRows = prev.filter((row) => !keys.has(`${String(row.empresa || "").toUpperCase()}::${row.numero_factura}`));
      return [...nextRows, ...filteredRows];
    });
    setToast({ kind: "success", title: toastOptions?.title ?? "Facturas guardadas ✓", description: toastOptions?.description });
  }

  function removeFacturaRow(target: { empresa: string; numero_factura: string }, toastOptions?: FacturaToastOptions) {
    const targetKey = `${target.empresa.toUpperCase()}::${target.numero_factura}`;
    setRecaudosState((prev) =>
      prev.filter((row) => `${String(row.empresa || "").toUpperCase()}::${row.numero_factura}` !== targetKey)
    );
    setToast({ kind: "success", title: toastOptions?.title ?? "Factura eliminada", description: toastOptions?.description });
  }

  function openCreateCompaniaModal() {
    setCompaniaError("");
    setCompaniaForm({ nombre: "", tipo: "Seguros", frecuencia_quincenas: 2, alertas_activas: true, portal_detalle: "", correo_remitente: "", correo_destino: "", recepcion_notas: "" });
    setCompaniaModal({ kind: "create" });
  }

  function openEditCompaniaModal(compania: PlanillaCompania) {
    setCompaniaError("");
    setCompaniaForm({
      nombre: compania.nombre,
      tipo: (compania.tipo === "ARL" || compania.tipo === "SALUD") ? compania.tipo : "Seguros",
      frecuencia_quincenas: compania.frecuencia_quincenas,
      alertas_activas: compania.alertas_activas !== false,
      portal_detalle: compania.portal_detalle ?? "",
      correo_remitente: compania.correo_remitente ?? "",
      correo_destino: compania.correo_destino ?? "",
      recepcion_notas: compania.recepcion_notas ?? ""
    });
    setCompaniaModal({ kind: "edit", compania });
  }

  function closeCompaniaModal() {
    if (companiaSaving) return;
    setCompaniaModal(null);
    setCompaniaError("");
  }

  async function submitCompaniaModal() {
    if (!companiaModal) return;
    const nombre = companiaForm.nombre.trim();
    if (!nombre) {
      setCompaniaError("El nombre es obligatorio");
      return;
    }

    setCompaniaSaving(true);
    setCompaniaError("");
    try {
      const payload = {
        nombre,
        tipo: companiaForm.tipo,
        frecuencia_quincenas: companiaForm.frecuencia_quincenas,
        alertas_activas: companiaForm.alertas_activas,
        portal_detalle: companiaForm.portal_detalle.trim(),
        correo_remitente: companiaForm.correo_remitente.trim(),
        correo_destino: companiaForm.correo_destino.trim(),
        recepcion_notas: companiaForm.recepcion_notas.trim()
      };
      if (companiaModal.kind === "create") {
        const res = await fetch("/api/planillas/companias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "No fue posible crear la compañía");
        const nueva = data.compania as PlanillaCompania;
        setCompanias((prev) => [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")));
      } else {
        const id = companiaModal.compania.id;
        const res = await fetch(`/api/planillas/companias/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.detail || "No fue posible actualizar la compañía");
        const actualizada = data.compania as PlanillaCompania;
        const prevCompania = companiaModal.compania;
        setCompanias((prev) =>
          prev.map((c) => (c.id === actualizada.id ? actualizada : c))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        );
        const prevKey = planillaKey(prevCompania.nombre, prevCompania.tipo);
        const nextKey = planillaKey(actualizada.nombre, actualizada.tipo);
        if (prevKey !== nextKey) {
          setPlanillaData((prev) => {
            if (!prev[prevKey]) return prev;
            const next = { ...prev };
            next[nextKey] = prev[prevKey];
            delete next[prevKey];
            return next;
          });
        }
      }
      setCompaniaModal(null);
      void loadPlanillaAlertas();
    } catch (error) {
      setCompaniaError(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setCompaniaSaving(false);
    }
  }

  async function deleteCompaniaModal() {
    if (!companiaModal || companiaModal.kind !== "edit") return;
    const compania = companiaModal.compania;
    if (!confirm(`¿Eliminar "${compania.nombre}"?`)) return;

    setCompaniaSaving(true);
    setCompaniaError("");
    try {
      const res = await fetch(`/api/planillas/companias/${compania.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detail || "No fue posible eliminar la compañía");
      setCompanias((prev) => prev.filter((c) => c.id !== compania.id));
      setPlanillaData((prev) => {
        const key = planillaKey(compania.nombre, compania.tipo);
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setCompaniaModal(null);
    } catch (error) {
      setCompaniaError(error instanceof Error ? error.message : "Error inesperado");
    } finally {
      setCompaniaSaving(false);
    }
  }

  async function exportFacturacionExcel() {
    if (!filtered.length) return;

    await downloadExcelWorkbook(
      `Cartera_CMYM_${new Date().toISOString().slice(0, 10)}.xlsx`,
      [{
        name: "Cartera",
        headers: ["Empresa", "Factura", "Compania", "Tipo", "Periodo", "Fecha Elaboracion", "Fecha Pago", "Valor", "Estado", "Dias Mora", "Fecha Est. Pago"],
        rows: filtered.map((r) => [r.empresa, r.factura, r.compania, r.tipo, r.periodo, r.fecha_fact, r.fecha_pago || "-", r.valor, r.estado, r.dias || 0, r.fecha_est || "-"]),
        cols: [{ wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 16 }],
      }]
    );
  }

  async function exportProjectionExcel() {
    if (!projectionRows.length) return;

    const recurrentHeaders = ["Compañía", "Tipo", "Proyección", "Variación %", "Estabilidad", "N° Meses", ...allProjectionMonths];
    recurrentHeaders.unshift("Empresa");
    const recurrentRows = projectionRows.map((p) => [
      p.empresa,
      p.compania,
      p.tipo,
      p.proyeccion,
      p.variacion,
      p.estabilidad,
      p.n_meses,
      ...allProjectionMonths.map((month) => p.historico?.[month] || 0)
    ]);

    const summaryRows: ExcelCell[][] = [
      ["Total Proyectado", proyeccionKpis.total],
      ["Alta Estabilidad", proyeccionKpis.alta],
      ["Media Estabilidad", proyeccionKpis.media],
      ["Baja Estabilidad", proyeccionKpis.baja],
      ["Mes Proyección", proyeccion?.mes_proyeccion ?? "-"]
    ];

    const sheets: ExcelSheetSpec[] = [
      {
        name: "Proyecciones",
        headers: recurrentHeaders,
        rows: recurrentRows,
        cols: [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, ...allProjectionMonths.map(() => ({ wch: 12 }))]
      },
      {
        name: "Resumen",
        headers: ["Indicador", "Valor"],
        rows: summaryRows,
        cols: [{ wch: 22 }, { wch: 16 }]
      }
    ];

    if (noRecurrentes.length) {
      sheets.splice(1, 0, {
        name: "No Recurrentes",
        headers: ["Compañía", "Tipo", "Total Histórico", "N° Meses"],
        rows: noRecurrentes.map((p) => [p.compania, p.tipo, p.total, p.n_meses]),
        cols: [{ wch: 30 }, { wch: 12 }, { wch: 18 }, { wch: 12 }]
      });
    }

    await downloadExcelWorkbook(
      `Proyeccion_CMYM_${new Date().toISOString().slice(0, 10)}.xlsx`,
      sheets
    );
  }

  const plMesNombre = (y: number, m: number) => `${MES_LABELS[m]}-${y}`;

  // Load planillas on mount
  useEffect(() => {
    if ((tab === "planillas" || tab === "resumen") && Object.keys(planillaData).length === 0) {
      void loadPlanillas().catch((error) => {
        setToast({
          kind: "error",
          title: "Error al cargar planillas",
          description: error instanceof Error ? error.message : "No fue posible cargar las planillas."
        });
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  useEffect(() => {
    if (!hasUnsavedPlanillaChanges) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsavedPlanillaChanges]);

  // Load projection on mount and whenever the selected company changes so chat always has data available.
  useEffect(() => {
    let cancelled = false;
    setLoadingProyeccion(true);
    setProyeccionError(null);
    const url = `/api/recaudos/proyeccion${empresa !== "TODAS" ? `?empresa=${empresa}` : ""}`;

    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("PROJECTION_FETCH_FAILED");
        }

        return response.json() as Promise<CarteraProjectionPayload>;
      })
      .then((data) => {
        if (!cancelled) {
          setProyeccion(data);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProyeccion((current) => current);
          setProyeccionError("No se pudo calcular la proyeccion.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProyeccion(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [empresa, proyeccionReloadKey]);

  // Fetch proyección mes siguiente (?siguiente=1 → incluye el mes actual como cerrado)
  useEffect(() => {
    let cancelled = false;
    setLoadingProyeccionSig(true);
    const sep = empresa !== "TODAS" ? `?empresa=${empresa}&siguiente=1` : `?siguiente=1`;
    fetch(`/api/recaudos/proyeccion${sep}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("FETCH_FAILED");
        return r.json() as Promise<CarteraProjectionPayload>;
      })
      .then((data) => { if (!cancelled) setProyeccionSig(data); })
      .catch(() => { if (!cancelled) setProyeccionSig(null); })
      .finally(() => { if (!cancelled) setLoadingProyeccionSig(false); });
    return () => { cancelled = true; };
  }, [empresa, proyeccionReloadKey]);

  const proyeccionLoadError = proyeccionError ? new Error(proyeccionError) : null;
  const proyeccionSkeleton = (
    <div style={{ display: "grid", gap: "16px" }}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 cartera-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`cartera-proyeccion-skeleton-${index}`} />)}
      </div>
      <ChartSkeleton height={300} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
  const mainTabs: Array<{ key: TabKey; label: string; icon: React.ReactNode }> = [
    { key: "resumen", label: "RESUMEN", icon: <PieChart key="rs" size={14} /> },
    { key: "facturacion", label: "FACTURACIÓN", icon: <Calculator key="f" size={14} /> },
    { key: "proyeccion", label: "PROYECCIÓN", icon: <TrendingUp key="p" size={14} /> },
    { key: "planillas", label: "CONTROL PLANILLAS", icon: <CheckSquare key="pl" size={14} /> },
    { key: "aportes", label: "APORTES POR CLIENTE", icon: <Users key="ap" size={14} /> }
  ];

  if (canEdit) {
    mainTabs.push({ key: "registro", label: "REGISTRO", icon: <Edit3 key="rg" size={14} /> });
  }

  return (
    <div className="module-page-standard cartera-legacy">
      <style jsx global>{`
        @keyframes planillasSavePulse {
          0% { box-shadow: 0 0 0 0 rgba(204, 0, 0, 0.32); }
          70% { box-shadow: 0 0 0 12px rgba(204, 0, 0, 0); }
          100% { box-shadow: 0 0 0 0 rgba(204, 0, 0, 0); }
        }
      `}</style>
      <Toast
        open={Boolean(toast)}
        kind={toast?.kind ?? "success"}
        title={toast?.title ?? ""}
        description={toast?.description}
        onClose={() => setToast(null)}
      />
      <ModalRecordatoriosCobranza
        open={recordatoriosOpen && !recordatorioTarget}
        refreshKey={recordatoriosRefreshKey}
        onClose={closeRecordatoriosModal}
        onSelectTercero={handleSelectRecordatorio}
      />
      <ModalGenerarCorreo
        open={recordatoriosOpen && Boolean(recordatorioTarget)}
        target={recordatorioTarget}
        onBack={handleBackFromRecordatorio}
        onSeguimientoSaved={handleSeguimientoSaved}
      />
      <AssistantShell
        title="Cartera"
        contextBuilder={() =>
          JSON.stringify({
            resumen: {
              total_facturado: raw.total_facturado,
              total_pagado: raw.total_pagado,
              total_pendiente: raw.total_pendiente,
              total_anulado: raw.total_anulado
            },
            proyeccion: {
              total: proyeccionKpis.total,
              alta: proyeccionKpis.alta,
              media: proyeccionKpis.media,
              baja: proyeccionKpis.baja,
              mes: proyeccion?.mes_proyeccion ?? ""
            },
            facturas: filtered.slice(0, 20).map((item) => ({
              factura: item.factura,
              compania: item.compania,
              tipo: item.tipo,
              periodo: item.periodo,
              fecha_fact: item.fecha_fact,
              fecha_pago: item.fecha_pago,
              valor: item.valor,
              pagado: item.pagado,
              estado: item.estado,
              dias: item.dias,
              empresa: item.empresa
            }))
          })
        }
        executiveReportTitle="REPORTE EJECUTIVO · IA"
        executiveReportPrompt={() =>
          `Actua como analista financiero senior. Redacta un resumen ejecutivo formal y analitico de 3 parrafos basandote EXACTAMENTE en estos datos del tablero demo de cartera:
- Total facturado: ${formatCompactCurrency(raw.total_facturado)}
- Total pagado: ${formatCompactCurrency(raw.total_pagado)}
- Total por cobrar: ${formatCompactCurrency(raw.total_pendiente)}
- Total anulado: ${formatCompactCurrency(raw.total_anulado)}
- Numero de facturas: ${formatNumber(raw.n_facturas)}
- Proyeccion del mes ${proyeccion?.mes_proyeccion ?? "actual"}: ${formatCompactCurrency(proyeccionKpis.total)}
- Estabilidad alta: ${formatCompactCurrency(proyeccionKpis.alta)}
- Estabilidad media: ${formatCompactCurrency(proyeccionKpis.media)}
- Estabilidad baja: ${formatCompactCurrency(proyeccionKpis.baja)}
- Top pendientes: ${pendingTop3.map(p => `${p.compania} (${formatCompactCurrency(p.valor)})`).join(", ") || "Sin datos"}

Instrucciones:
1. Parrafo 1: panorama general de facturacion, recaudo y cartera pendiente.
2. Parrafo 2: lectura de la proyeccion y estabilidad de companias.
3. Parrafo 3: conclusion ejecutiva breve con foco en gestion y recaudo.
No saludes y no hables con el usuario. Entrega solo el texto final del informe.`
        }
      />

      <ModuleHeader
        titulo="CARTERA"
        cutoffLabel={cutoffLabel}
        subtitulo="// CONTROL DEMO DE FACTURACION - ARL - SEGUROS - SALUD"
        actions={
          <CompanyFilter
            companies={["CMYM", "SYSO", "SANUM"]}
            value={empresa}
            onChange={(next) => handleEmpresaChange(next as "CMYM" | "SYSO" | "SANUM" | "TODAS")}
          />
        }
      />

      {/* â"€â"€ TABS â"€â"€ */}
      <div className="module-tab-nav cartera-main-tabs">
        {mainTabs.map(({ key, label, icon }) => (
          /*
          ["facturacion", "FACTURACIÓN", <Calculator key="f" size={14} />],
          ["proyeccion", "PROYECCIÓN", <TrendingUp key="p" size={14} />],
          ["planillas", "CONTROL PLANILLAS", <CheckSquare key="pl" size={14} />],
          ...(canEdit ? [["registro", "REGISTRO", <Edit3 key="rg" size={14} />]] : [])
        ] as const).map(([key, label, icon]) => (
          */
          <button
            key={key}
            className={`module-tab-btn flex items-center gap-2 ${tab === key ? "is-active" : ""}`}
            onClick={() => handleTabChange(key)}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════
           TAB RESUMEN
         ═══════════════════════════════ */}
      {tab === "resumen" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "14px" }}>
            <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #cc0000" }}>
              <p className="module-kpi__label" style={{ display: "flex", alignItems: "center", gap: "6px" }}><Wallet size={13} /> Cartera por cobrar</p>
              <p className="module-kpi__value">{formatCurrency(resumenStats.pendiente)}</p>
              <p className="module-kpi__sub">{resumenStats.pctVencida.toFixed(1)}% sobre lo facturado · {formatNumber(resumenStats.nPend)} facturas</p>
            </section>
            <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #2e8b7a" }}>
              <p className="module-kpi__label" style={{ display: "flex", alignItems: "center", gap: "6px" }}><TrendingUp size={13} /> Eficiencia de cobro</p>
              <p className="module-kpi__value" style={{ color: resumenStats.eficiencia >= 70 ? "#2e8b7a" : resumenStats.eficiencia >= 40 ? "#d97706" : "#cc0000" }}>{resumenStats.eficiencia.toFixed(1)}%</p>
              <p className="module-kpi__sub">{formatCompactCurrency(resumenStats.pagado)} recaudado de {formatCompactCurrency(resumenStats.facturado)}</p>
            </section>
            <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #ea580c" }}>
              <p className="module-kpi__label" style={{ display: "flex", alignItems: "center", gap: "6px" }}><AlertTriangle size={13} /> Mora crítica (+60 días)</p>
              <p className="module-kpi__value" style={{ color: resumenStats.vencidaCritica > 0 ? "#ea580c" : "var(--module-text)" }}>{formatCurrency(resumenStats.vencidaCritica)}</p>
              <p className="module-kpi__sub">{resumenStats.pendiente > 0 ? (resumenStats.vencidaCritica / resumenStats.pendiente * 100).toFixed(1) : "0.0"}% de la cartera por cobrar</p>
            </section>
            <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #d97706", cursor: "pointer" }} onClick={() => handleTabChange("planillas")}>
              <p className="module-kpi__label" style={{ display: "flex", alignItems: "center", gap: "6px" }}><CheckSquare size={13} /> Planillas atrasadas</p>
              <p className="module-kpi__value" style={{ color: planillaAlertCounts.overdue > 0 ? "#ea580c" : "#2e8b7a" }}>{planillaAlertCounts.overdue}</p>
              <p className="module-kpi__sub">{planillaAlertCounts.upcoming > 0 ? `${planillaAlertCounts.upcoming} por vencer · ` : ""}clic para ir a planillas</p>
            </section>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: "16px", alignItems: "start" }}>
            <div style={{ background: "var(--module-surface)", border: "1px solid var(--module-border)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,.03), 0 10px 28px rgba(0,0,0,.05)" }}>
              <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--module-text)", marginBottom: "16px" }}>Antigüedad de cartera</div>
              {resumenStats.pendiente > 0 ? (
                ([
                  { key: "0-30" as const, label: "0–30 días", color: "#2e8b7a" },
                  { key: "31-60" as const, label: "31–60 días", color: "#d97706" },
                  { key: "61-90" as const, label: "61–90 días", color: "#ea580c" },
                  { key: "90+" as const, label: "+90 días", color: "#cc0000" }
                ]).map((b) => {
                  const valor = resumenStats.aging[b.key];
                  const pct = resumenStats.pendiente > 0 ? (valor / resumenStats.pendiente * 100) : 0;
                  return (
                    <div key={b.key} style={{ marginBottom: "18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "6px" }}>
                        <span style={{ fontSize: ".82rem", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", display: "inline-flex", alignItems: "center", gap: "8px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: b.color }} /> {b.label}</span>
                        <span style={{ fontSize: ".82rem", fontWeight: 600, color: "var(--module-text)", fontFamily: "DM Sans,sans-serif" }}>{formatCompactCurrency(valor)} <span style={{ color: "#82827f", fontWeight: 400 }}>· {pct.toFixed(1)}%</span></span>
                      </div>
                      <div style={{ height: "11px", background: "var(--module-surface-2)", borderRadius: "6px", overflow: "hidden" }}>
                        <div style={{ width: `${Math.max(pct, valor > 0 ? 2 : 0)}%`, height: "100%", background: `linear-gradient(90deg, ${b.color}cc, ${b.color})`, borderRadius: "6px", transition: "width .4s ease" }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p style={{ fontSize: ".82rem", color: "#82827f", fontFamily: "DM Sans,sans-serif" }}>Sin cartera pendiente. 🎉</p>
              )}
              {resumenStats.pendiente > 0 && (
                <div style={{ marginTop: "6px", paddingTop: "14px", borderTop: "1px solid var(--module-border)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: ".7rem", color: "#82827f", fontFamily: "DM Sans,sans-serif", textTransform: "uppercase", letterSpacing: ".05em" }}>Total por cobrar</span>
                  <span style={{ fontSize: ".98rem", fontWeight: 700, color: "var(--module-text)", fontFamily: "DM Sans,sans-serif" }}>{formatCurrency(resumenStats.pendiente)}</span>
                </div>
              )}
            </div>

            <div style={{ background: "var(--module-surface)", border: "1px solid var(--module-border)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,.03), 0 10px 28px rgba(0,0,0,.05)" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--module-text)" }}>Top deudores</span>
                <button type="button" onClick={() => { setOnlyMora(true); setEstado("PENDIENTE"); handleTabChange("facturacion"); }} style={{ display: "inline-flex", alignItems: "center", gap: "4px", background: "transparent", border: "none", color: "#cc0000", fontSize: ".72rem", fontFamily: "DM Sans,sans-serif", cursor: "pointer" }}>Ver todo <ArrowRight size={12} /></button>
              </div>
              {resumenStats.topDeudores.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {resumenStats.topDeudores.map((d, i) => (
                    <div key={d.compania} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--module-border)" }}>
                      <span style={{ width: "23px", height: "23px", borderRadius: "50%", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: ".68rem", color: "#82827f", fontFamily: "Space Mono,monospace", fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: ".8rem", fontWeight: 600, color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.compania}</div>
                        <div style={{ fontSize: ".68rem", color: d.maxDias > 60 ? "#cc0000" : d.maxDias > 30 ? "#d97706" : "#82827f", fontFamily: "DM Sans,sans-serif", marginTop: "1px" }}>hasta {d.maxDias} días de atraso</div>
                      </div>
                      <span style={{ fontSize: ".84rem", fontWeight: 700, color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", flexShrink: 0 }}>{formatCompactCurrency(d.total)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: ".82rem", color: "#82827f", fontFamily: "DM Sans,sans-serif" }}>Sin deudores pendientes.</p>
              )}
            </div>
          </div>

          <div style={{ background: "var(--module-surface)", border: "1px solid var(--module-border)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,.03), 0 10px 28px rgba(0,0,0,.05)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", flexWrap: "wrap", gap: "8px" }}>
              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--module-text)" }}>Estado de planillas · {plMesNombre(plYear, plMonth)}</span>
              <button type="button" onClick={() => handleTabChange("planillas")} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(204,0,0,.08)", border: "1px solid #cc0000", borderRadius: "6px", padding: "5px 11px", color: "#cc0000", fontFamily: "DM Sans,sans-serif", fontSize: ".74rem", cursor: "pointer" }}>Control Planillas <ArrowRight size={12} /></button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: "12px" }}>
              {[
                { label: "Enviadas a facturar", value: `${totalEnviadas}/${maxEnv}`, color: "#0077c8" },
                { label: "Facturadas", value: `${totalFacturadas}/${maxEnv}`, color: "#2e8b7a" },
                { label: "Atrasadas", value: String(planillaAlertCounts.overdue), color: planillaAlertCounts.overdue > 0 ? "#ea580c" : "#82827f" },
                { label: "Por vencer", value: String(planillaAlertCounts.upcoming), color: planillaAlertCounts.upcoming > 0 ? "#d97706" : "#82827f" }
              ].map((s) => (
                <div key={s.label} style={{ background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderLeft: `3px solid ${s.color}`, borderRadius: "11px", padding: "13px 15px" }}>
                  <div style={{ fontSize: "1.5rem", fontWeight: 700, color: s.color, fontFamily: "Space Mono,monospace", lineHeight: 1.1 }}>{s.value}</div>
                  <div style={{ fontSize: ".7rem", color: "#82827f", fontFamily: "DM Sans,sans-serif", textTransform: "uppercase", letterSpacing: ".04em", marginTop: "4px" }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           TAB FACTURACIÓN
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {tab === "facturacion" && (
        <>
          {/* KPI GRID */}
          <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-3 cartera-kpi-grid">
            {/* k1 — Total Facturado con progress bar */}
            <section className="module-card module-kpi module-card--plain relative overflow-hidden" style={{ borderTop: "3px solid #2e8b7a" }}>
              <p className="module-kpi__label">Total Facturado</p>
              <p className="module-kpi__value">{formatCurrency(facturado)}</p>
              <p className="module-kpi__sub">{formatNumber(filtered.length)} facturas</p>
              <div style={{ marginTop: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "Space Mono,monospace", fontSize: ".62rem", color: "#82827f", marginBottom: "3px" }}>
                  <span>Recaudado</span><span>{pct}%</span>
                </div>
                <div style={{ background: "var(--module-surface-2)", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: "4px", background: "#2e8b7a", width: `${pct}%`, transition: "width 1s ease" }} />
                </div>
              </div>
            </section>

            {/* k2 — Total Pagado */}
            <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #16a34a" }}>
              <p className="module-kpi__label">Total Pagado</p>
              <p className="module-kpi__value" style={{ color: "#2e8b7a" }}>{formatCurrency(pagado)}</p>
              <p className="module-kpi__sub">{pct}% del total facturado</p>
            </section>

            {/* k3 — Por Cobrar */}
            <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #d97706" }}>
              <p className="module-kpi__label">Por Cobrar</p>
              <p className="module-kpi__value" style={{ color: "#f59e0b" }}>{formatCurrency(pendiente)}</p>
              <p className="module-kpi__sub">{formatNumber(nPend)} facturas pendientes</p>
            </section>

          </div>

          {/* CHARTS ROW */}
          <div style={{ display: "grid", gap: "16px", gridTemplateColumns: showTipoBlocks ? "2fr 1fr" : "1fr", marginBottom: "16px" }} className="max-[900px]:!grid-cols-1 cartera-chart-row">
            {/* Facturado vs Pagado */}
            <DashboardCard className="module-card--plain">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>FACTURADO VS PAGADO POR MES</span>
                <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>COP</span>
              </div>
              {(() => {
                const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
                const lastMeses = chartMesData.meses.slice(-12);
                const currentIdx = lastMeses.findIndex(m => m === currentMonthKey);
                const enCursoPlugin = {
                  id: "enCurso",
                  afterDatasetsDraw(chart: any) {
                    if (currentIdx === -1) return;
                    const { ctx } = chart;
                    const meta = chart.getDatasetMeta(0);
                    const bar = meta.data[currentIdx];
                    if (!bar) return;
                    ctx.save();
                    ctx.fillStyle = "rgba(130,130,127,.7)";
                    ctx.font = "700 8px Space Mono, monospace";
                    ctx.textAlign = "center";
                    ctx.fillText("EN CURSO", bar.x, chart.chartArea.top + 10);
                    ctx.restore();
                  }
                };
                return (
                  <div style={{ position: "relative", height: "220px" }}>
                    <Bar
                      data={{
                        labels: chartMesData.labels.slice(-12),
                        datasets: [
                          { label: "Facturado", data: chartMesData.facturado.slice(-12), backgroundColor: "rgba(130,130,127,.3)", borderColor: "#82827f", borderWidth: 1, borderRadius: 4 },
                          { label: "Pagado", data: chartMesData.pagado.slice(-12), backgroundColor: "rgba(46,139,122,.6)", borderColor: "#2e8b7a", borderWidth: 1, borderRadius: 4 }
                        ]
                      }}
                      plugins={[enCursoPlugin]}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: {
                          legend: { display: true, position: "bottom", labels: { color: "#82827f", font: { family: "Space Mono", size: 9 }, boxWidth: 10, padding: 12 } },
                          tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: $${Math.round(ctx.raw as number).toLocaleString("es-CO")}` } }
                        },
                        scales: {
                          x: { grid: { color: "rgba(224,217,208,.5)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 10 } } },
                          y: { grid: { color: "rgba(224,217,208,.5)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 10 }, callback: v => `$${(Number(v) / 1e6).toFixed(0)}M` } }
                        }
                      }}
                    />
                  </div>
                );
              })()}
            </DashboardCard>

            {showTipoBlocks ? <>
            {/* Pendiente por Tipo */}
            <DashboardCard className="module-card--plain">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>PENDIENTE POR TIPO</span>
                <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>por cobrar</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {tipoBars.length > 0 ? tipoBars.map(({ tipo: t, valor, pct: p, color }) => (
                  <div key={t} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: ".8rem", fontWeight: 600 }}>{t}</span>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: "#cc0000" }}>{formatCurrency(valor)} · {p}%</span>
                    </div>
                    <div style={{ background: "var(--module-surface-2)", borderRadius: "4px", height: "10px", overflow: "hidden" }}>
                      <div style={{ width: `${p}%`, height: "100%", borderRadius: "4px", background: color }} />
                    </div>
                  </div>
                )) : <div style={{ color: "#82827f", fontSize: ".8rem", textAlign: "center", padding: "20px" }}>Sin pendientes en este filtro</div>}
              </div>
            </DashboardCard>
            </> : null}
          </div>

          {/* FILTERS BAR */}
          <div className="cartera-filter-bar" style={{ display: "flex", gap: "10px", marginBottom: "8px", flexWrap: "wrap", alignItems: "center", background: "var(--module-surface)", border: "1px solid var(--module-border)", borderRadius: "12px", padding: "14px 16px" }}>
            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", letterSpacing: ".06em" }}>ESTADO:</span>
            {[
              { val: "all", label: "Todos", icon: null, activeStyle: { background: "rgba(204,0,0,.08)", borderColor: "#cc0000", color: "#cc0000" } },
              { val: "PENDIENTE", label: "Pendiente", icon: <Clock size={14} />, activeStyle: { background: "rgba(245,158,11,.1)", borderColor: "#f59e0b", color: "#f59e0b" } },
              { val: "PAGADA", label: "Pagada", icon: <CheckCircle size={14} />, activeStyle: { background: "rgba(46,139,122,.1)", borderColor: "#2e8b7a", color: "#2e8b7a" } },
              { val: "ANULADA", label: "Anulada", icon: <XCircle size={14} />, activeStyle: { background: "rgba(130,130,127,.1)", borderColor: "#82827f", color: "#82827f" } }
            ].map(({ val, label, icon, activeStyle }) => (
              <button key={val} onClick={() => setEstado(val)} style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                background: estado === val ? activeStyle.background : "var(--module-surface-2)",
                border: `1px solid ${estado === val ? activeStyle.borderColor : "var(--module-border)"}`,
                borderRadius: "6px", height: "30px", padding: "5px 12px",
                color: estado === val ? activeStyle.color : "#82827f",
                fontFamily: "DM Sans,sans-serif", fontSize: ".78rem", cursor: "pointer", transition: "all 0.2s"
              }}>
                {icon ? <span style={{ fontSize: ".82rem", lineHeight: 1 }}>{icon}</span> : null}
                {label}
              </button>
            ))}

            <>
            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", letterSpacing: ".06em", marginLeft: "8px" }}>TIPO:</span>
            {tipoFilterOptions.map(v => (
              <button key={v} onClick={() => setTipo(v)} style={{
                display: "inline-flex", alignItems: "center", gap: "5px",
                background: tipo === v ? "rgba(204,0,0,.08)" : "var(--module-surface-2)",
                border: `1px solid ${tipo === v ? "#cc0000" : "var(--module-border)"}`,
                borderRadius: "6px", height: "30px", padding: "5px 12px",
                color: tipo === v ? "#cc0000" : "#82827f",
                fontFamily: "DM Sans,sans-serif", fontSize: ".78rem", cursor: "pointer", transition: "all 0.2s"
              }}>{v === "all" ? "Todos" : v}</button>
            ))}
            </>

            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", letterSpacing: ".06em", marginLeft: "8px" }}>DESDE:</span>
            <div style={{ display: "flex", gap: "0", alignItems: "center", border: "1px solid var(--module-border)", borderRadius: "8px", overflow: "hidden" }}>
              <select value={desdeMes} onChange={e => setDesdeMes(e.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "none", borderRight: "1px solid var(--module-border)", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                <option value="">Mes</option>
                {MONTHS_S.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
              </select>
              <select value={desdeAnio} onChange={e => setDesdeAnio(e.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "none", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                <option value="">Año</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", letterSpacing: ".06em", marginLeft: "4px" }}>HASTA:</span>
            <div style={{ display: "flex", gap: "0", alignItems: "center", border: "1px solid var(--module-border)", borderRadius: "8px", overflow: "hidden" }}>
              <select value={hastaMes} onChange={e => setHastaMes(e.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "none", borderRight: "1px solid var(--module-border)", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                <option value="">Mes</option>
                {MONTHS_S.slice(1).map((m, i) => <option key={i + 1} value={String(i + 1).padStart(2, "0")}>{m}</option>)}
              </select>
              <select value={hastaAnio} onChange={e => setHastaAnio(e.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "none", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                <option value="">Año</option>
                {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
              <div style={{ position: "relative" }}>
                <Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "#82827f" }} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar compañía o N° factura..." style={{ height: "32px", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "6px 12px 6px 30px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".82rem", outline: "none", width: "240px" }} />
              </div>

              <button onClick={limpiarFiltros} style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(204,0,0,.08)", border: "1px solid #cc0000", borderRadius: "6px", height: "30px", padding: "5px 12px", color: "#cc0000", fontFamily: "DM Sans,sans-serif", fontSize: ".78rem", cursor: "pointer", transition: "all 0.2s", marginLeft: "4px" }}>
                <X size={13} color="#cc0000" />
                Limpiar
              </button>
            </div>
          </div>

          {/* tinfo */}
          <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", marginTop: "6px", marginBottom: "6px" }}>
            {formatNumber(filtered.length)} facturas · Total: {formatCurrency(filtered.reduce((s, r) => s + r.valor, 0))}
            {onlyMora ? " · Mora > 30 dias" : ""}
          </p>

          {/* AGING DE CARTERA */}
          {agingBuckets.totalPendiente > 0 && (
            <div style={{ marginBottom: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", marginBottom: "6px" }}>
                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "#82827f", letterSpacing: ".08em", textTransform: "uppercase" }}>
                  Aging de cartera {agingBucket !== "all" ? `· filtrado: ${agingBucket} días` : "· clic en un rango para filtrar"}
                </span>
                <button
                  onClick={exportFacturacionExcel}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, letterSpacing: ".06em", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", color: "#82827f", borderRadius: "6px", padding: "7px 14px", cursor: "pointer", textTransform: "uppercase" }}
                ><FileSpreadsheet size={14} /> Exportar Excel</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "8px" }} className="max-[700px]:!grid-cols-2">
                {([
                  { key: "0-30",  label: "0-30 días",  color: "#2e8b7a", subtitle: "sana" },
                  { key: "31-60", label: "31-60 días", color: "#f59e0b", subtitle: "atención" },
                  { key: "61-90", label: "61-90 días", color: "#ea580c", subtitle: "mora" },
                  { key: "90+",   label: "+90 días",   color: "#cc0000", subtitle: "crítica" }
                ] as const).map((b) => {
                  const data = agingBuckets.buckets[b.key];
                  const pct = agingBuckets.totalPendiente > 0 ? (data.total / agingBuckets.totalPendiente * 100).toFixed(1) : "0.0";
                  const isActive = agingBucket === b.key;
                  return (
                    <button
                      key={b.key}
                      onClick={() => setAgingBucket(isActive ? "all" : b.key)}
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        border: `1px solid ${isActive ? b.color : "var(--module-border)"}`,
                        background: isActive ? `${b.color}14` : "var(--module-surface)",
                        borderRadius: "10px",
                        borderTop: `3px solid ${b.color}`,
                        cursor: "pointer",
                        transition: "all 0.15s",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px"
                      }}
                      title={isActive ? "Clic para mostrar todos" : `Filtrar tabla por ${b.label}`}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: b.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>
                          {b.label}
                        </span>
                        <span style={{ fontSize: ".62rem", color: "#82827f", textTransform: "uppercase", letterSpacing: ".06em" }}>{b.subtitle}</span>
                      </div>
                      <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".95rem", fontWeight: 700, color: "var(--module-text)" }}>
                        {formatCurrency(data.total)}
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f" }}>
                        <span>{data.count} factura{data.count !== 1 ? "s" : ""}</span>
                        <span style={{ fontWeight: 700, color: b.color }}>{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {(moraAlta.length > 0 || moraMedia.length > 0) && (
                <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                  <button
                    onClick={verFacturasMora}
                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontFamily: "Space Mono,monospace", fontSize: ".65rem", color: "#cc0000", background: "transparent", border: "1px solid rgba(204,0,0,.3)", borderRadius: "6px", padding: "5px 12px", cursor: "pointer" }}
                  >
                    <TriangleAlert size={12} /> Ver todas las facturas en mora (+30 días)
                  </button>
                  {canEdit && (
                    <button
                      onClick={openRecordatoriosModal}
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "Space Mono,monospace", fontSize: ".65rem", fontWeight: 700, color: "#fff", background: "#cc0000", border: "1px solid #cc0000", borderRadius: "6px", padding: "5px 12px", cursor: "pointer" }}
                    >
                      <MailPlus size={12} />
                      Generar recordatorios
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* EXPORT EXCEL (cuando no hay aging visible) */}
          {agingBuckets.totalPendiente === 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
              <button
                onClick={exportFacturacionExcel}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, letterSpacing: ".06em", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", color: "#82827f", borderRadius: "6px", padding: "7px 14px", cursor: "pointer", textTransform: "uppercase" }}
              ><FileSpreadsheet size={14} /> Exportar Excel</button>
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState message="No hay facturas con esos filtros." />
          ) : (
            <>
            {filtered.length > 300 && (
              <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#f59e0b", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.25)", borderRadius: "8px", padding: "6px 14px", marginBottom: "6px" }}>
                Mostrando 300 de {formatNumber(filtered.length)} facturas — aplica filtros para ver todas.
              </p>
            )}
            <div ref={facturacionTableRef} className="module-table-wrap" style={{ maxHeight: "500px" }}>
              <table className={`module-table cartera-facturacion-table ${empresa === "TODAS" ? "cartera-facturacion-table--with-company" : "cartera-facturacion-table--without-company"}`} style={{ tableLayout: "fixed", width: "100%" }}>
                <colgroup>
                  {empresa === "TODAS" ? <col style={{ width: "80px" }} /> : null}
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "260px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "130px" }} />
                  <col style={{ width: "110px" }} />
                  <col style={{ width: "90px" }} />
                  <col style={{ width: "130px" }} />
                </colgroup>
                <thead>
                  <tr>
                    {[
                      ...(empresa === "TODAS" ? [{ label: "EMPRESA", col: null }] : []),
                      { label: "N° FACTURA", col: "factura" },
                      { label: "TERCERO", col: "compania" },
                      { label: "TIPO", col: null },
                      { label: "PERIODO", col: "periodo" },
                      { label: "F. ELABORACIÓN", col: "fecha_fact" },
                      { label: "FECHA PAGO", col: "fecha_pago" },
                      { label: "VALOR", col: "valor" },
                      { label: "ESTADO", col: null },
                      { label: "DÍAS MORA", col: "dias" },
                      { label: "FECHA EST. PAGO", col: null }
                    ].map(({ label, col }) => (
                      <th key={label} onClick={col ? () => sortBy(col) : undefined} style={col ? { cursor: "pointer", userSelect: "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } : { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {label}{col && sortCol === col ? (sortAsc ? " ↑" : " ↓") : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 300).map((r) => {
                    const db = diasBadge(r.dias, r.estado);
                    return (
                      <tr key={`${r.empresa}-${r.factura}-${r.compania}`}>
                        {empresa === "TODAS" ? (
                          <td>
                            <CompanyBadge empresa={r.empresa} compact />
                          </td>
                        ) : null}
                        <td><span style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{getFacturaSuffix(r.factura)}</span></td>
                        <td style={{ maxWidth: 0 }}><span title={r.compania} style={{ fontWeight: 700, fontSize: ".82rem", color: "#1a1a1a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>{r.compania.toUpperCase()}</span></td>
                        <td><span style={{ ...Object.fromEntries((tipoBadge[r.tipo] || "background:rgba(130,130,127,.1);color:#82827f").split(";").filter(Boolean).map(s => s.split(":").map(x => x.trim()) as [string, string])), ...{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: ".7rem", fontFamily: "Space Mono,monospace", fontWeight: 700 } }}>{r.tipo}</span></td>
                        <td><span style={{ fontFamily: "Space Mono,monospace", fontSize: ".75rem", color: "#374151" }}>{formatPeriodo(r.periodo)}</span></td>
                        <td><span style={{ fontFamily: "Space Mono,monospace", fontSize: ".75rem", color: "#374151" }}>{r.fecha_fact}</span></td>
                        <td><span style={{ fontFamily: "Space Mono,monospace", fontSize: ".75rem", color: "#374151" }}>{r.fecha_pago || "-"}</span></td>
                        <td><span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700, color: "#dc2626" }}>{formatCurrency(r.valor)}</span></td>
                        <td>
                          <span style={{ ...Object.fromEntries((estadoBadge[r.estado] || "background:rgba(130,130,127,.12);color:#82827f").split(";").filter(Boolean).map(s => s.split(":").map(x => x.trim()) as [string, string])), ...{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "20px", fontSize: ".65rem", fontFamily: "Space Mono,monospace", fontWeight: 700 } }}>
                            {estadoIcon[r.estado] ?? ""} {r.estado}
                          </span>
                        </td>
                        <td>
                          {db ? (
                            <span style={{ ...Object.fromEntries(db.style.split(";").filter(Boolean).map(s => s.split(":").map(x => x.trim()) as [string, string])), ...{ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: ".65rem", fontFamily: "Space Mono,monospace", fontWeight: 700 } }}>{db.label}</span>
                          ) : <span style={{ color: "#82827f" }}>-</span>}
                        </td>
                        <td>
                          {r.fecha_est && r.fecha_est !== "-"
                            ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: "#374151" }}>{r.fecha_est} {r.semaforo && semColor[r.semaforo] ? <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "999px", background: semColor[r.semaforo], boxShadow: `0 0 0 2px ${semColor[r.semaforo]}22, 0 0 8px ${semColor[r.semaforo]}55`, flexShrink: 0 }} /> : null}</span>
                            : <span style={{ color: "#82827f" }}>-</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}

          {/* FOOTER */}
          <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid var(--module-border)", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".6rem", color: "#82827f" }}>FUENTE: dataset demo local</span>
            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".6rem", color: "#82827f" }}>{formatNumber(filtered.length)} FACTURAS · {formatNumber(nPend)} PENDIENTES</span>
          </div>
        </>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           TAB PROYECCIÓN
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {tab === "proyeccion" && (
        <LoadingState
          isLoading={loadingProyeccion}
          error={proyeccionLoadError}
          skeleton={proyeccionSkeleton}
          onRetry={() => setProyeccionReloadKey((current) => current + 1)}
          errorMessage="No se pudo cargar la proyeccion."
        >
      {tab === "proyeccion" && loadingProyeccion && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 24px" }}>
          <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".8rem", color: "#82827f" }}>Calculando proyección…</p>
        </div>
      )}

      {tab === "proyeccion" && !loadingProyeccion && (
        <>
          {/* Export button & Week Filter */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
            <div style={{ position: "relative", display: "inline-block" }}>
              <select
                value={proyeccionSemana}
                onChange={e => setProyeccionSemana(e.target.value)}
                style={{
                  appearance: "none",
                  padding: "7px 32px 7px 14px",
                  borderRadius: "6px",
                  border: "1px solid var(--module-border)",
                  background: "var(--module-surface)",
                  color: "#82827f",
                  fontFamily: "Space Mono,monospace",
                  fontSize: ".68rem",
                  fontWeight: 700,
                  letterSpacing: ".06em",
                  outline: "none",
                  cursor: "pointer",
                  textTransform: "uppercase",
                  transition: "all 0.2s ease"
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = "#2e8b7a"}
                onMouseOut={e => e.currentTarget.style.borderColor = "var(--module-border)"}
              >
                <optgroup label={`— ${proyeccion?.mes_proyeccion ?? "MES ACTUAL"} —`}>
                  <option value="actual-todas">Mes Completo</option>
                  {(proyeccion?.semanas_mes ?? [
                    { semana: 1, label: "1-7" },
                    { semana: 2, label: "8-14" },
                    { semana: 3, label: "15-21" },
                    { semana: 4, label: "22+" },
                  ]).map(s => (
                    <option key={`actual-${s.semana}`} value={`actual-${s.semana}`}>Sem. {s.semana} ({s.label})</option>
                  ))}
                </optgroup>
                <optgroup label={`— ${nextMesLabel} —`}>
                  <option value="sig-todas">{loadingProyeccionSig ? "Cargando…" : "Mes Completo"}</option>
                  {sigSemanas.map(s => (
                    <option key={`sig-${s.semana}`} value={`sig-${s.semana}`}>Sem. {s.semana} ({s.label})</option>
                  ))}
                </optgroup>
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#82827f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            <button onClick={exportProjectionExcel} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, letterSpacing: ".06em", background: "var(--module-surface)", border: "1px solid rgba(46,139,122,.25)", color: "#2e8b7a", borderRadius: "6px", padding: "7px 14px", cursor: "pointer", textTransform: "uppercase" }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Excel
            </button>
          </div>

          {/* KPIs */}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5 cartera-kpi-grid">
            <section className="module-card module-kpi">
              <p className="module-kpi__label">Total Proyectado</p>
              <p className="module-kpi__value">{formatCurrency(proyeccionKpis.total)}</p>
              <p className="module-kpi__sub">Mes: {activeMesLabel}</p>
            </section>
            <section className="module-card module-kpi">
              <p className="module-kpi__label">Recaudado</p>
              <p className="module-kpi__value" style={{ color: recaudadoMesProyeccion > 0 ? "#2e8b7a" : "inherit" }}>
                {formatCurrency(recaudadoMesProyeccion)}
              </p>
              <p className="module-kpi__sub">
                {proyeccionKpis.total > 0
                  ? `${(recaudadoMesProyeccion / proyeccionKpis.total * 100).toFixed(1)}% del proyectado`
                  : "sin proyección"}
              </p>
            </section>
            <section className="module-card module-kpi" style={{ "--card-bar": "#2e8b7a", "--card-bar-soft": "#2e8b7a" } as CSSProperties}>
              <p className="module-kpi__label">Estabilidad Alta</p>
              <p className="module-kpi__value" style={{ color: "#2e8b7a" }}>{formatCurrency(proyeccionKpis.alta)}</p>
              <p className="module-kpi__sub">variación &lt;15%</p>
            </section>
            <section className="module-card module-kpi" style={{ "--card-bar": "#f59e0b", "--card-bar-soft": "#f59e0b" } as CSSProperties}>
              <p className="module-kpi__label">Estabilidad Media</p>
              <p className="module-kpi__value" style={{ color: "#f59e0b" }}>{formatCurrency(proyeccionKpis.media)}</p>
              <p className="module-kpi__sub">variación 15-40%</p>
            </section>
            <section className="module-card module-kpi" style={{ "--card-bar": "#cc0000", "--card-bar-soft": "#cc0000" } as CSSProperties}>
              <p className="module-kpi__label">Estabilidad Baja</p>
              <p className="module-kpi__value" style={{ color: "#cc0000" }}>{formatCurrency(proyeccionKpis.baja)}</p>
              <p className="module-kpi__sub">variación &gt;40%</p>
            </section>
          </div>

          {/* Charts row */}
          <div style={{ display: "grid", gap: "16px", gridTemplateColumns: "1.35fr .65fr", marginBottom: "16px" }} className="max-[900px]:!grid-cols-1">
            <DashboardCard>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>PROYECCIÓN POR COMPAÑÍA</span>
                <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>{activeMesLabel}</span>
              </div>
              <div style={{ position: "relative", height: "240px" }}>
                <Bar
                  data={{
                    labels: projectionLabels,
                    datasets: [{ label: "Proyección", data: projectionRows.map(p => p.proyeccion), backgroundColor: projectionRows.map(p => PROJECTION_COLORS[p.estabilidad]), borderRadius: 4, borderWidth: 0 }]
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                      legend: { display: false },
                      tooltip: { callbacks: { label: ctx => formatCurrency(ctx.raw as number) } }
                    },
                    scales: {
                      x: { ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 } }, grid: { display: false } },
                      y: { ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 }, callback: v => `$${(Number(v) / 1e6).toFixed(0)}M` }, grid: { color: "rgba(224,217,208,.4)" } }
                    }
                  }}
                />
              </div>
            </DashboardCard>

            <DashboardCard>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>POR ESTABILIDAD</span>
                <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>% del total</span>
              </div>
              <div style={{ position: "relative", height: "160px" }}>
                <Doughnut
                  data={{
                    labels: ["Alta", "Media", "Baja"],
                    datasets: [{ data: [proyeccionKpis.alta, proyeccionKpis.media, proyeccionKpis.baja], backgroundColor: ["rgba(46,139,122,.8)", "rgba(245,158,11,.8)", "rgba(204,0,0,.7)"], borderWidth: 0 }]
                  }}
                  options={{ responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${formatCurrency(ctx.raw as number)}` } } } }}
                />
              </div>
              <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                {([["ALTA", proyeccionKpis.alta, "#2e8b7a"], ["MEDIA", proyeccionKpis.media, "#f59e0b"], ["BAJA", proyeccionKpis.baja, "#cc0000"]] as const).map(([l, v, c]) => {
                  const pctV = (proyeccionKpis.total) > 0 ? (v / ((proyeccionKpis.total || 1)) * 100).toFixed(1) : "0.0";
                  return (
                    <div key={l} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: c, flexShrink: 0 }} />
                      <span style={{ fontSize: ".7rem", color: "#82827f", flex: 1 }}>Estab. {l}</span>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700 }}>{formatCurrency(v)}</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f" }}>{pctV}%</span>
                    </div>
                  );
                })}
              </div>
            </DashboardCard>
          </div>

          {/* Detalle compañías recurrentes */}
          <DashboardCard className="cartera-planillas-header">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>DETALLE — COMPAÑÍAS RECURRENTES</span>
              <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>mediana últ. meses disponibles</span>
            </div>
            {projectionRows.length === 0 ? (
              <EmptyState message="Sin proyecciones disponibles." />
            ) : (
              <div className="module-table-wrap" style={{ overflowX: "auto" }}>
                <table className="module-table" style={{ tableLayout: "fixed", width: "100%" }}>
                  <colgroup>
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "30%" }} />
                    <col style={{ width: "80px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "100px" }} />
                    <col style={{ width: "90px" }} />
                    <col style={{ width: "120px" }} />
                    <col style={{ width: "100px" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Compañía</th><th>Tipo</th><th>Proyección</th><th>Variación</th><th>Confianza</th>
                      <th>Historial</th><th>Ajuste</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectionRows.map((p, index) => {
                      const vals = allProjectionMonths.map(m => p.historico[m] || 0);
                      const maxV = Math.max(...vals, 1);
                      return (
                        <tr key={`${p.empresa}-${p.compania}-${p.tipo}-${index}`}>
                          <td>
                            <CompanyBadge empresa={p.empresa} compact />
                          </td>
                          <td style={{ fontWeight: 600 }}>{p.compania}</td>
                          <td>
                            <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: ".62rem", fontFamily: "Space Mono,monospace", fontWeight: 700, ...Object.fromEntries((tipoBadge[p.tipo] || "background:rgba(130,130,127,.1);color:#82827f").split(";").filter(Boolean).map(s => s.split(":").map(x => x.trim()) as [string, string])) }}>
                              {p.tipo}
                            </span>
                          </td>
                          <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".76rem", fontWeight: 700 }}>{formatCurrency(p.proyeccion)}</td>
                          <td>
                            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", ...( p.variacion < 15 ? { color: "#2e8b7a" } : p.variacion < 40 ? { color: "#f59e0b" } : { color: "#cc0000" }) }}>±{p.variacion}%</span>
                          </td>
                          <td>
                            <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: "20px", fontSize: ".65rem", fontFamily: "Space Mono,monospace", fontWeight: 700, ...(p.estabilidad === "ALTA" ? { background: "rgba(46,139,122,.12)", color: "#2e8b7a" } : p.estabilidad === "MEDIA" ? { background: "rgba(245,158,11,.12)", color: "#f59e0b" } : { background: "rgba(204,0,0,.12)", color: "#cc0000" }) }}>
                              {p.estabilidad}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: "2px", height: "24px", width: "72px" }}>
                              {vals.map((v, i) => (
                                <div key={i} style={{ flex: 1, minWidth: "3px", borderRadius: "1px 1px 0 0", opacity: .8, height: `${maxV > 0 ? Math.round(v / maxV * 100) : 0}%`, background: PROJECTION_COLORS[p.estabilidad] }} />
                              ))}
                            </div>
                          </td>
                          <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", minWidth: "100px" }}>{p.outliers > 0 ? `−${p.outliers} outlier` : "✓ limpio"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DashboardCard>

          {/* Sin proyección */}
          <DashboardCard>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>SIN PROYECCIÓN — APARICIÓN ESPORÁDICA</span>
              <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>1-2 meses</span>
            </div>
            <p style={{ fontSize: ".8rem", color: "#82827f", marginBottom: "14px" }}>Han facturado 1 o 2 veces — sin historial suficiente para proyectar. Pueden aparecer o no.</p>
            {noRecurrentes.length === 0 ? (
              <EmptyState message="No hay compañías esporádicas." />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px,1fr))", gap: "10px" }}>
                {noRecurrentes.map((p, index) => (
                  <div key={`${p.compania}-${p.tipo}-${index}`} style={{ background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "12px" }}>
                    <div style={{ fontSize: ".78rem", fontWeight: 600, marginBottom: "4px" }}>{p.compania}</div>
                    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "4px", fontSize: ".62rem", fontFamily: "Space Mono,monospace", fontWeight: 700, ...Object.fromEntries((tipoBadge[p.tipo] || "background:rgba(130,130,127,.1);color:#82827f").split(";").filter(Boolean).map(s => s.split(":").map(x => x.trim()) as [string, string])) }}>{p.tipo}</span>
                    <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: "#82827f", marginTop: "6px" }}>{formatCurrency(p.total)}</div>
                    <div style={{ fontSize: ".62rem", color: "#82827f", marginTop: "2px" }}>Apareció {p.n_meses} {p.n_meses > 1 ? "veces" : "vez"}</div>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>
        </>
      )}
        </LoadingState>
      )}

      {/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
           TAB CONTROL PLANILLAS
         â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      {tab === "planillas" && (
        <>
          {/* Header planillas */}
          <DashboardCard>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "#82827f", marginBottom: "4px", textTransform: "uppercase", letterSpacing: ".06em" }}>CONTROL DE ENVÍO DE PLANILLAS</div>
                <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".75rem", color: "var(--module-text)" }}>Marca las quincenas enviadas a facturar por mes</div>
                {hasUnsavedPlanillaChanges ? (
                  <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "8px", padding: "4px 10px", borderRadius: "999px", border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.1)", fontFamily: "Space Mono,monospace", fontSize: ".62rem", color: "#d97706", letterSpacing: ".04em" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "999px", background: "#f59e0b", boxShadow: "0 0 0 4px rgba(245,158,11,.18)" }} />
                    {planillaDirtyCount} cambio{planillaDirtyCount === 1 ? "" : "s"} sin guardar
                  </div>
                ) : null}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button onClick={() => plNavMes(-1)} style={{ fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "6px", padding: "5px 12px", cursor: "pointer" }}>◀ Anterior</button>
                  <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".8rem", fontWeight: 700, minWidth: "90px", textAlign: "center" }}>{plMesNombre(plYear, plMonth)}</span>
                  <button
                    onClick={() => plNavMes(1)}
                    disabled={isFutureMonth}
                    style={{ fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "#82827f", opacity: isFutureMonth ? .4 : 1, background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "6px", padding: "5px 12px", cursor: isFutureMonth ? "not-allowed" : "pointer" }}
                  >Siguiente ▶</button>
                </div>
                {canEdit && (
                  <button
                    onClick={openCreateCompaniaModal}
                    style={{ ...ACTION_BTN_BASE, border: "1px solid #2e8b7a", background: "linear-gradient(135deg,#2e8b7a 0%,#1f6b5f 100%)", color: "#fff" }}
                  >
                    <Plus size={14} /> Añadir compañía
                  </button>
                )}
                {canEdit && (
                  <button
                    onClick={() => {
                      if (!hasUnsavedPlanillaChanges || saving) return;
                      void savePlanillas().catch(() => undefined);
                    }}
                    disabled={saving || !hasUnsavedPlanillaChanges}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      fontFamily: "Space Mono,monospace",
                      fontSize: ".68rem",
                      fontWeight: 700,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                      border: "1px solid #cc0000",
                      background: hasUnsavedPlanillaChanges ? "linear-gradient(135deg,#cc0000 0%,#990000 100%)" : "var(--module-surface-2)",
                      color: hasUnsavedPlanillaChanges ? "#fff" : "#cc0000",
                      borderRadius: "6px",
                      padding: "7px 16px",
                      cursor: saving || !hasUnsavedPlanillaChanges ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      opacity: saving ? .8 : hasUnsavedPlanillaChanges ? 1 : .65,
                      animation: hasUnsavedPlanillaChanges && !saving ? "planillasSavePulse 1.8s ease-out infinite" : "none",
                      boxShadow: hasUnsavedPlanillaChanges ? "0 0 0 0 rgba(204,0,0,.28)" : "none",
                      transition: "all .2s ease"
                    }}
                  >
                    {saving ? <LoaderCircle size={14} className="animate-spin" /> : hasUnsavedPlanillaChanges ? <span style={{ width: 8, height: 8, borderRadius: "999px", background: "#fff", display: "inline-block" }} /> : null}
                    {saving ? "Guardando..." : hasUnsavedPlanillaChanges ? `Guardar cambios (${planillaDirtyCount})` : "Sin cambios"}
                  </button>
                )}
              </div>
            </div>
          </DashboardCard>

          {/* Banner período histórico */}
          {isPastMonth && (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", background: "rgba(130,130,127,.08)", border: "1px solid rgba(130,130,127,.25)", borderRadius: "8px", padding: "10px 16px", marginBottom: "12px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f" }}>
              <span style={{ fontSize: "1rem" }}>🕓</span>
              Estás viendo un período histórico: <strong style={{ color: "var(--module-text)", marginLeft: "4px" }}>{plMesNombre(plYear, plMonth).toUpperCase()}</strong>. Los cambios que hagas modificarán datos pasados.
            </div>
          )}

          {/* KPI Cards planillas */}
          <div className="pl-kpi-grid">
            <div className="pl-kpi-card pl-kpi-q1" onClick={() => setPlFiltroEstado("pend_q1")} title="Ver pendientes Q1">
              <div className="pl-kpi-lbl">Pendientes Q1</div>
              <div className="pl-kpi-num">{plKpis.pq1}</div>
              <div className="pl-kpi-sub">sin enviar 1ra quincena</div>
            </div>
            <div className="pl-kpi-card pl-kpi-q2" onClick={() => setPlFiltroEstado("pend_q2")} title="Ver pendientes Q2">
              <div className="pl-kpi-lbl">Pendientes Q2</div>
              <div className="pl-kpi-num">{plKpis.pq2}</div>
              <div className="pl-kpi-sub">sin enviar 2da quincena</div>
            </div>
            <div className="pl-kpi-card pl-kpi-sf" onClick={() => setPlFiltroEstado("sin_fact")} title="Ver sin facturar">
              <div className="pl-kpi-lbl">Sin Facturar</div>
              <div className="pl-kpi-num">{plKpis.sf}</div>
              <div className="pl-kpi-sub">alguna quincena enviada sin factura</div>
            </div>
            <div className="pl-kpi-card pl-kpi-ok" onClick={() => setPlFiltroEstado("completas")} title="Ver completas">
              <div className="pl-kpi-lbl">Completas</div>
              <div className="pl-kpi-num">{plKpis.comp}</div>
              <div className="pl-kpi-sub">Q1 + Q2 + factura ✔</div>
            </div>
          </div>

          {/* Filters planillas */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".6rem", color: "#82827f", letterSpacing: ".08em" }}>TIPO:</span>
            {([["todos", "Todos"], ["ARL", "ARL"], ["Seguros", "SEGUROS"], ["SALUD", "SALUD"]] as const).map(([val, label]) => (
              <button key={val} className={`pl-fbtn${plFiltroTipo === val ? " active" : ""}`} onClick={() => setPlFiltroTipo(val)}>
                {label}
              </button>
            ))}
            <div style={{ width: "1px", height: "20px", background: "var(--module-border)", margin: "0 4px" }} />
            <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".6rem", color: "#82827f", letterSpacing: ".08em" }}>ESTADO:</span>
            {[
              { val: "todos",     label: "Todos" },
              { val: "pend_q1",  label: "Pendiente Q1" },
              { val: "pend_q2",  label: "Pendiente Q2" },
              { val: "sin_fact", label: "Sin facturar" },
              { val: "completas",label: "Completas ✔" }
            ].map(({ val, label }) => (
              <button key={val} className={`pl-fbtn${plFiltroEstado === val ? " active" : ""}`} onClick={() => setPlFiltroEstado(val)}>
                {label}
              </button>
            ))}
            <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
              {(plFiltroTipo !== "todos" || plFiltroEstado !== "todos" || plSearchNombre) && (
                <button
                  onClick={() => { setPlFiltroTipo("todos"); setPlFiltroEstado("todos"); setPlSearchNombre(""); }}
                  style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "rgba(204,0,0,.08)", border: "1px solid #cc0000", borderRadius: "6px", height: "30px", padding: "5px 12px", color: "#cc0000", fontFamily: "DM Sans,sans-serif", fontSize: ".78rem", cursor: "pointer" }}
                >
                  <X size={13} color="#cc0000" /> Limpiar
                </button>
              )}
            <div style={{ position: "relative" }}>
              <Search size={13} style={{ position: "absolute", left: "9px", top: "50%", transform: "translateY(-50%)", color: "#82827f", pointerEvents: "none" }} />
              <input
                type="text"
                value={plSearchNombre}
                onChange={e => setPlSearchNombre(e.target.value)}
                placeholder="Buscar compañía..."
                style={{
                  height: "30px",
                  background: "var(--module-surface-2)",
                  border: "1px solid var(--module-border)",
                  borderRadius: "8px",
                  padding: "4px 10px 4px 28px",
                  color: "var(--module-text)",
                  fontFamily: "DM Sans,sans-serif",
                  fontSize: ".8rem",
                  outline: "none",
                  width: "175px",
                  transition: "border-color .15s"
                }}
                onFocus={e => e.target.style.borderColor = "#2e8b7a"}
                onBlur={e => e.target.style.borderColor = "var(--module-border)"}
              />
              {plSearchNombre && (
                <button
                  onClick={() => setPlSearchNombre("")}
                  title="Limpiar búsqueda"
                  style={{
                    position: "absolute", right: "7px", top: "50%", transform: "translateY(-50%)",
                    background: "transparent", border: "none", padding: 0, cursor: "pointer",
                    color: "#82827f", display: "inline-flex", alignItems: "center"
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
            </div>
          </div>

          {/* Planillas table */}
          <div className="module-table-wrap cartera-planillas-table">
            <table className="module-table cartera-facturacion-table">
              <colgroup>
                <col style={{ width: "38px" }} />
                <col style={{ minWidth: "180px" }} />
                <col />
                <col style={{ minWidth: "130px" }} />
                <col />
                <col style={{ minWidth: "130px" }} />
                <col style={{ width: "72px" }} />
                <col style={{ width: "72px" }} />
                <col />
                <col style={{ minWidth: "160px" }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: "center" }} title="Alerta de envío a facturar">!</th>
                  <th style={{ textAlign: "left" }}>Compañía</th>
                  <th>1ra Quincena</th>
                  <th>Fecha Q1</th>
                  <th>2da Quincena</th>
                  <th>Fecha Q2</th>
                  <th>Fact. Q1 ✔</th>
                  <th>Fact. Q2 ✔</th>
                  <th>Progreso</th>
                  <th style={{ textAlign: "left" }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredCompanies.map(c => {
                  const co = c.nombre;
                  const tipoC = c.tipo || "Seguros";
                  const frec = c.frecuencia_quincenas;
                  const rowKey = planillaKey(c.nombre, c.tipo);
                  const row = planillaData[rowKey] ?? emptyPlanillaRow();
                  const progress = getPlanillaProgress(row, frec);
                  return (
                    <tr key={c.id}>
                      <td style={{ textAlign: "center", padding: "0 2px", verticalAlign: "middle" }}>
                        <PlanillaAlertIcon alert={plAlertas[rowKey]} />
                      </td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                          <RecepcionInfoIcon compania={c} />
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => openEditCompaniaModal(c)}
                              title="Editar compañía"
                              style={{
                                background: "transparent", border: "none", padding: 0, cursor: "pointer",
                                fontWeight: 600, color: "#cc0000", textAlign: "left", fontFamily: "inherit", fontSize: "inherit"
                              }}
                            >
                              {co}
                            </button>
                          ) : (
                            <span style={{ fontWeight: 600 }}>{co}</span>
                          )}
                        </div>
                        <div><span className={`pl-badge-tipo pl-badge-${tipoC}`}>{tipoC}</span></div>
                      </td>
                      <td className="pl-check-cell">
                        <input type="checkbox" className="pl-check" checked={row.q1} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "q1", e.target.checked)} />
                      </td>
                      <td style={{ minWidth: "130px" }}>
                        <input type="date" value={row.fq1 || ""} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "fq1", e.target.value)} placeholder="dd/mm/aaaa" style={{ background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "6px", padding: "4px 8px", color: "var(--module-text)", fontSize: ".78rem", outline: "none", width: "120px", opacity: canEdit ? 1 : 0.6 }} />
                      </td>
                      <td className="pl-check-cell">
                        {frec === 2 ? (
                          <input type="checkbox" className="pl-check" checked={row.q2} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "q2", e.target.checked)} />
                        ) : (
                          <span style={{ color: "#82827f" }}>—</span>
                        )}
                      </td>
                      <td style={{ minWidth: "130px" }}>
                        {frec === 2 ? (
                          <input type="date" value={row.fq2 || ""} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "fq2", e.target.value)} placeholder="dd/mm/aaaa" style={{ background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "6px", padding: "4px 8px", color: "var(--module-text)", fontSize: ".78rem", outline: "none", width: "120px", opacity: canEdit ? 1 : 0.6 }} />
                        ) : (
                          <span style={{ color: "#82827f" }}>—</span>
                        )}
                      </td>
                      <td className="pl-check-cell">
                        <input type="checkbox" className="pl-check" checked={row.fact_q1} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "fact_q1", e.target.checked)} />
                      </td>
                      <td className="pl-check-cell">
                        {frec === 2 ? (
                          <input type="checkbox" className="pl-check" checked={row.fact_q2} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "fact_q2", e.target.checked)} />
                        ) : (
                          <span style={{ color: "#82827f" }}>—</span>
                        )}
                      </td>
                      <td className="pl-prog-cell">
                        <span className="pl-prog-txt" style={{ color: progress.color }}>{progress.completedSteps}/{progress.totalSteps}</span>
                        <div className="pl-prog-bar">
                          <div className="pl-prog-fill" style={{ width: `${progress.pct}%`, background: progress.color }} />
                        </div>
                      </td>
                      <td>
                        <input type="text" value={row.obs || ""} disabled={!canEdit} onChange={e => updatePlanillaField(rowKey, "obs", e.target.value)} placeholder="Observaciones..." style={{ background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", color: "var(--module-text)", fontSize: ".75rem", outline: "none", width: "100%", minWidth: "140px", fontFamily: "DM Sans,sans-serif", opacity: canEdit ? 1 : 0.6 }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="pl-totales">
            <div className="pl-total-card" style={{ borderLeft: "3px solid #cc0000" }}>
              <div className="pl-total-label">Enviadas a facturar (Q1 + Q2)</div>
              <div className="pl-total-val" style={{ color: "#cc0000" }}>{totalEnviadas} / {maxEnv}</div>
              <div className="pl-total-sub">{pctEnv}% de quincenas completadas</div>
              <div className="pl-total-progress">
                <div className="pl-total-progress-fill" style={{ width: `${pctEnv}%`, background: "#cc0000" }} />
              </div>
            </div>
            <div className="pl-total-card" style={{ borderLeft: "3px solid #f59e0b" }}>
              <div className="pl-total-label">Quincenas Facturadas</div>
              <div className="pl-total-val" style={{ color: "#f59e0b" }}>{totalFacturadas} / {maxEnv}</div>
              <div className="pl-total-sub">{pctFact}% de quincenas facturadas</div>
              <div className="pl-total-progress">
                <div className="pl-total-progress-fill" style={{ width: `${pctFact}%`, background: "#f59e0b" }} />
              </div>
            </div>
          </div>
        </>
      )}

      {tab === "aportes" && <CarteraAportesTab data={aportesData} />}

      {tab === "registro" && canEdit && (
        <CarteraRegistroTab
          empresaActiva={empresa}
          onGoToFacturacion={() => setTab("facturacion")}
          onFacturaSaved={upsertFacturaRow}
          onFacturaDeleted={removeFacturaRow}
          onFacturasBatchSaved={upsertFacturasBatch}
        />
      )}

      {companiaModal && (
        <div
          onClick={closeCompaniaModal}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,.5)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 1000, padding: "16px"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--module-surface)", border: "1px solid var(--module-border)",
              borderRadius: "14px", width: "100%", maxWidth: "440px",
              boxShadow: "0 18px 48px rgba(0,0,0,.3)", maxHeight: "90vh", overflowY: "auto"
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "16px 20px", borderBottom: "1px solid var(--module-border)", position: "sticky", top: 0, background: "var(--module-surface)", zIndex: 2, borderTopLeftRadius: "14px", borderTopRightRadius: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "30px", height: "30px", borderRadius: "8px", background: "rgba(204,0,0,.1)", color: "#cc0000", flexShrink: 0 }}>
                  {companiaModal.kind === "create" ? <Plus size={16} /> : <Edit3 size={15} />}
                </span>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".8rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--module-text)" }}>
                    {companiaModal.kind === "create" ? "Nueva compañía" : "Editar compañía"}
                  </span>
                  {companiaModal.kind === "edit" && (
                    <span style={{ fontSize: ".72rem", color: "#82827f", fontFamily: "DM Sans,sans-serif" }}>{companiaForm.nombre}</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={closeCompaniaModal}
                disabled={companiaSaving}
                title="Cerrar"
                style={{ background: "transparent", border: "none", cursor: companiaSaving ? "not-allowed" : "pointer", color: "#82827f", padding: "4px", display: "inline-flex", borderRadius: "6px" }}
              >
                <X size={17} />
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                <span style={MODAL_LABEL_STYLE}>Nombre</span>
                <input
                  type="text"
                  value={companiaForm.nombre}
                  onChange={(e) => setCompaniaForm((f) => ({ ...f, nombre: e.target.value }))}
                  disabled={companiaSaving}
                  onFocus={modalFieldFocus}
                  onBlur={modalFieldBlur}
                  style={MODAL_FIELD_STYLE}
                />
              </label>

              <div style={{ display: "flex", gap: "10px" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1 }}>
                  <span style={MODAL_LABEL_STYLE}>Tipo</span>
                  <select
                    value={companiaForm.tipo}
                    onChange={(e) => setCompaniaForm((f) => ({ ...f, tipo: e.target.value as CompaniaFormState["tipo"] }))}
                    disabled={companiaSaving}
                    onFocus={modalFieldFocus}
                    onBlur={modalFieldBlur}
                    style={{ ...MODAL_FIELD_STYLE, cursor: "pointer" }}
                  >
                    <option value="ARL">ARL</option>
                    <option value="Seguros">Seguros</option>
                    <option value="SALUD">SALUD</option>
                  </select>
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1 }}>
                  <span style={MODAL_LABEL_STYLE}>Frecuencia</span>
                  <select
                    value={String(companiaForm.frecuencia_quincenas)}
                    onChange={(e) => setCompaniaForm((f) => ({ ...f, frecuencia_quincenas: Number(e.target.value) === 1 ? 1 : 2 }))}
                    disabled={companiaSaving}
                    onFocus={modalFieldFocus}
                    onBlur={modalFieldBlur}
                    style={{ ...MODAL_FIELD_STYLE, cursor: "pointer" }}
                  >
                    <option value="1">1 quincena</option>
                    <option value="2">2 quincenas</option>
                  </select>
                </label>
              </div>

              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: companiaSaving ? "not-allowed" : "pointer", padding: "10px 12px", background: companiaForm.alertas_activas ? "rgba(46,139,122,.06)" : "var(--module-surface-2)", border: `1px solid ${companiaForm.alertas_activas ? "rgba(46,139,122,.3)" : "var(--module-border)"}`, borderRadius: "9px", transition: "background .15s, border-color .15s" }}>
                <input
                  type="checkbox"
                  className="pl-check"
                  checked={companiaForm.alertas_activas}
                  disabled={companiaSaving}
                  onChange={(e) => setCompaniaForm((f) => ({ ...f, alertas_activas: e.target.checked }))}
                  style={{ marginTop: "2px" }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "var(--module-text)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700 }}>Alertas de envío activas</span>
                  <span style={{ fontSize: ".72rem", color: "#82827f", fontFamily: "DM Sans,sans-serif", lineHeight: 1.35 }}>Desactívalo para aseguradoras que no se facturan cada mes (solo cuando hay disponible). No generarán alertas de atraso.</span>
                </span>
              </label>

              <div style={{ borderTop: "1px solid var(--module-border)", marginTop: "2px", paddingTop: "14px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ display: "inline-flex", color: "#0077c8" }}><Download size={14} /></span>
                  <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "var(--module-text)", letterSpacing: ".06em", textTransform: "uppercase", fontWeight: 700 }}>Recepción de planilla</span>
                </div>
                <span style={{ fontSize: ".72rem", color: "#82827f", fontFamily: "DM Sans,sans-serif", lineHeight: 1.35, marginTop: "-6px" }}>Cómo obtenemos la planilla de esta aseguradora. Puedes llenar portal y/o correo.</span>

                <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <span style={{ ...MODAL_LABEL_STYLE, display: "inline-flex", alignItems: "center", gap: "5px" }}><Download size={11} style={{ color: "#0077c8" }} /> Portal — cómo descargarla / URL</span>
                  <input
                    type="text"
                    value={companiaForm.portal_detalle}
                    onChange={(e) => setCompaniaForm((f) => ({ ...f, portal_detalle: e.target.value }))}
                    disabled={companiaSaving}
                    onFocus={modalFieldFocus}
                    onBlur={modalFieldBlur}
                    placeholder="Ej: Descargar del portal SURA, menú Planillas"
                    style={MODAL_FIELD_STYLE}
                  />
                </label>

                <div style={{ display: "flex", gap: "10px" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1 }}>
                    <span style={{ ...MODAL_LABEL_STYLE, display: "inline-flex", alignItems: "center", gap: "5px" }}><Mail size={11} style={{ color: "#cc0000" }} /> Correo remitente</span>
                    <input
                      type="text"
                      value={companiaForm.correo_remitente}
                      onChange={(e) => setCompaniaForm((f) => ({ ...f, correo_remitente: e.target.value }))}
                      disabled={companiaSaving}
                      onFocus={modalFieldFocus}
                      onBlur={modalFieldBlur}
                      placeholder="quien la envía"
                      style={MODAL_FIELD_STYLE}
                    />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: "5px", flex: 1 }}>
                    <span style={{ ...MODAL_LABEL_STYLE, display: "inline-flex", alignItems: "center", gap: "5px" }}><Mail size={11} style={{ color: "#2e8b7a" }} /> Correo destino</span>
                    <input
                      type="text"
                      value={companiaForm.correo_destino}
                      onChange={(e) => setCompaniaForm((f) => ({ ...f, correo_destino: e.target.value }))}
                      disabled={companiaSaving}
                      onFocus={modalFieldFocus}
                      onBlur={modalFieldBlur}
                      placeholder="dónde llega"
                      style={MODAL_FIELD_STYLE}
                    />
                  </label>
                </div>

                <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                  <span style={MODAL_LABEL_STYLE}>Notas (opcional)</span>
                  <input
                    type="text"
                    value={companiaForm.recepcion_notas}
                    onChange={(e) => setCompaniaForm((f) => ({ ...f, recepcion_notas: e.target.value }))}
                    disabled={companiaSaving}
                    onFocus={modalFieldFocus}
                    onBlur={modalFieldBlur}
                    placeholder="Cualquier detalle adicional"
                    style={MODAL_FIELD_STYLE}
                  />
                </label>
              </div>

              {companiaError && (
                <div style={{ background: "rgba(204,0,0,.08)", border: "1px solid rgba(204,0,0,.3)", color: "#cc0000", borderRadius: "8px", padding: "8px 11px", fontSize: ".78rem", fontFamily: "DM Sans,sans-serif" }}>
                  {companiaError}
                </div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "14px 20px", borderTop: "1px solid var(--module-border)", flexWrap: "wrap", position: "sticky", bottom: 0, background: "var(--module-surface)", borderBottomLeftRadius: "14px", borderBottomRightRadius: "14px" }}>
              {companiaModal.kind === "edit" ? (
                <button
                  type="button"
                  onClick={() => void deleteCompaniaModal()}
                  disabled={companiaSaving}
                  style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", background: "transparent", border: "1px solid #cc0000", color: "#cc0000", borderRadius: "6px", padding: "7px 12px", cursor: companiaSaving ? "not-allowed" : "pointer", opacity: companiaSaving ? .6 : 1 }}
                >
                  <Trash2 size={13} /> Eliminar compañía
                </button>
              ) : <span />}

              <div style={{ display: "flex", gap: "8px", marginLeft: "auto" }}>
                <button
                  type="button"
                  onClick={closeCompaniaModal}
                  disabled={companiaSaving}
                  style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", color: "#82827f", borderRadius: "6px", padding: "7px 14px", cursor: companiaSaving ? "not-allowed" : "pointer" }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitCompaniaModal()}
                  disabled={companiaSaving}
                  style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", border: "1px solid #cc0000", background: "linear-gradient(135deg,#cc0000 0%,#990000 100%)", color: "#fff", borderRadius: "6px", padding: "7px 14px", cursor: companiaSaving ? "not-allowed" : "pointer", opacity: companiaSaving ? .6 : 1 }}
                >
                  {companiaSaving ? "Guardando..." : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}




