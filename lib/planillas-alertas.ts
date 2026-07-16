// Logica de cadencia para alertas de envio a facturar de planillas.
//
// Idea: cada planilla guarda la fecha (fecha_q1 / fecha_q2) en que se envio a
// facturar cada quincena. Con el historial de los ultimos meses se aprende el
// "dia tipico" de envio de cada aseguradora (mediana del dia del mes) y se
// compara con la fecha de hoy para avisar que esta atrasada o por vencer.

export const HISTORY_MONTHS = 6; // se usan hasta 6 meses; si hay menos, se usa lo disponible
export const ANTICIPACION_DAYS = 2; // "se acerca" aparece N dias antes del dia tipico
export const DEFAULT_Q1_DAY = 5; // estimado cuando no hay historial
export const DEFAULT_Q2_DAY = 20;

export type QuincenaAlertStatus =
  | "sent" // ya se envio este mes
  | "overdue" // ya paso el dia tipico y no se ha enviado
  | "upcoming" // se acerca el dia tipico
  | "ok" // aun no llega el dia tipico
  | "disabled" // la compania tiene alertas apagadas
  | "na"; // no aplica (q2 en frecuencia 1, o mes no actual)

export type QuincenaAlert = {
  status: QuincenaAlertStatus;
  typicalDay: number | null;
  estimated: boolean;
  daysDiff: number | null; // hoy - diaTipico (positivo = atrasado)
  samples: number;
};

export type CompaniaAlert = {
  key: string;
  nombre: string;
  tipo: string;
  frecuencia: 1 | 2;
  alertasActivas: boolean;
  q1: QuincenaAlert;
  q2: QuincenaAlert | null;
  worst: "overdue" | "upcoming" | "none";
};

export type PlanillasAlertSummary = {
  overdueCount: number;
  upcomingCount: number;
  companiasOverdue: string[];
  companiasUpcoming: string[];
};

export type CompaniaInput = {
  nombre: string;
  tipo: string;
  frecuencia_quincenas: 1 | 2;
  alertas_activas: boolean;
};

export type PlanillaHistRow = {
  compania: string;
  tipo: string;
  mes: number;
  anio: number;
  quincena1: boolean;
  fecha_q1: string | null;
  quincena2: boolean;
  fecha_q2: string | null;
};

export function planillaAlertKey(nombre: string, tipo: string) {
  return `${nombre}||${tipo}`;
}

// Extrae el dia del mes (1-31) de una fecha en formato YYYY-MM-DD, DD/MM/YYYY o DD-MM-YYYY.
function extractDayOfMonth(value: string | null | undefined): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const day = Number(iso.slice(8, 10));
    return day >= 1 && day <= 31 ? day : null;
  }

  const parts = raw.split(/[/-]/);
  if (parts.length === 3 && parts[0].length <= 2) {
    const day = Number(parts[0]);
    return day >= 1 && day <= 31 ? day : null;
  }

  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function daysInMonth(anio: number, mes: number) {
  return new Date(anio, mes, 0).getDate(); // mes 1-based
}

function buildQuincenaAlert(params: {
  historyDays: number[];
  defaultDay: number;
  sentThisMonth: boolean;
  alertasActivas: boolean;
  isCurrentMonth: boolean;
  todayDay: number;
  targetAnio: number;
  targetMes: number;
}): QuincenaAlert {
  const { historyDays, defaultDay, sentThisMonth, alertasActivas, isCurrentMonth, todayDay, targetAnio, targetMes } = params;

  const samples = historyDays.length;
  const estimated = samples === 0;
  const rawTypical = estimated ? defaultDay : median(historyDays);
  const typicalDay = Math.min(rawTypical, daysInMonth(targetAnio, targetMes));

  if (!alertasActivas) {
    return { status: "disabled", typicalDay, estimated, daysDiff: null, samples };
  }
  if (!isCurrentMonth) {
    return { status: "na", typicalDay, estimated, daysDiff: null, samples };
  }
  if (sentThisMonth) {
    return { status: "sent", typicalDay, estimated, daysDiff: null, samples };
  }

  const daysDiff = todayDay - typicalDay;
  let status: QuincenaAlertStatus;
  if (daysDiff >= 0) status = "overdue";
  else if (daysDiff >= -ANTICIPACION_DAYS) status = "upcoming";
  else status = "ok";

  return { status, typicalDay, estimated, daysDiff, samples };
}

export function computePlanillaAlerts(params: {
  companias: CompaniaInput[];
  history: PlanillaHistRow[]; // planillas de meses ANTERIORES al objetivo
  current: PlanillaHistRow[]; // planillas del mes objetivo
  targetMes: number; // 1-based
  targetAnio: number;
  today: Date; // referencia para "hoy" (zona del servidor)
}): { alerts: Record<string, CompaniaAlert>; summary: PlanillasAlertSummary } {
  const { companias, history, current, targetMes, targetAnio, today } = params;

  const isCurrentMonth = today.getFullYear() === targetAnio && today.getMonth() + 1 === targetMes;
  const todayDay = today.getDate();

  // Indexa historial por compania para juntar los dias de envio.
  const histByKey = new Map<string, { q1: number[]; q2: number[] }>();
  for (const row of history) {
    const key = planillaAlertKey(row.compania, row.tipo);
    const bucket = histByKey.get(key) ?? { q1: [], q2: [] };
    if (row.quincena1) {
      const d = extractDayOfMonth(row.fecha_q1);
      if (d) bucket.q1.push(d);
    }
    if (row.quincena2) {
      const d = extractDayOfMonth(row.fecha_q2);
      if (d) bucket.q2.push(d);
    }
    histByKey.set(key, bucket);
  }

  const currentByKey = new Map<string, PlanillaHistRow>();
  for (const row of current) {
    currentByKey.set(planillaAlertKey(row.compania, row.tipo), row);
  }

  const alerts: Record<string, CompaniaAlert> = {};
  const summary: PlanillasAlertSummary = {
    overdueCount: 0,
    upcomingCount: 0,
    companiasOverdue: [],
    companiasUpcoming: []
  };

  for (const compania of companias) {
    const key = planillaAlertKey(compania.nombre, compania.tipo);
    const hist = histByKey.get(key) ?? { q1: [], q2: [] };
    const cur = currentByKey.get(key);

    const q1 = buildQuincenaAlert({
      historyDays: hist.q1,
      defaultDay: DEFAULT_Q1_DAY,
      sentThisMonth: Boolean(cur?.quincena1),
      alertasActivas: compania.alertas_activas,
      isCurrentMonth,
      todayDay,
      targetAnio,
      targetMes
    });

    const q2 =
      compania.frecuencia_quincenas === 2
        ? buildQuincenaAlert({
            historyDays: hist.q2,
            defaultDay: DEFAULT_Q2_DAY,
            sentThisMonth: Boolean(cur?.quincena2),
            alertasActivas: compania.alertas_activas,
            isCurrentMonth,
            todayDay,
            targetAnio,
            targetMes
          })
        : null;

    const statuses = [q1.status, q2?.status].filter(Boolean) as QuincenaAlertStatus[];
    const worst: CompaniaAlert["worst"] = statuses.includes("overdue")
      ? "overdue"
      : statuses.includes("upcoming")
        ? "upcoming"
        : "none";

    if (worst === "overdue") summary.companiasOverdue.push(compania.nombre);
    if (worst === "upcoming") summary.companiasUpcoming.push(compania.nombre);
    if (q1.status === "overdue") summary.overdueCount++;
    if (q1.status === "upcoming") summary.upcomingCount++;
    if (q2?.status === "overdue") summary.overdueCount++;
    if (q2?.status === "upcoming") summary.upcomingCount++;

    alerts[key] = {
      key,
      nombre: compania.nombre,
      tipo: compania.tipo,
      frecuencia: compania.frecuencia_quincenas,
      alertasActivas: compania.alertas_activas,
      q1,
      q2,
      worst
    };
  }

  return { alerts, summary };
}

// Lista de (mes, anio) para el mes objetivo + los N meses anteriores.
export function buildMonthWindow(targetMes: number, targetAnio: number, monthsBack: number) {
  const out: Array<{ mes: number; anio: number }> = [];
  for (let i = 0; i <= monthsBack; i++) {
    const d = new Date(targetAnio, targetMes - 1 - i, 1);
    out.push({ mes: d.getMonth() + 1, anio: d.getFullYear() });
  }
  return out;
}
