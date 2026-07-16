import { getDemoPlanillasAlertas } from "@/lib/demo-cartera";

type EmpresaCode = "CMYM" | "SYSO" | "SANUM";
type EmpresaOrTodas = "TODAS" | EmpresaCode;
type CalculationMode = "pago" | "elaboracion";

type KpiResponse = {
  value: number | null;
  previous_value: number | null;
  change_pct: number | null;
  valor_actual: number | null;
  valor_anterior: number | null;
  variacion_absoluta: number | null;
  variacion_porcentual: number | null;
  base_baja: boolean;
  direction: "up" | "down" | "flat";
  favorable: boolean | null;
  error: string | null;
};

type ResumenEmpresaKpi = KpiResponse & {
  participacion: number | null;
  sparkline: Array<{ mes: string; valor: number }>;
};

type ResumenPayload = {
  period: string;
  cutoff: string;
  cutoff_label: string | null;
  comparison_period: { label: string };
  kpis: {
    facturacion_total: KpiResponse;
    recaudo_total: KpiResponse;
    cartera_vencida: KpiResponse & { ratio_over_facturacion: number | null };
    clientes_activos: KpiResponse;
  };
  por_empresa: Record<EmpresaCode, ResumenEmpresaKpi>;
};

type AlertSeverity = "critica" | "advertencia" | "informativa" | "positiva";
type AlertIcon = "AlertOctagon" | "TrendingUp" | "AlertCircle" | "TrendingDown" | "Users" | "Star" | "AlertTriangle" | "UserX" | "UserPlus" | "Clock";

type AlertPayload = {
  period: string;
  cutoff: string;
  alerts: Array<{
    id: string;
    tipo: string;
    severidad: AlertSeverity;
    icono: AlertIcon;
    titulo: string;
    descripcion: string;
    monto: number | null;
    magnitud: number;
  }>;
  all_clear: boolean;
};

type IngresosPayload = {
  modo: CalculationMode;
  empresa: EmpresaOrTodas;
  cutoff_label: string | null;
  meses: Array<{
    mes: string;
    valor: number;
    empresas?: Record<EmpresaCode, number>;
  }>;
  kpis: {
    total_ingresado: number;
    promedio_mensual: number;
    mejor_mes: { mes: string; valor: number };
    variacion_periodo: number | null;
  };
  desglose_empresas: Record<EmpresaCode, number> | null;
};

type ClientePayload = {
  cliente: string;
  total: number;
  participacion: number;
  tendencia: "subiendo" | "bajando" | "estable" | "nuevo";
  por_mes: Record<string, number>;
};

type AportesPayload = {
  modo: CalculationMode;
  empresa: EmpresaOrTodas;
  cutoff_label: string | null;
  meses_disponibles: string[];
  total_general: number;
  total_clientes: number;
  top_10: ClientePayload[];
  todos_clientes: ClientePayload[];
};

type ComparativoEmpresa = {
  total: number;
  promedio: number;
  mejor_mes: { mes: string; valor: number };
  crecimiento: number | null;
  por_mes: Record<string, number>;
};

type ComparativoPayload = {
  modo: CalculationMode;
  cutoff_label: string | null;
  meses_disponibles: string[];
  total_holding: number;
  por_empresa: Record<EmpresaCode, ComparativoEmpresa>;
  participacion: Record<EmpresaCode, number>;
  empresa_mayor_crecimiento: { empresa: EmpresaCode; porcentaje: number } | null;
  empresa_mejor_mes: { empresa: EmpresaCode; mes: string; valor: number } | null;
};

const DEMO_CUTOFF = "2026-04-30";
const DEMO_CUTOFF_LABEL = "30-ABR-2026";

function buildKpi(current: number, previous: number, favorableWhenIncrease: boolean): KpiResponse {
  const change = previous === 0 ? (current > 0 ? 100 : 0) : Number((((current - previous) / previous) * 100).toFixed(1));
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return {
    value: current,
    previous_value: previous,
    change_pct: change,
    valor_actual: current,
    valor_anterior: previous,
    variacion_absoluta: current - previous,
    variacion_porcentual: change,
    base_baja: false,
    direction,
    favorable: direction === "flat" ? null : favorableWhenIncrease ? change >= 0 : change <= 0,
    error: null
  };
}

const resumenBase: Omit<ResumenPayload, "period"> = {
  cutoff: DEMO_CUTOFF,
  cutoff_label: DEMO_CUTOFF_LABEL,
  comparison_period: { label: "Abr 1-30 vs Mar 1-30" },
  kpis: {
    facturacion_total: buildKpi(198400000, 182300000, true),
    recaudo_total: buildKpi(163900000, 154200000, true),
    cartera_vencida: {
      ...buildKpi(74200000, 68800000, false),
      ratio_over_facturacion: 37.4
    },
    clientes_activos: buildKpi(48, 45, true)
  },
  por_empresa: {
    CMYM: {
      ...buildKpi(118200000, 111900000, true),
      participacion: 59.6,
      sparkline: [
        { mes: "2025-11", valor: 102000000 },
        { mes: "2025-12", valor: 109000000 },
        { mes: "2026-01", valor: 106500000 },
        { mes: "2026-02", valor: 112300000 },
        { mes: "2026-03", valor: 111900000 },
        { mes: "2026-04", valor: 118200000 }
      ]
    },
    SYSO: {
      ...buildKpi(39200000, 34500000, true),
      participacion: 19.8,
      sparkline: [
        { mes: "2025-11", valor: 28100000 },
        { mes: "2025-12", valor: 29800000 },
        { mes: "2026-01", valor: 30200000 },
        { mes: "2026-02", valor: 32100000 },
        { mes: "2026-03", valor: 34500000 },
        { mes: "2026-04", valor: 39200000 }
      ]
    },
    SANUM: {
      ...buildKpi(41000000, 35900000, true),
      participacion: 20.7,
      sparkline: [
        { mes: "2025-11", valor: 26700000 },
        { mes: "2025-12", valor: 30100000 },
        { mes: "2026-01", valor: 31500000 },
        { mes: "2026-02", valor: 33800000 },
        { mes: "2026-03", valor: 35900000 },
        { mes: "2026-04", valor: 41000000 }
      ]
    }
  }
};

const alertasBase: AlertPayload["alerts"] = [
  {
    id: "cartera_mora_critica",
    tipo: "cartera",
    severidad: "advertencia",
    icono: "AlertCircle",
    titulo: "Monto relevante en mora > 90 dias",
    descripcion: "$18,6M concentrados en facturas antiguas de dos clientes demo",
    monto: 18600000,
    magnitud: 18600000
  },
  {
    id: "facturacion_syso_up",
    tipo: "facturacion",
    severidad: "positiva",
    icono: "TrendingUp",
    titulo: "SYSO acelero su facturacion",
    descripcion: "Crecimiento de 13,6% frente al periodo anterior",
    monto: 39200000,
    magnitud: 13.6
  },
  {
    id: "top_cliente_holding",
    tipo: "facturacion",
    severidad: "informativa",
    icono: "Star",
    titulo: "Top cliente del periodo",
    descripcion: "Arl Sura lidera el aporte consolidado del mes demo",
    monto: 50120000,
    magnitud: 50120000
  },
  {
    id: "clientes_nuevos",
    tipo: "clientes",
    severidad: "positiva",
    icono: "UserPlus",
    titulo: "Ingresaron 3 clientes nuevos",
    descripcion: "Nuevas cuentas activadas en SYSO y SANUM durante abril",
    monto: null,
    magnitud: 3
  }
];

const ingresosMeses = [
  { mes: "2025-11", empresas: { CMYM: 102000000, SYSO: 28100000, SANUM: 26700000 } },
  { mes: "2025-12", empresas: { CMYM: 109000000, SYSO: 29800000, SANUM: 30100000 } },
  { mes: "2026-01", empresas: { CMYM: 106500000, SYSO: 30200000, SANUM: 31500000 } },
  { mes: "2026-02", empresas: { CMYM: 112300000, SYSO: 32100000, SANUM: 33800000 } },
  { mes: "2026-03", empresas: { CMYM: 111900000, SYSO: 34500000, SANUM: 35900000 } },
  { mes: "2026-04", empresas: { CMYM: 118200000, SYSO: 39200000, SANUM: 41000000 } }
].map((item) => ({
  ...item,
  valor: item.empresas.CMYM + item.empresas.SYSO + item.empresas.SANUM
}));

const clientesBase: ClientePayload[] = [
  {
    cliente: "Arl Sura",
    total: 278400000,
    participacion: 22.4,
    tendencia: "subiendo",
    por_mes: { "2025-11": 43000000, "2025-12": 45600000, "2026-01": 48200000, "2026-02": 49500000, "2026-03": 50100000, "2026-04": 50120000 }
  },
  {
    cliente: "Colsanitas",
    total: 222100000,
    participacion: 17.9,
    tendencia: "estable",
    por_mes: { "2025-11": 35200000, "2025-12": 36100000, "2026-01": 37200000, "2026-02": 39150000, "2026-03": 38350000, "2026-04": 39100000 }
  },
  {
    cliente: "Clinica Horizonte",
    total: 111800000,
    participacion: 9,
    tendencia: "subiendo",
    por_mes: { "2025-11": 15500000, "2025-12": 16800000, "2026-01": 17400000, "2026-02": 18900000, "2026-03": 20600000, "2026-04": 22100000 }
  },
  {
    cliente: "Transportes Andina",
    total: 76800000,
    participacion: 6.2,
    tendencia: "subiendo",
    por_mes: { "2025-11": 8900000, "2025-12": 10100000, "2026-01": 11200000, "2026-02": 12800000, "2026-03": 14600000, "2026-04": 19200000 }
  },
  {
    cliente: "Seguros del Estado",
    total: 69400000,
    participacion: 5.6,
    tendencia: "bajando",
    por_mes: { "2025-11": 15400000, "2025-12": 13600000, "2026-01": 12800000, "2026-02": 11200000, "2026-03": 9600000, "2026-04": 6800000 }
  },
  {
    cliente: "Fundacion Amanecer",
    total: 41600000,
    participacion: 3.3,
    tendencia: "nuevo",
    por_mes: { "2026-02": 9800000, "2026-03": 14800000, "2026-04": 17000000 }
  }
];

function filterIngresosByEmpresa(empresa: EmpresaOrTodas) {
  return ingresosMeses.map((item) => {
    if (empresa === "TODAS") return item;
    return {
      mes: item.mes,
      valor: item.empresas[empresa]
    };
  });
}

export function getDemoResumenPayload(period: string): ResumenPayload {
  return {
    period,
    ...resumenBase
  };
}

function buildDemoPlanillaAlert(): AlertPayload["alerts"][number] | null {
  const today = new Date();
  const { summary } = getDemoPlanillasAlertas(today.getMonth() + 1, today.getFullYear());
  if (summary.overdueCount <= 0) return null;
  const nombres = summary.companiasOverdue.slice(0, 3).join(", ");
  const resto = summary.companiasOverdue.length > 3 ? ` y ${summary.companiasOverdue.length - 3} más` : "";
  return {
    id: "planillas_pendientes_facturar",
    tipo: "operacion",
    severidad: summary.overdueCount >= 5 ? "critica" : "advertencia",
    icono: "AlertTriangle",
    titulo: `${summary.overdueCount} quincena(s) sin enviar a facturar`,
    descripcion: nombres ? `Atrasadas según su cadencia: ${nombres}${resto}` : "Hay quincenas atrasadas según su cadencia habitual",
    monto: null,
    magnitud: summary.overdueCount
  };
}

export function getDemoAlertasPayload(period: string): AlertPayload {
  let alerts = alertasBase;
  if (period === "current-month") {
    const planillaAlert = buildDemoPlanillaAlert();
    if (planillaAlert) {
      alerts = [planillaAlert, ...alertasBase].slice(0, 4);
    }
  }
  return {
    period,
    cutoff: DEMO_CUTOFF,
    alerts,
    all_clear: alerts.length === 0
  };
}

export function getDemoIngresosPayload(empresa: EmpresaOrTodas, modo: CalculationMode): IngresosPayload {
  const meses = filterIngresosByEmpresa(empresa);
  const total = meses.reduce((sum, item) => sum + item.valor, 0);
  const mejorMes = meses.reduce((best, item) => (item.valor > best.valor ? item : best), meses[0] ?? { mes: "", valor: 0 });
  const promedio = meses.length ? total / meses.length : 0;
  const desglose = empresa === "TODAS"
    ? ingresosMeses.reduce(
        (acc, item) => ({
          CMYM: acc.CMYM + item.empresas.CMYM,
          SYSO: acc.SYSO + item.empresas.SYSO,
          SANUM: acc.SANUM + item.empresas.SANUM
        }),
        { CMYM: 0, SYSO: 0, SANUM: 0 }
      )
    : null;

  return {
    modo,
    empresa,
    cutoff_label: DEMO_CUTOFF_LABEL,
    meses,
    kpis: {
      total_ingresado: Math.round(total),
      promedio_mensual: Math.round(promedio),
      mejor_mes: { mes: mejorMes.mes, valor: mejorMes.valor },
      variacion_periodo: 11.8
    },
    desglose_empresas: desglose
  };
}

export function getDemoAportesPayload(empresa: EmpresaOrTodas, modo: CalculationMode): AportesPayload {
  const todos = clientesBase.map((item) => ({ ...item, por_mes: { ...item.por_mes } }));
  const total = todos.reduce((sum, item) => sum + item.total, 0);
  const recalculated = todos.map((item) => ({
    ...item,
    participacion: total > 0 ? Number(((item.total / total) * 100).toFixed(1)) : 0
  })).sort((a, b) => b.total - a.total);

  return {
    modo,
    empresa,
    cutoff_label: DEMO_CUTOFF_LABEL,
    meses_disponibles: ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"],
    total_general: total,
    total_clientes: recalculated.length,
    top_10: recalculated.slice(0, 10),
    todos_clientes: recalculated
  };
}

export function getDemoComparativoPayload(modo: CalculationMode): ComparativoPayload {
  return {
    modo,
    cutoff_label: DEMO_CUTOFF_LABEL,
    meses_disponibles: ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"],
    total_holding: 1063700000,
    por_empresa: {
      CMYM: {
        total: 659900000,
        promedio: 109983333,
        mejor_mes: { mes: "2026-04", valor: 118200000 },
        crecimiento: 8.6,
        por_mes: { "2025-11": 102000000, "2025-12": 109000000, "2026-01": 106500000, "2026-02": 112300000, "2026-03": 111900000, "2026-04": 118200000 }
      },
      SYSO: {
        total: 193900000,
        promedio: 32316667,
        mejor_mes: { mes: "2026-04", valor: 39200000 },
        crecimiento: 14.1,
        por_mes: { "2025-11": 28100000, "2025-12": 29800000, "2026-01": 30200000, "2026-02": 32100000, "2026-03": 34500000, "2026-04": 39200000 }
      },
      SANUM: {
        total: 209900000,
        promedio: 34983333,
        mejor_mes: { mes: "2026-04", valor: 41000000 },
        crecimiento: 12.5,
        por_mes: { "2025-11": 26700000, "2025-12": 30100000, "2026-01": 31500000, "2026-02": 33800000, "2026-03": 35900000, "2026-04": 41000000 }
      }
    },
    participacion: {
      CMYM: 62,
      SYSO: 18.2,
      SANUM: 19.7
    },
    empresa_mayor_crecimiento: { empresa: "SYSO", porcentaje: 14.1 },
    empresa_mejor_mes: { empresa: "CMYM", mes: "2026-04", valor: 118200000 }
  };
}
