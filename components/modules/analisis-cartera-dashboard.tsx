"use client";

import "@/lib/modules/charts";

import { ArrowDownRight, ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { ChartSkeleton, CompanyFilter, KpiCardSkeleton, LoadingState, MobileCards, ResponsiveTable, TableSkeleton } from "@/components/ui";
import { DashboardCard, EmptyState } from "@/components/ui/dashboard-primitives";
import type { SessionPayload } from "@/lib/auth";
import { formatCurrency } from "@/lib/modules/format";

type EmpresaCode = "TODAS" | "CMYM" | "SYSO" | "SANUM";
type CalculationMode = "pago" | "elaboracion";
type AnalysisTabKey = "ingresos" | "aportes" | "comparativo";
type EmpresaBreakdown = {
  CMYM: number;
  SYSO: number;
  SANUM: number;
};
type Tendencia = "subiendo" | "bajando" | "estable" | "nuevo";
type ClienteSortKey = "cliente" | "total";

type IngresoMes = {
  mes: string;
  valor: number;
  empresas?: EmpresaBreakdown;
};

type IngresosResponse = {
  modo: CalculationMode;
  empresa: EmpresaCode;
  cutoff_label: string | null;
  meses: IngresoMes[];
  kpis: {
    total_ingresado: number;
    promedio_mensual: number;
    mejor_mes: { mes: string; valor: number };
    variacion_periodo: number | null;
  };
  desglose_empresas: EmpresaBreakdown | null;
};

type ClienteRow = {
  cliente: string;
  total: number;
  participacion: number;
  tendencia: Tendencia;
  por_mes: Record<string, number>;
};

type AportesClientesResponse = {
  modo: CalculationMode;
  empresa: EmpresaCode;
  cutoff_label: string | null;
  meses_disponibles: string[];
  total_general: number;
  total_clientes: number;
  top_10: ClienteRow[];
  todos_clientes: ClienteRow[];
};

type EmpresaHoldingCode = "CMYM" | "SYSO" | "SANUM";

type ComparativoEmpresaData = {
  total: number;
  promedio: number;
  mejor_mes: { mes: string; valor: number };
  crecimiento: number | null;
  por_mes: Record<string, number>;
};

type ComparativoResponse = {
  modo: CalculationMode;
  cutoff_label: string | null;
  meses_disponibles: string[];
  total_holding: number;
  por_empresa: Record<EmpresaHoldingCode, ComparativoEmpresaData>;
  participacion: Record<EmpresaHoldingCode, number>;
  empresa_mayor_crecimiento: { empresa: EmpresaHoldingCode; porcentaje: number } | null;
  empresa_mejor_mes: { empresa: EmpresaHoldingCode; mes: string; valor: number } | null;
};

type AnalisisCarteraDashboardProps = {
  canEdit: boolean;
  session: SessionPayload;
};

const TAB_CONFIG: Array<{ key: AnalysisTabKey; label: string }> = [
  { key: "ingresos", label: "Ingresos" },
  { key: "aportes", label: "Aportes por Cliente" },
  { key: "comparativo", label: "Comparativo" }
];

const EMPRESA_OPTIONS: EmpresaCode[] = ["TODAS", "CMYM", "SYSO", "SANUM"];
const MONTHS_S = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DONUT_COLORS = ["rgba(46,139,122,.82)", "rgba(0,119,200,.78)", "rgba(204,0,0,.74)"];
const PAGE_SIZE = 25;
const HOLDING_EMPRESAS: EmpresaHoldingCode[] = ["CMYM", "SYSO", "SANUM"];
const EMPRESA_COLORS: Record<EmpresaHoldingCode, { solid: string; soft: string; line: string }> = {
  CMYM: { solid: "#cc0000", soft: "rgba(204,0,0,.68)", line: "rgba(204,0,0,.16)" },
  SYSO: { solid: "#2e8b7a", soft: "rgba(46,139,122,.68)", line: "rgba(46,139,122,.14)" },
  SANUM: { solid: "#0077c8", soft: "rgba(0,119,200,.68)", line: "rgba(0,119,200,.14)" }
};

function formatMonthKeyLabel(value: string): string {
  const [year, month] = value.split("-");
  const monthIndex = Number(month);
  if (!year || !monthIndex || !MONTHS_S[monthIndex]) return value;
  return `${MONTHS_S[monthIndex].toUpperCase()} ${year}`;
}

function formatCompactClientName(value: string): string {
  return value.length > 56 ? `${value.slice(0, 56)}…` : value;
}

function formatCellCurrency(value: number): string {
  return value === 0 ? "-" : formatCurrency(value);
}

function getTendenciaMeta(tendencia: Tendencia) {
  if (tendencia === "subiendo") {
    return { icon: <TrendingUp size={16} />, color: "#2e8b7a", bg: "rgba(46,139,122,.1)", label: "Subiendo" };
  }
  if (tendencia === "bajando") {
    return { icon: <TrendingDown size={16} />, color: "#cc0000", bg: "rgba(204,0,0,.1)", label: "Bajando" };
  }
  if (tendencia === "estable") {
    return { icon: <Minus size={16} />, color: "#82827f", bg: "rgba(130,130,127,.12)", label: "Estable" };
  }
  return { icon: <ArrowUpRight size={16} />, color: "#0077c8", bg: "rgba(0,119,200,.12)", label: "Nuevo" };
}

export function AnalisisCarteraDashboard({ canEdit, session }: AnalisisCarteraDashboardProps) {
  const [empresa, setEmpresa] = useState<EmpresaCode>("TODAS");
  const [calculationMode, setCalculationMode] = useState<CalculationMode>("pago");
  const [tab, setTab] = useState<AnalysisTabKey>("ingresos");
  const [desdeMes, setDesdeMes] = useState("");
  const [desdeAnio, setDesdeAnio] = useState("");
  const [hastaMes, setHastaMes] = useState("");
  const [hastaAnio, setHastaAnio] = useState("");

  const [ingresosData, setIngresosData] = useState<IngresosResponse | null>(null);
  const [loadingIngresos, setLoadingIngresos] = useState(false);
  const [ingresosError, setIngresosError] = useState("");
  const [ingresosReloadKey, setIngresosReloadKey] = useState(0);

  const [aportesData, setAportesData] = useState<AportesClientesResponse | null>(null);
  const [loadingAportes, setLoadingAportes] = useState(false);
  const [aportesError, setAportesError] = useState("");
  const [aportesReloadKey, setAportesReloadKey] = useState(0);
  const [selectedCliente, setSelectedCliente] = useState<string>("");
  const [searchCliente, setSearchCliente] = useState("");
  const [clienteSortKey, setClienteSortKey] = useState<ClienteSortKey>("total");
  const [clienteSortAsc, setClienteSortAsc] = useState(false);
  const [clientesPage, setClientesPage] = useState(1);
  const [comparativoData, setComparativoData] = useState<ComparativoResponse | null>(null);
  const [loadingComparativo, setLoadingComparativo] = useState(false);
  const [comparativoError, setComparativoError] = useState("");
  const [comparativoReloadKey, setComparativoReloadKey] = useState(0);

  const currentYear = new Date().getFullYear();
  const availableYears = useMemo(
    () => Array.from({ length: currentYear - 2019 + 2 }, (_, index) => 2020 + index).reverse(),
    [currentYear]
  );
  const desde = desdeMes && desdeAnio ? `${desdeAnio}-${desdeMes}` : "";
  const hasta = hastaMes && hastaAnio ? `${hastaAnio}-${hastaMes}` : "";
  const cutoffLabel =
    tab === "ingresos"
      ? ingresosData?.cutoff_label ?? null
      : tab === "aportes"
        ? aportesData?.cutoff_label ?? null
        : comparativoData?.cutoff_label ?? null;

  useEffect(() => {
    if (tab !== "ingresos") return;

    const controller = new AbortController();
    const params = new URLSearchParams({ empresa, modo: calculationMode });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);

    setLoadingIngresos(true);
    setIngresosError("");

    fetch(`/api/analisis-cartera/ingresos?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as IngresosResponse | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in data && typeof data.detail === "string" ? data.detail : "No fue posible cargar ingresos.");
        }
        setIngresosData(data as IngresosResponse);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setIngresosData(null);
        setIngresosError(error instanceof Error ? error.message : "No fue posible cargar ingresos.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingIngresos(false);
        }
      });

    return () => controller.abort();
  }, [empresa, calculationMode, desde, hasta, tab, ingresosReloadKey]);

  useEffect(() => {
    if (tab !== "aportes") return;

    const controller = new AbortController();
    const params = new URLSearchParams({ empresa, modo: calculationMode });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);

    setLoadingAportes(true);
    setAportesError("");

    fetch(`/api/analisis-cartera/aportes-clientes?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as AportesClientesResponse | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in data && typeof data.detail === "string" ? data.detail : "No fue posible cargar aportes por cliente.");
        }
        const payload = data as AportesClientesResponse;
        setAportesData(payload);
        setSelectedCliente((current) => {
          if (current && payload.top_10.some((item) => item.cliente === current)) return current;
          return payload.top_10[0]?.cliente ?? "";
        });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setAportesData(null);
        setSelectedCliente("");
        setAportesError(error instanceof Error ? error.message : "No fue posible cargar aportes por cliente.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingAportes(false);
        }
      });

    return () => controller.abort();
  }, [empresa, calculationMode, desde, hasta, tab, aportesReloadKey]);

  useEffect(() => {
    setClientesPage(1);
  }, [searchCliente, clienteSortKey, clienteSortAsc, aportesData]);

  useEffect(() => {
    if (tab !== "comparativo") return;

    const controller = new AbortController();
    const params = new URLSearchParams({ modo: calculationMode });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);

    setLoadingComparativo(true);
    setComparativoError("");

    fetch(`/api/analisis-cartera/comparativo?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as ComparativoResponse | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in data && typeof data.detail === "string" ? data.detail : "No fue posible cargar el comparativo.");
        }
        setComparativoData(data as ComparativoResponse);
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setComparativoData(null);
        setComparativoError(error instanceof Error ? error.message : "No fue posible cargar el comparativo.");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoadingComparativo(false);
        }
      });

    return () => controller.abort();
  }, [calculationMode, desde, hasta, tab, comparativoReloadKey]);

  const chartLabels = useMemo(
    () => (ingresosData?.meses ?? []).map((item) => formatMonthKeyLabel(item.mes)),
    [ingresosData]
  );
  const chartValues = useMemo(
    () => (ingresosData?.meses ?? []).map((item) => item.valor),
    [ingresosData]
  );
  const totalIngresado = ingresosData?.kpis.total_ingresado ?? 0;
  const mesesDesc = useMemo(
    () => [...(ingresosData?.meses ?? [])].sort((a, b) => b.mes.localeCompare(a.mes)),
    [ingresosData]
  );
  const ingresosMobileColumns = useMemo(
    () => [
      { key: "mes", label: "Mes", highlight: true as const },
      { key: "ingresos", label: "Ingresos", align: "right" as const },
      { key: "pctTotal", label: "% del total", align: "right" as const },
      { key: "CMYM", label: "CMYM", align: "right" as const },
      { key: "SYSO", label: "SYSO", align: "right" as const },
      { key: "SANUM", label: "SANUM", align: "right" as const }
    ],
    []
  );
  const ingresosMobileData = useMemo(
    () =>
      mesesDesc.map((item) => ({
        id: item.mes,
        mes: formatMonthKeyLabel(item.mes),
        ingresos: item.valor,
        pctTotal: totalIngresado > 0 ? ((item.valor / totalIngresado) * 100).toFixed(1) : "0.0",
        CMYM: item.empresas?.CMYM ?? 0,
        SYSO: item.empresas?.SYSO ?? 0,
        SANUM: item.empresas?.SANUM ?? 0
      })),
    [mesesDesc, totalIngresado]
  );
  const desgloseEmpresaRows = useMemo(
    () =>
      ingresosData?.desglose_empresas
        ? ([
            { empresa: "CMYM", valor: ingresosData.desglose_empresas.CMYM },
            { empresa: "SYSO", valor: ingresosData.desglose_empresas.SYSO },
            { empresa: "SANUM", valor: ingresosData.desglose_empresas.SANUM }
          ] as const)
        : [],
    [ingresosData]
  );
  const variacion = ingresosData?.kpis.variacion_periodo ?? null;
  const variacionPositiva = variacion !== null && variacion >= 0;
  const mejorMesLabel = ingresosData?.kpis.mejor_mes.mes ? formatMonthKeyLabel(ingresosData.kpis.mejor_mes.mes) : "—";

  const selectedClienteData = useMemo(
    () => aportesData?.top_10.find((item) => item.cliente === selectedCliente) ?? null,
    [aportesData, selectedCliente]
  );
  const aportesTop10Participation = useMemo(() => {
    if (!aportesData || aportesData.total_general <= 0) return 0;
    const topTotal = aportesData.top_10.reduce((sum, item) => sum + item.total, 0);
    return Number(((topTotal / aportesData.total_general) * 100).toFixed(1));
  }, [aportesData]);
  const aportesTopLabel = useMemo(() => {
    const count = Math.min(aportesData?.total_clientes ?? 0, 10);
    return `Participación Top ${count}`;
  }, [aportesData]);
  const selectedClienteChartLabels = useMemo(
    () => aportesData?.meses_disponibles.map((month) => formatMonthKeyLabel(month)) ?? [],
    [aportesData]
  );
  const selectedClienteChartValues = useMemo(
    () => aportesData?.meses_disponibles.map((month) => selectedClienteData?.por_mes[month] ?? 0) ?? [],
    [aportesData, selectedClienteData]
  );
  const filteredClientes = useMemo(() => {
    const base = [...(aportesData?.todos_clientes ?? [])];
    const query = searchCliente.trim().toLowerCase();
    const searched = query ? base.filter((item) => item.cliente.toLowerCase().includes(query)) : base;

    searched.sort((left, right) => {
      if (clienteSortKey === "cliente") {
        const result = left.cliente.localeCompare(right.cliente, "es");
        return clienteSortAsc ? result : -result;
      }

      if (left.total === right.total) {
        const result = left.cliente.localeCompare(right.cliente, "es");
        return clienteSortAsc ? result : -result;
      }
      return clienteSortAsc ? left.total - right.total : right.total - left.total;
    });

    return searched;
  }, [aportesData, searchCliente, clienteSortKey, clienteSortAsc]);
  const totalPages = Math.max(1, Math.ceil(filteredClientes.length / PAGE_SIZE));
  const pagedClientes = useMemo(
    () => filteredClientes.slice((clientesPage - 1) * PAGE_SIZE, clientesPage * PAGE_SIZE),
    [filteredClientes, clientesPage]
  );
  const aportesTop10Columns = useMemo(
    () => [
      { key: "cliente", label: "Cliente", highlight: true as const },
      { key: "ranking", label: "Ranking", align: "right" as const },
      { key: "total", label: "Total", align: "right" as const },
      { key: "participacion", label: "% del total", align: "right" as const },
      { key: "tendencia", label: "Tendencia", align: "right" as const }
    ],
    []
  );
  const aportesTop10Data = useMemo(
    () =>
      (aportesData?.top_10 ?? []).map((item, index) => ({
        id: item.cliente,
        cliente: item.cliente,
        ranking: index + 1,
        total: item.total,
        participacion: item.participacion,
        tendencia: item.tendencia
      })),
    [aportesData]
  );
  const detalleClienteColumns = useMemo(
    () => [
      {
        key: "cliente",
        label: "Cliente",
        align: "left" as const,
        minWidth: 180,
        className: "detalle-cliente-col"
      },
      ...(aportesData?.meses_disponibles.map((month) => ({
        key: month,
        label: formatMonthKeyLabel(month),
        align: "right" as const,
        minWidth: 110,
        className: "detalle-mes-col whitespace-nowrap"
      })) ?? []),
      { key: "total", label: "Total", align: "right" as const, minWidth: 140, className: "whitespace-nowrap" },
      { key: "participacion", label: "%", align: "right" as const, minWidth: 100, className: "whitespace-nowrap" },
      { key: "tendencia", label: "Tendencia", minWidth: 150 }
    ],
    [aportesData]
  );
  const detalleClienteData = useMemo(
    () =>
      pagedClientes.map((item) => ({
        id: item.cliente,
        cliente: item.cliente,
        total: item.total,
        participacion: item.participacion,
        tendencia: item.tendencia,
        ...Object.fromEntries((aportesData?.meses_disponibles ?? []).map((month) => [month, item.por_mes[month] ?? 0]))
      })),
    [aportesData, pagedClientes]
  );
  const comparativoLabels = useMemo(
    () => comparativoData?.meses_disponibles.map((month) => formatMonthKeyLabel(month)) ?? [],
    [comparativoData]
  );
  const comparativoParticipacionCards = useMemo(
    () =>
      HOLDING_EMPRESAS.map((empresaKey) => ({
        empresa: empresaKey,
        total: comparativoData?.por_empresa[empresaKey].total ?? 0,
        participacion: comparativoData?.participacion[empresaKey] ?? 0,
        crecimiento: comparativoData?.por_empresa[empresaKey].crecimiento ?? null,
        promedio: comparativoData?.por_empresa[empresaKey].promedio ?? 0,
        mejorMes: comparativoData?.por_empresa[empresaKey].mejor_mes ?? { mes: "", valor: 0 }
      })),
    [comparativoData]
  );
  const comparativoBarrasDatasets = useMemo(
    () =>
      HOLDING_EMPRESAS.map((empresaKey) => ({
        label: empresaKey,
        data: comparativoData?.meses_disponibles.map((month) => comparativoData.por_empresa[empresaKey].por_mes[month] ?? 0) ?? [],
        backgroundColor: EMPRESA_COLORS[empresaKey].soft,
        borderColor: EMPRESA_COLORS[empresaKey].solid,
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: 22
      })),
    [comparativoData]
  );
  const comparativoLineasDatasets = useMemo(
    () =>
      HOLDING_EMPRESAS.map((empresaKey) => ({
        label: empresaKey,
        data: comparativoData?.meses_disponibles.map((month) => comparativoData.por_empresa[empresaKey].por_mes[month] ?? 0) ?? [],
        borderColor: EMPRESA_COLORS[empresaKey].solid,
        backgroundColor: EMPRESA_COLORS[empresaKey].line,
        pointBackgroundColor: EMPRESA_COLORS[empresaKey].solid,
        pointBorderColor: "#ffffff",
        pointBorderWidth: 1,
        pointRadius: 3,
        pointHoverRadius: 4,
        tension: 0.28,
        fill: false
      })),
    [comparativoData]
  );
  const comparativoMesesDesc = useMemo(
    () => [...(comparativoData?.meses_disponibles ?? [])].sort((a, b) => b.localeCompare(a)),
    [comparativoData]
  );
  const comparativoRows = useMemo(
    () =>
      comparativoMesesDesc.map((month) => {
        const cmym = comparativoData?.por_empresa.CMYM.por_mes[month] ?? 0;
        const syso = comparativoData?.por_empresa.SYSO.por_mes[month] ?? 0;
        const sanum = comparativoData?.por_empresa.SANUM.por_mes[month] ?? 0;
        return {
          mes: month,
          CMYM: cmym,
          SYSO: syso,
          SANUM: sanum,
          total: cmym + syso + sanum
        };
      }),
    [comparativoData, comparativoMesesDesc]
  );
  const comparativoActivas = useMemo(
    () => HOLDING_EMPRESAS.filter((empresaKey) => (comparativoData?.por_empresa[empresaKey].total ?? 0) > 0).length,
    [comparativoData]
  );
  const comparativoTotalesAcumulados = useMemo(
    () => ({
      CMYM: comparativoData?.por_empresa.CMYM.total ?? 0,
      SYSO: comparativoData?.por_empresa.SYSO.total ?? 0,
      SANUM: comparativoData?.por_empresa.SANUM.total ?? 0,
      total: comparativoData?.total_holding ?? 0
    }),
    [comparativoData]
  );
  const comparativoDetailColumns = useMemo(
    () => [
      { key: "mes", label: "Mes", highlight: true as const },
      { key: "CMYM", label: "CMYM", align: "right" as const },
      { key: "SYSO", label: "SYSO", align: "right" as const },
      { key: "SANUM", label: "SANUM", align: "right" as const },
      { key: "total", label: "Total Holding", align: "right" as const }
    ],
    []
  );
  const comparativoDetailData = useMemo(
    () => [
      ...comparativoRows.map((row) => ({
        id: row.mes,
        mes: formatMonthKeyLabel(row.mes),
        CMYM: row.CMYM,
        SYSO: row.SYSO,
        SANUM: row.SANUM,
        total: row.total
      })),
      {
        id: "totales",
        mes: "Totales",
        CMYM: comparativoTotalesAcumulados.CMYM,
        SYSO: comparativoTotalesAcumulados.SYSO,
        SANUM: comparativoTotalesAcumulados.SANUM,
        total: comparativoTotalesAcumulados.total
      }
    ],
    [comparativoRows, comparativoTotalesAcumulados]
  );
  const ingresosLoadError = ingresosError ? new Error(ingresosError) : null;
  const aportesLoadError = aportesError ? new Error(aportesError) : null;
  const comparativoLoadError = comparativoError ? new Error(comparativoError) : null;
  const ingresosSkeleton = (
    <div style={{ display: "grid", gap: "16px" }}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`ingresos-kpi-skeleton-${index}`} />)}
      </div>
      <div style={{ display: "grid", gap: "16px", gridTemplateColumns: empresa === "TODAS" ? "1.35fr .65fr" : "1fr" }} className="max-[900px]:!grid-cols-1">
        <ChartSkeleton height={260} />
        {empresa === "TODAS" ? <ChartSkeleton height={220} /> : null}
      </div>
      <TableSkeleton rows={6} columns={empresa === "TODAS" ? 6 : 3} />
    </div>
  );
  const aportesSkeleton = (
    <div style={{ display: "grid", gap: "16px" }}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => <KpiCardSkeleton key={`aportes-kpi-skeleton-${index}`} />)}
      </div>
      <ChartSkeleton height={260} />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
  const comparativoSkeleton = (
    <div style={{ display: "grid", gap: "16px" }}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`comparativo-kpi-skeleton-${index}`} />)}
      </div>
      <ChartSkeleton height={280} />
      <TableSkeleton rows={6} columns={4} />
    </div>
  );
  const placeholderLabel = TAB_CONFIG.find((item) => item.key === tab)?.label;

  function toggleClienteSort(key: ClienteSortKey) {
    if (clienteSortKey === key) {
      setClienteSortAsc((current) => !current);
      return;
    }
    setClienteSortKey(key);
    setClienteSortAsc(key === "cliente");
  }

  return (
    <div className="module-page-standard">
      <AssistantShell
        title="Analisis Cartera"
        contextBuilder={() =>
          JSON.stringify({
            empresa,
            modo: calculationMode,
            tab,
            rango: {
              desde,
              hasta
            }
          })
        }
      />
      <ModuleHeader
        titulo="ANÁLISIS CARTERA"
        subtitulo="// INGRESOS  APORTES  COMPARATIVO"
        cutoffLabel={cutoffLabel}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <CompanyFilter
              companies={["CMYM", "SYSO", "SANUM"]}
              value={empresa}
              onChange={(next) => setEmpresa(next as EmpresaCode)}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".65rem", color: "#82827f", letterSpacing: ".06em" }}>
                CALCULAR POR:
              </span>
              <div className="module-pill-group">
                <button
                  type="button"
                  className={`module-pill ${calculationMode === "pago" ? "is-active" : ""}`}
                  onClick={() => setCalculationMode("pago")}
                >
                  fecha de pago
                </button>
                <button
                  type="button"
                  className={`module-pill ${calculationMode === "elaboracion" ? "is-active" : ""}`}
                  onClick={() => setCalculationMode("elaboracion")}
                >
                  fecha de elaboración
                </button>
              </div>
            </div>
          </div>
        }
      />

      <section className="module-panel">
        <div className="module-panel-head">
          <div>
            <h3 className="module-section-title">Vista base del módulo</h3>
            <p className="module-panel-subtitle">
              Análisis de ingresos y concentración por cliente, con filtros globales por empresa y criterio de fecha.
            </p>
          </div>
          <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: "#82827f", textAlign: "right" }}>
            <div>{session.sub.toUpperCase()} · {session.rol}</div>
          </div>
        </div>

        <div className="p-5" style={{ display: "grid", gap: "18px" }}>
          <div className="module-pill-group">
            {TAB_CONFIG.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`module-pill ${tab === key ? "is-active" : ""}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {(tab === "ingresos" || tab === "aportes" || tab === "comparativo") && (
            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
                alignItems: "center",
                background: "var(--module-surface)",
                border: "1px solid var(--module-border)",
                borderRadius: "12px",
                padding: "14px 16px"
              }}
            >
              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", letterSpacing: ".06em" }}>DESDE:</span>
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <select value={desdeMes} onChange={(event) => setDesdeMes(event.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                  <option value="">Mes</option>
                  {MONTHS_S.slice(1).map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}
                </select>
                <select value={desdeAnio} onChange={(event) => setDesdeAnio(event.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                  <option value="">Año</option>
                  {availableYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                </select>
              </div>

              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", color: "#82827f", letterSpacing: ".06em" }}>HASTA:</span>
              <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
                <select value={hastaMes} onChange={(event) => setHastaMes(event.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                  <option value="">Mes</option>
                  {MONTHS_S.slice(1).map((month, index) => <option key={month} value={String(index + 1).padStart(2, "0")}>{month}</option>)}
                </select>
                <select value={hastaAnio} onChange={(event) => setHastaAnio(event.target.value)} style={{ height: "32px", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "4px 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".8rem", outline: "none", cursor: "pointer" }}>
                  <option value="">Año</option>
                  {availableYears.map((year) => <option key={year} value={String(year)}>{year}</option>)}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  setDesdeMes("");
                  setDesdeAnio("");
                  setHastaMes("");
                  setHastaAnio("");
                }}
                style={{ marginLeft: "auto", height: "30px", padding: "0 12px", borderRadius: "6px", border: "1px solid var(--module-border)", background: "var(--module-surface-2)", color: "#82827f", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, cursor: "pointer" }}
              >
                Limpiar rango
              </button>
            </div>
          )}

          {tab === "ingresos" && (
            <LoadingState
              isLoading={loadingIngresos}
              error={ingresosLoadError}
              skeleton={ingresosSkeleton}
              onRetry={() => setIngresosReloadKey((current) => current + 1)}
              errorMessage="No se pudieron cargar los ingresos."
            >
            <div style={{ display: "grid", gap: "16px" }}>
              {loadingIngresos ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 24px" }}>
                  <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".8rem", color: "#82827f" }}>Cargando ingresos…</p>
                </div>
              ) : ingresosError ? (
                <EmptyState message={ingresosError} />
              ) : !ingresosData || ingresosData.meses.length === 0 ? (
                <EmptyState message="No hay ingresos para los filtros seleccionados." />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #2e8b7a" }}>
                      <p className="module-kpi__label">Total Ingresado</p>
                      <p className="module-kpi__value">{formatCurrency(ingresosData.kpis.total_ingresado)}</p>
                      <p className="module-kpi__sub">{ingresosData.meses.length} meses consolidados</p>
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #0077c8" }}>
                      <p className="module-kpi__label">Promedio Mensual</p>
                      <p className="module-kpi__value">{formatCurrency(ingresosData.kpis.promedio_mensual)}</p>
                      <p className="module-kpi__sub">promedio del período visible</p>
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #d97706" }}>
                      <p className="module-kpi__label">Mejor Mes</p>
                      <p className="module-kpi__value">{mejorMesLabel}</p>
                      <p className="module-kpi__sub">{formatCurrency(ingresosData.kpis.mejor_mes.valor)}</p>
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #cc0000" }}>
                      <p className="module-kpi__label">Variación Período</p>
                      {variacion === null ? (
                        <>
                          <p className="module-kpi__value" style={{ fontSize: "1.45rem" }}>—</p>
                          <p className="module-kpi__sub">Sin datos suficientes</p>
                        </>
                      ) : (
                        <>
                          <p className="module-kpi__value" style={{ color: variacionPositiva ? "#2e8b7a" : "#cc0000", display: "flex", alignItems: "center", gap: "8px" }}>
                            {variacionPositiva ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                            {Math.abs(variacion)}%
                          </p>
                          <p className="module-kpi__sub">últimos 6 meses vs 6 previos</p>
                        </>
                      )}
                    </section>
                  </div>

                  <div style={{ display: "grid", gap: "16px", gridTemplateColumns: empresa === "TODAS" ? "1.35fr .65fr" : "1fr" }} className="max-[900px]:!grid-cols-1">
                    <DashboardCard className="module-card--plain">
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                        <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>INGRESOS POR MES</span>
                        <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                          {calculationMode === "pago" ? "fecha de pago" : "fecha de elaboración"}
                        </span>
                      </div>
                      <div style={{ position: "relative", height: "260px" }}>
                        <Bar
                          data={{
                            labels: chartLabels,
                            datasets: [{ label: "Ingresos", data: chartValues, backgroundColor: "rgba(46,139,122,.72)", borderColor: "#2e8b7a", borderWidth: 1, borderRadius: 4 }]
                          }}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                              legend: { display: false },
                              tooltip: { callbacks: { label: (context) => ` ${formatCurrency(context.raw as number)}` } }
                            },
                            scales: {
                              x: { grid: { display: false }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 } } },
                              y: { grid: { color: "rgba(224,217,208,.4)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 }, callback: (value) => `$${(Number(value) / 1e6).toFixed(0)}M` } }
                            }
                          }}
                        />
                      </div>
                    </DashboardCard>

                    {empresa === "TODAS" && ingresosData.desglose_empresas ? (
                      <DashboardCard className="module-card--plain">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                          <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>DESGLOSE POR EMPRESA</span>
                          <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                            % del total
                          </span>
                        </div>
                        <div style={{ position: "relative", height: "170px" }}>
                          <Doughnut
                            data={{
                              labels: desgloseEmpresaRows.map((item) => item.empresa),
                              datasets: [{ data: desgloseEmpresaRows.map((item) => item.valor), backgroundColor: DONUT_COLORS, borderWidth: 0 }]
                            }}
                            options={{ responsive: true, maintainAspectRatio: false, cutout: "65%", plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => `${context.label}: ${formatCurrency(context.raw as number)}` } } } }}
                          />
                        </div>
                        <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {desgloseEmpresaRows.map((item, index) => {
                            const pct = totalIngresado > 0 ? ((item.valor / totalIngresado) * 100).toFixed(1) : "0.0";
                            return (
                              <div key={item.empresa} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: DONUT_COLORS[index], flexShrink: 0 }} />
                                <span style={{ fontSize: ".7rem", color: "#82827f", flex: 1 }}>{item.empresa}</span>
                                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700 }}>{formatCurrency(item.valor)}</span>
                                <span style={{ fontSize: ".62rem", color: "#82827f" }}>{pct}%</span>
                              </div>
                            );
                          })}
                        </div>
                      </DashboardCard>
                    ) : null}
                  </div>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>DESGLOSE MES A MES</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>orden reciente primero</span>
                    </div>
                    <div className="module-table-wrap" style={{ overflowX: "auto" }}>
                      <table className="module-table" style={{ tableLayout: "fixed", width: "100%", minWidth: empresa === "TODAS" ? "620px" : "360px" }}>
                        <colgroup>
                          <col style={{ width: "110px" }} />
                          <col style={{ width: "150px" }} />
                          <col style={{ width: "90px" }} />
                          {empresa === "TODAS" && <>
                            <col style={{ width: "130px" }} />
                            <col style={{ width: "130px" }} />
                            <col style={{ width: "100px" }} />
                          </>}
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Mes</th>
                            <th style={{ textAlign: "right" }}>Ingresos</th>
                            <th style={{ textAlign: "right" }}>% del total</th>
                            {empresa === "TODAS" && <>
                              <th style={{ textAlign: "right" }}>CMYM</th>
                              <th style={{ textAlign: "right" }}>SYSO</th>
                              <th style={{ textAlign: "right" }}>SANUM</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {(empresa === "TODAS" ? ingresosMobileData : ingresosMobileData.map(({ id, mes, ingresos, pctTotal }) => ({ id, mes, ingresos, pctTotal, CMYM: 0, SYSO: 0, SANUM: 0 }))).map((row) => (
                            <tr key={row.id}>
                              <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{row.mes}</td>
                              <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, textAlign: "right" }}>{formatCurrency(Number(row.ingresos ?? 0))}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{row.pctTotal}%</td>
                              {empresa === "TODAS" && <>
                                <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{formatCurrency(Number(row.CMYM ?? 0))}</td>
                                <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{formatCurrency(Number(row.SYSO ?? 0))}</td>
                                <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{formatCurrency(Number(row.SANUM ?? 0))}</td>
                              </>}
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--module-border)" }}>
                            <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>TOTAL</td>
                            <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, textAlign: "right", color: "#2e8b7a" }}>{formatCurrency(totalIngresado)}</td>
                            <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>100%</td>
                            {empresa === "TODAS" && <>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatCurrency(ingresosData?.desglose_empresas?.CMYM ?? 0)}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatCurrency(ingresosData?.desglose_empresas?.SYSO ?? 0)}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatCurrency(ingresosData?.desglose_empresas?.SANUM ?? 0)}</td>
                            </>}
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </DashboardCard>
                </>
              )}
            </div>
            </LoadingState>
          )}

          {tab === "aportes" && (
            <LoadingState
              isLoading={loadingAportes}
              error={aportesLoadError}
              skeleton={aportesSkeleton}
              onRetry={() => setAportesReloadKey((current) => current + 1)}
              errorMessage="No se pudieron cargar los aportes por cliente."
            >
            <div style={{ display: "grid", gap: "16px" }}>
              {loadingAportes ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 24px" }}>
                  <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".8rem", color: "#82827f" }}>Cargando aportes por cliente…</p>
                </div>
              ) : aportesError ? (
                <EmptyState message={aportesError} />
              ) : !aportesData || aportesData.todos_clientes.length === 0 ? (
                <EmptyState message="No hay aportes por cliente para los filtros seleccionados." />
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #2e8b7a" }}>
                      <p className="module-kpi__label">Total Clientes</p>
                      <p className="module-kpi__value">{aportesData.total_clientes.toLocaleString("es-CO")}</p>
                      <p className="module-kpi__sub">clientes activos en el período</p>
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #0077c8" }}>
                      <p className="module-kpi__label">Cliente Top</p>
                      <p
                        className="module-kpi__value"
                        style={{
                          fontSize: "1.08rem",
                          lineHeight: 1.25,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden"
                        }}
                      >
                        {aportesData.top_10[0]?.cliente ?? "—"}
                      </p>
                      <p className="module-kpi__sub">{formatCurrency(aportesData.top_10[0]?.total ?? 0)}</p>
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #d97706" }}>
                      <p className="module-kpi__label">{aportesTopLabel}</p>
                      <p className="module-kpi__value">{aportesTop10Participation}%</p>
                      <p className="module-kpi__sub">sobre {formatCurrency(aportesData.total_general)}</p>
                    </section>
                  </div>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>TOP 10 CLIENTES</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                        click para ver historial
                      </span>
                    </div>
                    <div className="module-table-wrap" style={{ overflowX: "auto" }}>
                      <table className="module-table" style={{ tableLayout: "fixed", width: "100%", minWidth: "540px" }}>
                        <colgroup>
                          <col style={{ width: "36px" }} />
                          <col style={{ width: "34%" }} />
                          <col style={{ width: "150px" }} />
                          <col style={{ width: "85px" }} />
                          <col style={{ width: "110px" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "center" }}>#</th>
                            <th>Cliente</th>
                            <th style={{ textAlign: "right" }}>Total</th>
                            <th style={{ textAlign: "right" }}>% Part.</th>
                            <th style={{ textAlign: "center" }}>Tendencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aportesTop10Data.map((row) => {
                            const isActive = selectedCliente === row.cliente;
                            const meta = getTendenciaMeta(row.tendencia as Tendencia);
                            return (
                              <tr
                                key={row.id}
                                onClick={() => setSelectedCliente(String(row.cliente))}
                                style={{ cursor: "pointer", background: isActive ? "var(--module-surface-2)" : undefined }}
                              >
                                <td style={{ textAlign: "center", fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: "#82827f" }}>#{row.ranking}</td>
                                <td style={{ fontWeight: 700, color: isActive ? "var(--module-accent)" : "var(--module-text)" }}>{row.cliente}</td>
                                <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, textAlign: "right" }}>{formatCurrency(Number(row.total ?? 0))}</td>
                                <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{row.participacion}%</td>
                                <td style={{ textAlign: "center" }}>
                                  <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 8px", borderRadius: "999px", background: meta.bg, color: meta.color, fontSize: ".68rem", fontWeight: 700 }}>
                                    {meta.icon}{meta.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {selectedClienteData ? (
                      <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid var(--module-border)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px", gap: "12px", flexWrap: "wrap" }}>
                          <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700 }}>
                            HISTORIAL MENSUAL · {selectedClienteData.cliente}
                          </span>
                        </div>
                        <div style={{ position: "relative", height: "220px" }}>
                          <Bar
                            data={{
                              labels: selectedClienteChartLabels,
                              datasets: [{ label: selectedClienteData.cliente, data: selectedClienteChartValues, backgroundColor: "rgba(0,119,200,.68)", borderColor: "#0077c8", borderWidth: 1, borderRadius: 4 }]
                            }}
                            options={{
                              responsive: true,
                              maintainAspectRatio: false,
                              plugins: {
                                legend: { display: false },
                                tooltip: { callbacks: { label: (context) => ` ${formatCurrency(context.raw as number)}` } }
                              },
                              scales: {
                                x: { grid: { display: false }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 } } },
                                y: { grid: { color: "rgba(224,217,208,.4)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 }, callback: (value) => `$${(Number(value) / 1e6).toFixed(0)}M` } }
                              }
                            }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </DashboardCard>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>DETALLE POR CLIENTE</span>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <input
                          value={searchCliente}
                          onChange={(event) => setSearchCliente(event.target.value)}
                          placeholder="Buscar cliente"
                          style={{ height: "32px", minWidth: "min(220px, 100%)", width: "100%", maxWidth: "280px", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "8px", padding: "0 10px", color: "var(--module-text)", fontFamily: "DM Sans,sans-serif", fontSize: ".82rem", outline: "none" }}
                        />
                        <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                          {filteredClientes.length} resultados
                        </span>
                      </div>
                    </div>

                    <div
                      style={{
                        maxHeight: "500px",
                        overflowY: "auto",
                        overflowX: "auto",
                        borderRadius: "10px",
                        border: "1px solid var(--module-border)"
                      }}
                    >
                      <ResponsiveTable
                        columns={detalleClienteColumns}
                        data={detalleClienteData}
                        stickyFirstColumn={false}
                        stickyHeader
                        className="border-0 rounded-none detalle-cliente-table"
                        renderHeader={(column) => {
                          if (column.key === "cliente" || column.key === "total") {
                            return (
                              <button
                                type="button"
                                onClick={() => toggleClienteSort(column.key === "cliente" ? "cliente" : "total")}
                                style={{
                                  cursor: "pointer",
                                  userSelect: "none",
                                  font: "inherit",
                                  color: "inherit",
                                  background: "transparent",
                                  border: 0,
                                  padding: 0
                                }}
                              >
                                {column.label}
                              </button>
                            );
                          }

                          return column.label;
                        }}
                        renderCell={(row, column) => {
                          if (column.key === "cliente") {
                            return <span style={{ fontWeight: 600 }}>{row.cliente}</span>;
                          }

                          if (column.key === "total") {
                            return (
                              <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700 }}>
                                {formatCurrency(Number(row.total ?? 0))}
                              </span>
                            );
                          }

                          if (column.key === "participacion") {
                            return `${row.participacion}%`;
                          }

                          if (column.key === "tendencia") {
                            const meta = getTendenciaMeta(row.tendencia as Tendencia);
                            return (
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 8px", borderRadius: "999px", background: meta.bg, color: meta.color, fontSize: ".72rem", fontWeight: 700 }}>
                                {meta.icon}
                                {meta.label}
                              </span>
                            );
                          }

                          return formatCellCurrency(Number(row[column.key] ?? 0));
                        }}
                      />
                    </div>

                    <div style={{ marginTop: "14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".64rem", color: "#82827f" }}>
                        Página {clientesPage} de {totalPages}
                      </span>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          disabled={clientesPage <= 1}
                          onClick={() => setClientesPage((current) => Math.max(1, current - 1))}
                          style={{ height: "30px", padding: "0 12px", borderRadius: "6px", border: "1px solid var(--module-border)", background: "var(--module-surface-2)", color: clientesPage <= 1 ? "#b5b5b2" : "#82827f", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, cursor: clientesPage <= 1 ? "not-allowed" : "pointer" }}
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          disabled={clientesPage >= totalPages}
                          onClick={() => setClientesPage((current) => Math.min(totalPages, current + 1))}
                          style={{ height: "30px", padding: "0 12px", borderRadius: "6px", border: "1px solid var(--module-border)", background: "var(--module-surface-2)", color: clientesPage >= totalPages ? "#b5b5b2" : "#82827f", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, cursor: clientesPage >= totalPages ? "not-allowed" : "pointer" }}
                        >
                          Siguiente
                        </button>
                      </div>
                    </div>
                  </DashboardCard>
                </>
              )}
            </div>
            </LoadingState>
          )}

          {tab === "comparativo" && (
            <LoadingState
              isLoading={loadingComparativo}
              error={comparativoLoadError}
              skeleton={comparativoSkeleton}
              onRetry={() => setComparativoReloadKey((current) => current + 1)}
              errorMessage="No se pudo cargar el comparativo."
            >
            <div style={{ display: "grid", gap: "16px" }}>
              {loadingComparativo ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "64px 24px" }}>
                  <p style={{ fontFamily: "Space Mono,monospace", fontSize: ".8rem", color: "#82827f" }}>Cargando comparativo…</p>
                </div>
              ) : comparativoError ? (
                <EmptyState message={comparativoError} />
              ) : !comparativoData || comparativoData.meses_disponibles.length === 0 ? (
                <EmptyState message="No hay datos comparativos para los filtros seleccionados." />
              ) : (
                <>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "12px",
                      flexWrap: "wrap",
                      padding: "14px 16px",
                      borderRadius: "12px",
                      border: "1px solid var(--module-border)",
                      background: "linear-gradient(90deg, rgba(204,0,0,.04) 0%, rgba(46,139,122,.04) 55%, rgba(0,119,200,.04) 100%)"
                    }}
                  >
                    <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".7rem", letterSpacing: ".06em", color: "#82827f" }}>
                      Esta vista compara las 3 empresas del holding
                    </span>
                    <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                      {calculationMode === "pago" ? "fecha de pago" : "fecha de elaboración"}
                    </span>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #2e8b7a" }}>
                      <p className="module-kpi__label">Total Holding</p>
                      <p className="module-kpi__value">{formatCurrency(comparativoData.total_holding)}</p>
                      <p className="module-kpi__sub">{comparativoData.meses_disponibles.length} meses consolidados</p>
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #cc0000" }}>
                      <p className="module-kpi__label">Mayor Crecimiento</p>
                      {comparativoData.empresa_mayor_crecimiento ? (
                        <>
                          <p
                            className="module-kpi__value"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              color: comparativoData.empresa_mayor_crecimiento.porcentaje >= 0 ? "#2e8b7a" : "#cc0000"
                            }}
                          >
                            {comparativoData.empresa_mayor_crecimiento.porcentaje >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                            {comparativoData.empresa_mayor_crecimiento.porcentaje}%
                          </p>
                          <p className="module-kpi__sub">{comparativoData.empresa_mayor_crecimiento.empresa}</p>
                        </>
                      ) : (
                        <>
                          <p className="module-kpi__value" style={{ fontSize: "1.45rem" }}>—</p>
                          <p className="module-kpi__sub">Sin datos suficientes</p>
                        </>
                      )}
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #0077c8" }}>
                      <p className="module-kpi__label">Mejor Mes</p>
                      {comparativoData.empresa_mejor_mes ? (
                        <>
                          <p className="module-kpi__value" style={{ fontSize: "1.1rem", lineHeight: 1.25 }}>{comparativoData.empresa_mejor_mes.empresa}</p>
                          <p className="module-kpi__sub">
                            {formatMonthKeyLabel(comparativoData.empresa_mejor_mes.mes)} · {formatCurrency(comparativoData.empresa_mejor_mes.valor)}
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="module-kpi__value" style={{ fontSize: "1.45rem" }}>—</p>
                          <p className="module-kpi__sub">Sin movimiento</p>
                        </>
                      )}
                    </section>
                    <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #d97706" }}>
                      <p className="module-kpi__label">Empresas Activas</p>
                      <p className="module-kpi__value">{comparativoActivas}</p>
                      <p className="module-kpi__sub">con movimiento en el período</p>
                    </section>
                  </div>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>PARTICIPACIÓN EN EL HOLDING</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                        % del período visible
                      </span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
                      {comparativoParticipacionCards.map((item) => {
                        const positive = item.crecimiento !== null && item.crecimiento >= 0;
                        return (
                          <section key={item.empresa} className="module-card module-card--plain" style={{ borderTop: `4px solid ${EMPRESA_COLORS[item.empresa].solid}`, background: "var(--module-surface-2)" }}>
                            <div style={{ display: "grid", gap: "10px" }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700, color: EMPRESA_COLORS[item.empresa].solid }}>{item.empresa}</span>
                                <span style={{ fontSize: ".72rem", color: "#82827f" }}>{item.participacion}%</span>
                              </div>
                              <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".96rem", fontWeight: 700 }}>{formatCurrency(item.total)}</div>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                                <span style={{ fontSize: ".72rem", color: "#82827f" }}>Promedio {formatCurrency(item.promedio)}</span>
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "3px 8px",
                                    borderRadius: "999px",
                                    background: item.crecimiento === null ? "rgba(130,130,127,.12)" : positive ? "rgba(46,139,122,.1)" : "rgba(204,0,0,.1)",
                                    color: item.crecimiento === null ? "#82827f" : positive ? "#2e8b7a" : "#cc0000",
                                    fontSize: ".72rem",
                                    fontWeight: 700
                                  }}
                                >
                                  {item.crecimiento === null ? <Minus size={14} /> : positive ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                  {item.crecimiento === null ? "s/d" : `${item.crecimiento}%`}
                                </span>
                              </div>
                              <div style={{ fontSize: ".72rem", color: "#82827f" }}>
                                Mejor mes: {item.mejorMes.mes ? `${formatMonthKeyLabel(item.mejorMes.mes)} · ${formatCurrency(item.mejorMes.valor)}` : "sin movimiento"}
                              </div>
                            </div>
                          </section>
                        );
                      })}
                    </div>
                  </DashboardCard>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>INGRESOS POR MES Y EMPRESA</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                        barras agrupadas
                      </span>
                    </div>
                    <div style={{ position: "relative", height: "280px" }}>
                      <Bar
                        data={{ labels: comparativoLabels, datasets: comparativoBarrasDatasets }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8, color: "#5f5f5a", font: { family: "Space Mono", size: 10 } } },
                            tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw as number)}` } }
                          },
                          scales: {
                            x: { grid: { display: false }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 } } },
                            y: { grid: { color: "rgba(224,217,208,.4)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 }, callback: (value) => `$${(Number(value) / 1e6).toFixed(0)}M` } }
                          }
                        }}
                      />
                    </div>
                  </DashboardCard>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>EVOLUCIÓN COMPARATIVA</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                        tendencia paralela
                      </span>
                    </div>
                    <div style={{ position: "relative", height: "280px" }}>
                      <Line
                        data={{ labels: comparativoLabels, datasets: comparativoLineasDatasets }}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          plugins: {
                            legend: { position: "top", labels: { usePointStyle: true, boxWidth: 8, color: "#5f5f5a", font: { family: "Space Mono", size: 10 } } },
                            tooltip: { callbacks: { label: (context) => `${context.dataset.label}: ${formatCurrency(context.raw as number)}` } }
                          },
                          scales: {
                            x: { grid: { display: false }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 } } },
                            y: { grid: { color: "rgba(224,217,208,.4)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 }, callback: (value) => `$${(Number(value) / 1e6).toFixed(0)}M` } }
                          }
                        }}
                      />
                    </div>
                  </DashboardCard>

                  <DashboardCard className="module-card--plain">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", gap: "12px", flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".78rem", fontWeight: 700 }}>DETALLE MES A MES</span>
                      <span style={{ fontSize: ".62rem", color: "#82827f", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "4px", padding: "3px 8px", fontFamily: "Space Mono,monospace" }}>
                        orden reciente primero
                      </span>
                    </div>
                    <div className="module-table-wrap" style={{ overflowX: "auto" }}>
                      <table className="module-table" style={{ tableLayout: "fixed", width: "100%", minWidth: "540px" }}>
                        <colgroup>
                          <col style={{ width: "110px" }} />
                          <col style={{ width: "140px" }} />
                          <col style={{ width: "140px" }} />
                          <col style={{ width: "140px" }} />
                          <col style={{ width: "150px" }} />
                        </colgroup>
                        <thead>
                          <tr>
                            <th>Mes</th>
                            <th style={{ textAlign: "right" }}>CMYM</th>
                            <th style={{ textAlign: "right" }}>SYSO</th>
                            <th style={{ textAlign: "right" }}>SANUM</th>
                            <th style={{ textAlign: "right" }}>Total Holding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {comparativoDetailData.filter(r => r.id !== "totales").map((row) => (
                            <tr key={row.id}>
                              <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{row.mes}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{formatCellCurrency(Number(row.CMYM ?? 0))}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{formatCellCurrency(Number(row.SYSO ?? 0))}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem" }}>{formatCellCurrency(Number(row.SANUM ?? 0))}</td>
                              <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700 }}>{formatCurrency(Number(row.total ?? 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: "2px solid var(--module-border)" }}>
                            <td style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>TOTAL</td>
                            <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatCurrency(comparativoTotalesAcumulados.CMYM)}</td>
                            <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatCurrency(comparativoTotalesAcumulados.SYSO)}</td>
                            <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700 }}>{formatCurrency(comparativoTotalesAcumulados.SANUM)}</td>
                            <td style={{ textAlign: "right", fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, color: "#2e8b7a" }}>{formatCurrency(comparativoTotalesAcumulados.total)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </DashboardCard>
                </>
              )}
            </div>
            </LoadingState>
          )}

          {false && tab === "comparativo" && (
            <div
              style={{
                minHeight: "260px",
                borderRadius: "14px",
                border: "1px dashed rgba(204,0,0,.2)",
                background: "linear-gradient(180deg, rgba(204,0,0,.03) 0%, rgba(255,255,255,0) 100%)",
                padding: "24px",
                display: "grid",
                placeItems: "center",
                textAlign: "center"
              }}
            >
              <div>
                <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", color: "#cc0000", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: "10px" }}>
                  {placeholderLabel}
                </div>
                <h4 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--module-text)", marginBottom: "8px" }}>
                  En construcción
                </h4>
                <p style={{ maxWidth: "560px", color: "var(--module-muted)", fontSize: ".9rem", lineHeight: 1.7 }}>
                  Esta pestaña quedará lista en el siguiente paso. El selector de empresa y el criterio global de cálculo ya
                  están conectados a la estructura base del módulo.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
