import type { FacturaPayload } from "@/lib/cartera-facturas";
import { buildRecordatorioDetalle, buildMorososPorTercero, type MorosoPorTerceroItem, type RecordatorioDetalleResponse } from "@/lib/cartera-recordatorios";
import type { CarteraProjectionPayload, PlanillaMap, PlanillaRow, RecaudoRow } from "@/lib/modules/cartera";
import type { CarteraSeguimientoItem, CarteraSeguimientoResultado, CarteraSeguimientoTipo } from "@/lib/cartera-seguimiento";
import {
  buildMonthWindow,
  computePlanillaAlerts,
  HISTORY_MONTHS,
  type CompaniaInput,
  type PlanillaHistRow
} from "@/lib/planillas-alertas";

type PlanillaCompania = {
  id: number;
  nombre: string;
  tipo: string;
  frecuencia_quincenas: 1 | 2;
  activo: boolean;
  alertas_activas: boolean;
  portal_detalle: string;
  correo_remitente: string;
  correo_destino: string;
  recepcion_notas: string;
};

type CompaniaInputFields = {
  nombre: string;
  tipo: string;
  frecuencia_quincenas: number;
  alertas_activas?: boolean;
  portal_detalle?: string;
  correo_remitente?: string;
  correo_destino?: string;
  recepcion_notas?: string;
};

type DemoDirectorioRow = { id: number; nombre: string };
type DemoDirectorioContactoRow = { directorio_id: number; rol: string; email: string };
type DemoContactoEmpresaRow = { empresa: "SYSO" | "SANUM"; razon_social: string; email: string; activo: boolean };

const initialFacturas: FacturaPayload[] = [
  {
    empresa: "CMYM",
    numero_factura: "FC-24001",
    fecha_elaboracion: "2026-01-08",
    nombre_tercero: "Arl Sura",
    detalle: "Renovacion enero",
    debito: 48200000,
    estado: "PAGADA",
    tipo: "ARL",
    fecha_pago: "2026-01-23",
    valor_pagado: 48200000,
    codigo_contable: "4135",
    mes: 1,
    anio: 2026,
    identificacion: "900111222"
  },
  {
    empresa: "CMYM",
    numero_factura: "FC-24018",
    fecha_elaboracion: "2026-02-10",
    nombre_tercero: "Colsanitas",
    detalle: "Plan corporativo febrero",
    debito: 39150000,
    estado: "PAGADA",
    tipo: "SALUD",
    fecha_pago: "2026-02-28",
    valor_pagado: 39150000,
    codigo_contable: "4135",
    mes: 2,
    anio: 2026,
    identificacion: "901223344"
  },
  {
    empresa: "CMYM",
    numero_factura: "FC-24033",
    fecha_elaboracion: "2026-03-06",
    nombre_tercero: "Seguros del Estado",
    detalle: "Polizas colectivas marzo",
    debito: 11840000,
    estado: "PENDIENTE",
    tipo: "SEGUROS",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4135",
    mes: 3,
    anio: 2026,
    identificacion: "890123450"
  },
  {
    empresa: "CMYM",
    numero_factura: "FC-24034",
    fecha_elaboracion: "2026-03-12",
    nombre_tercero: "Positiva Compañía de Seguros (Arl)",
    detalle: "Ajuste convenio marzo",
    debito: 9650000,
    estado: "PENDIENTE",
    tipo: "ARL",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4135",
    mes: 3,
    anio: 2026,
    identificacion: "860011153"
  },
  {
    empresa: "CMYM",
    numero_factura: "FC-24039",
    fecha_elaboracion: "2026-04-02",
    nombre_tercero: "Arl Sura",
    detalle: "Renovacion abril",
    debito: 50120000,
    estado: "PENDIENTE",
    tipo: "ARL",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4135",
    mes: 4,
    anio: 2026,
    identificacion: "900111222"
  },
  {
    empresa: "CMYM",
    numero_factura: "FC-24042",
    fecha_elaboracion: "2026-04-15",
    nombre_tercero: "Berkley",
    detalle: "Poliza complementaria abril",
    debito: 4575000,
    estado: "ANULADA",
    tipo: "SEGUROS",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4135",
    mes: 4,
    anio: 2026,
    identificacion: "900333444"
  },
  {
    empresa: "SYSO",
    numero_factura: "SY-1908",
    fecha_elaboracion: "2026-02-04",
    nombre_tercero: "Constructora Delta",
    detalle: "Servicio SST febrero",
    debito: 8900000,
    estado: "PAGADA",
    tipo: "OTROS",
    fecha_pago: "2026-02-20",
    valor_pagado: 8900000,
    codigo_contable: "4140",
    mes: 2,
    anio: 2026,
    identificacion: "901778899"
  },
  {
    empresa: "SYSO",
    numero_factura: "SY-1931",
    fecha_elaboracion: "2026-03-05",
    nombre_tercero: "Transportes Andina",
    detalle: "Servicio SST marzo",
    debito: 12350000,
    estado: "PENDIENTE",
    tipo: "OTROS",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4140",
    mes: 3,
    anio: 2026,
    identificacion: "901555000"
  },
  {
    empresa: "SYSO",
    numero_factura: "SY-1944",
    fecha_elaboracion: "2026-04-11",
    nombre_tercero: "Logistica del Norte",
    detalle: "Capacitacion brigadas",
    debito: 7450000,
    estado: "PENDIENTE",
    tipo: "OTROS",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4140",
    mes: 4,
    anio: 2026,
    identificacion: "900654321"
  },
  {
    empresa: "SANUM",
    numero_factura: "SA-880",
    fecha_elaboracion: "2026-02-14",
    nombre_tercero: "Clinica Horizonte",
    detalle: "Programa bienestar",
    debito: 13400000,
    estado: "PAGADA",
    tipo: "OTROS",
    fecha_pago: "2026-03-01",
    valor_pagado: 13400000,
    codigo_contable: "4150",
    mes: 2,
    anio: 2026,
    identificacion: "890456789"
  },
  {
    empresa: "SANUM",
    numero_factura: "SA-913",
    fecha_elaboracion: "2026-03-18",
    nombre_tercero: "Fundacion Amanecer",
    detalle: "Acompañamiento ocupacional",
    debito: 9870000,
    estado: "PENDIENTE",
    tipo: "OTROS",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4150",
    mes: 3,
    anio: 2026,
    identificacion: "901009988"
  },
  {
    empresa: "SANUM",
    numero_factura: "SA-927",
    fecha_elaboracion: "2026-04-09",
    nombre_tercero: "Clinica Horizonte",
    detalle: "Seguimiento abril",
    debito: 14150000,
    estado: "PENDIENTE",
    tipo: "OTROS",
    fecha_pago: null,
    valor_pagado: 0,
    codigo_contable: "4150",
    mes: 4,
    anio: 2026,
    identificacion: "890456789"
  }
];

function buildCompania(input: Partial<PlanillaCompania> & { id: number; nombre: string; tipo: string; frecuencia_quincenas: 1 | 2 }): PlanillaCompania {
  return {
    activo: true,
    alertas_activas: true,
    portal_detalle: "",
    correo_remitente: "",
    correo_destino: "",
    recepcion_notas: "",
    ...input
  };
}

const initialCompanias: PlanillaCompania[] = [
  buildCompania({ id: 1, nombre: "Arl Sura", tipo: "ARL", frecuencia_quincenas: 2, portal_detalle: "Portal proveedores Sura", correo_remitente: "facturacion@demo-portafolio.co", correo_destino: "cartera-sura@demo-portafolio.co", recepcion_notas: "Recibo quincenal por portal" }),
  buildCompania({ id: 2, nombre: "Colsanitas", tipo: "SALUD", frecuencia_quincenas: 2, portal_detalle: "Portal aliados Colsanitas", recepcion_notas: "Llega por correo el día 7 y 22" }),
  buildCompania({ id: 3, nombre: "Seguros del Estado", tipo: "Seguros", frecuencia_quincenas: 2 }),
  buildCompania({ id: 4, nombre: "Positiva Compañía de Seguros (Arl)", tipo: "ARL", frecuencia_quincenas: 1, alertas_activas: false, recepcion_notas: "Mensual, sin alertas configuradas" }),
  buildCompania({ id: 5, nombre: "Constructora Delta", tipo: "Seguros", frecuencia_quincenas: 1 }),
  buildCompania({ id: 6, nombre: "Transportes Andina", tipo: "Seguros", frecuencia_quincenas: 2 }),
  buildCompania({ id: 7, nombre: "Clinica Horizonte", tipo: "Seguros", frecuencia_quincenas: 2 }),
  buildCompania({ id: 8, nombre: "Fundacion Amanecer", tipo: "Seguros", frecuencia_quincenas: 1 })
];

const initialPlanillasByPeriod: Record<string, PlanillaMap> = {
  "2026-2": {
    "Arl Sura||ARL": { q1: true, fq1: "2026-02-05", q2: true, fq2: "2026-02-19", fact_q1: true, fact_q2: true, obs: "" },
    "Colsanitas||SALUD": { q1: true, fq1: "2026-02-07", q2: true, fq2: "2026-02-21", fact_q1: true, fact_q2: true, obs: "" },
    "Seguros del Estado||Seguros": { q1: true, fq1: "2026-02-11", q2: true, fq2: "2026-02-24", fact_q1: true, fact_q2: true, obs: "" },
    "Transportes Andina||Seguros": { q1: true, fq1: "2026-02-12", q2: true, fq2: "2026-02-25", fact_q1: true, fact_q2: true, obs: "" },
    "Clinica Horizonte||Seguros": { q1: true, fq1: "2026-02-08", q2: true, fq2: "2026-02-23", fact_q1: true, fact_q2: true, obs: "" }
  },
  "2026-3": {
    "Arl Sura||ARL": { q1: true, fq1: "2026-03-06", q2: true, fq2: "2026-03-20", fact_q1: true, fact_q2: true, obs: "" },
    "Colsanitas||SALUD": { q1: true, fq1: "2026-03-07", q2: true, fq2: "2026-03-22", fact_q1: true, fact_q2: true, obs: "" },
    "Seguros del Estado||Seguros": { q1: true, fq1: "2026-03-10", q2: true, fq2: "2026-03-24", fact_q1: true, fact_q2: false, obs: "" },
    "Transportes Andina||Seguros": { q1: true, fq1: "2026-03-12", q2: true, fq2: "2026-03-25", fact_q1: true, fact_q2: true, obs: "" },
    "Clinica Horizonte||Seguros": { q1: true, fq1: "2026-03-09", q2: true, fq2: "2026-03-24", fact_q1: true, fact_q2: true, obs: "" }
  },
  "2026-4": {
    "Arl Sura||ARL": { q1: true, fq1: "2026-04-05", q2: true, fq2: "2026-04-19", fact_q1: true, fact_q2: false, obs: "Falta soporte Q2" },
    "Colsanitas||SALUD": { q1: true, fq1: "2026-04-07", q2: true, fq2: "2026-04-22", fact_q1: true, fact_q2: true, obs: "" },
    "Seguros del Estado||Seguros": { q1: true, fq1: "2026-04-10", q2: false, fq2: "", fact_q1: false, fact_q2: false, obs: "Pendiente cierre de novedades" },
    "Positiva Compañía de Seguros (Arl)||ARL": { q1: false, fq1: "", q2: false, fq2: "", fact_q1: false, fact_q2: false, obs: "No recibida" },
    "Transportes Andina||Seguros": { q1: true, fq1: "2026-04-12", q2: true, fq2: "2026-04-25", fact_q1: true, fact_q2: true, obs: "" },
    "Clinica Horizonte||Seguros": { q1: true, fq1: "2026-04-08", q2: true, fq2: "2026-04-24", fact_q1: true, fact_q2: false, obs: "Factura final en elaboración" }
  }
};

const demoProjection: CarteraProjectionPayload = {
  proyecciones: [
    { empresa: "CMYM", compania: "Arl Sura", tipo: "ARL", proyeccion: 51200000, variacion: 8.4, estabilidad: "ALTA", n_meses: 6, outliers: 0, historico: { "2025-11": 48600000, "2025-12": 49200000, "2026-01": 48200000, "2026-02": 49800000, "2026-03": 50500000, "2026-04": 50120000 }, distribucion_semanas: [0.2, 0.3, 0.25, 0.25] },
    { empresa: "CMYM", compania: "Colsanitas", tipo: "SALUD", proyeccion: 40300000, variacion: 12.1, estabilidad: "ALTA", n_meses: 5, outliers: 0, historico: { "2025-12": 37200000, "2026-01": 38800000, "2026-02": 39150000, "2026-03": 40100000, "2026-04": 40900000 }, distribucion_semanas: [0.15, 0.35, 0.25, 0.25] },
    { empresa: "CMYM", compania: "Seguros del Estado", tipo: "SEGUROS", proyeccion: 12600000, variacion: 28.2, estabilidad: "MEDIA", n_meses: 4, outliers: 0, historico: { "2026-01": 10400000, "2026-02": 11200000, "2026-03": 11840000, "2026-04": 12100000 }, distribucion_semanas: [0.25, 0.25, 0.3, 0.2] },
    { empresa: "SYSO", compania: "Transportes Andina", tipo: "OTROS", proyeccion: 11800000, variacion: 17.4, estabilidad: "MEDIA", n_meses: 4, outliers: 0, historico: { "2026-01": 9800000, "2026-02": 10400000, "2026-03": 12350000, "2026-04": 11700000 }, distribucion_semanas: [0.1, 0.2, 0.35, 0.35] },
    { empresa: "SANUM", compania: "Clinica Horizonte", tipo: "OTROS", proyeccion: 13900000, variacion: 11.3, estabilidad: "ALTA", n_meses: 4, outliers: 0, historico: { "2026-01": 12600000, "2026-02": 13400000, "2026-03": 13750000, "2026-04": 14150000 }, distribucion_semanas: [0.2, 0.25, 0.25, 0.3] }
  ],
  no_recurrentes: [
    { empresa: "SANUM", compania: "Fundacion Amanecer", tipo: "OTROS", total: 9870000, n_meses: 1, historico: { "2026-03": 9870000 }, distribucion_semanas: [0, 0, 1, 0] }
  ],
  total_proyectado: 128300000,
  total_alta: 105400000,
  total_media: 22900000,
  total_baja: 0,
  mes_proyeccion: "MAY-2026",
  semanas_mes: [
    { semana: 1, desde: 1, hasta: 7, label: "1-7 may" },
    { semana: 2, desde: 8, hasta: 14, label: "8-14 may" },
    { semana: 3, desde: 15, hasta: 21, label: "15-21 may" },
    { semana: 4, desde: 22, hasta: 31, label: "22-31 may" }
  ]
};

const demoDirectorio: DemoDirectorioRow[] = [
  { id: 1, nombre: "Arl Sura" },
  { id: 2, nombre: "Seguros del Estado" },
  { id: 3, nombre: "Transportes Andina" },
  { id: 4, nombre: "Logistica del Norte" },
  { id: 5, nombre: "Clinica Horizonte" },
  { id: 6, nombre: "Fundacion Amanecer" }
];

const demoDirectorioContactos: DemoDirectorioContactoRow[] = [
  { directorio_id: 1, rol: "Cartera", email: "pagos.arlsura@demo.com" },
  { directorio_id: 2, rol: "Cartera", email: "cartera.segurosestado@demo.com" },
  { directorio_id: 3, rol: "Cartera", email: "tesoreria@transportesandina.demo" },
  { directorio_id: 4, rol: "Cartera", email: "pagos@logisticanorte.demo" },
  { directorio_id: 5, rol: "Cartera", email: "cuentas@clinicahorizonte.demo" },
  { directorio_id: 6, rol: "Cartera", email: "finanzas@fundacionamanecer.demo" }
];

const demoContactosEmpresa: DemoContactoEmpresaRow[] = [
  { empresa: "SYSO", razon_social: "SYSO", email: "cartera@demo.example", activo: true },
  { empresa: "SANUM", razon_social: "SANUM", email: "cartera@demo.example", activo: true }
];

let demoFacturas = initialFacturas.map((row) => ({ ...row }));
const DEMO_LAST_IMPORT_DATE = "2026-04-30T18:45:00-05:00";

let demoCompanias = initialCompanias.map((row) => ({ ...row }));
let demoPlanillasByPeriod = clonePlanillasByPeriod(initialPlanillasByPeriod);

function clonePlanillasByPeriod(source: Record<string, PlanillaMap>) {
  return Object.fromEntries(
    Object.entries(source).map(([period, map]) => [
      period,
      Object.fromEntries(Object.entries(map).map(([key, value]) => [key, { ...value }]))
    ])
  ) as Record<string, PlanillaMap>;
}

function periodKey(anio: number, mes: number) {
  return `${anio}-${mes}`;
}

function facturaKey(row: { empresa: string; numero_factura: string }) {
  return `${row.empresa}::${row.numero_factura}`;
}

function normalizePlanillaRow(row?: Partial<PlanillaRow>): PlanillaRow {
  return {
    q1: Boolean(row?.q1),
    fq1: String(row?.fq1 ?? ""),
    q2: Boolean(row?.q2),
    fq2: String(row?.fq2 ?? ""),
    fact_q1: Boolean(row?.fact_q1),
    fact_q2: Boolean(row?.fact_q2),
    obs: String(row?.obs ?? "")
  };
}

function toRecaudoRow(row: FacturaPayload): RecaudoRow {
  return {
    compania: row.nombre_tercero,
    valor: row.debito,
    pagado: row.valor_pagado,
    fecha_factura: row.fecha_elaboracion,
    fecha_pago: row.fecha_pago ?? "",
    estado: row.estado,
    tipo: row.tipo,
    numero_factura: row.numero_factura,
    mes: row.mes,
    anio: row.anio,
    empresa: row.empresa,
    detalle: row.detalle ?? "",
    codigo_contable: row.codigo_contable ?? "",
    identificacion: row.identificacion ?? ""
  };
}

function buildProjectionForEmpresa(empresa: string) {
  if (!empresa || empresa === "TODAS") return demoProjection;
  const proyecciones = demoProjection.proyecciones.filter((item) => item.empresa === empresa);
  const noRecurrentes = demoProjection.no_recurrentes.filter((item) => item.empresa === empresa);
  const totalAlta = proyecciones.filter((item) => item.estabilidad === "ALTA").reduce((sum, item) => sum + item.proyeccion, 0);
  const totalMedia = proyecciones.filter((item) => item.estabilidad === "MEDIA").reduce((sum, item) => sum + item.proyeccion, 0);
  const totalBaja = proyecciones.filter((item) => item.estabilidad === "BAJA").reduce((sum, item) => sum + item.proyeccion, 0);
  return {
    ...demoProjection,
    proyecciones,
    no_recurrentes: noRecurrentes,
    total_proyectado: proyecciones.reduce((sum, item) => sum + item.proyeccion, 0),
    total_alta: totalAlta,
    total_media: totalMedia,
    total_baja: totalBaja
  };
}

export function getDemoCarteraPageData() {
  return {
    recaudos: demoFacturas.map(toRecaudoRow),
    planillas: {
      companias: demoCompanias
        .filter((item) => item.activo)
        .map(({ id, nombre, tipo, frecuencia_quincenas, alertas_activas, portal_detalle, correo_remitente, correo_destino, recepcion_notas }) => ({
          id,
          nombre,
          tipo,
          frecuencia_quincenas,
          alertas_activas,
          portal_detalle,
          correo_remitente,
          correo_destino,
          recepcion_notas
        }))
    },
    lastImportDate: DEMO_LAST_IMPORT_DATE
  };
}

export function listDemoFacturas(params: { empresa?: string; estado?: string; q?: string; page?: number; limit?: number }) {
  const empresa = String(params.empresa ?? "ALL").toUpperCase();
  const estado = String(params.estado ?? "ALL").toUpperCase();
  const q = String(params.q ?? "").trim().toLowerCase();
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const limit = Math.min(5000, Math.max(1, Number(params.limit ?? 50) || 50));

  const filtered = demoFacturas
    .filter((row) => empresa === "ALL" || row.empresa === empresa)
    .filter((row) => estado === "ALL" || row.estado === estado)
    .filter((row) => !q || row.numero_factura.toLowerCase().includes(q))
    .sort((a, b) => `${b.fecha_elaboracion}::${b.numero_factura}`.localeCompare(`${a.fecha_elaboracion}::${a.numero_factura}`));

  const from = (page - 1) * limit;
  return {
    facturas: filtered.slice(from, from + limit).map((row) => ({ ...row })),
    total: filtered.length,
    page,
    limit
  };
}

export function createDemoFactura(payload: FacturaPayload) {
  const exists = demoFacturas.find((item) => item.empresa === payload.empresa && item.numero_factura === payload.numero_factura);
  if (exists) return null;
  demoFacturas = [payload, ...demoFacturas];
  return { ...payload };
}

export function updateDemoFactura(payload: FacturaPayload, original: { empresa: string; numero_factura: string }) {
  const currentIndex = demoFacturas.findIndex((item) => item.empresa === original.empresa && item.numero_factura === original.numero_factura);
  if (currentIndex < 0) return { type: "missing" as const };

  const duplicate = demoFacturas.find((item, index) => index !== currentIndex && item.empresa === payload.empresa && item.numero_factura === payload.numero_factura);
  if (duplicate) return { type: "duplicate" as const };

  demoFacturas[currentIndex] = payload;
  return { type: "ok" as const, factura: { ...payload } };
}

export function deleteDemoFactura(target: { empresa: string; numero_factura: string }) {
  const before = demoFacturas.length;
  demoFacturas = demoFacturas.filter((item) => item.empresa !== target.empresa || item.numero_factura !== target.numero_factura);
  return demoFacturas.length !== before;
}

export function getDemoPlanillas(mes: number, anio: number) {
  const key = periodKey(anio, mes);
  const source = demoPlanillasByPeriod[key] ?? {};
  return Object.fromEntries(Object.entries(source).map(([planillaKey, row]) => [planillaKey, { ...row }])) as PlanillaMap;
}

export function saveDemoPlanilla(row: Record<string, unknown>) {
  const compania = String(row.compania ?? "").trim();
  const tipo = String(row.tipo ?? "").trim();
  const mes = Number(row.mes ?? 0);
  const anio = Number(row.anio ?? 0);
  const key = periodKey(anio, mes);
  if (!demoPlanillasByPeriod[key]) demoPlanillasByPeriod[key] = {};
  demoPlanillasByPeriod[key][`${compania}||${tipo}`] = normalizePlanillaRow(row as Partial<PlanillaRow>);
}

function planillaRowToHist(compania: string, tipo: string, mes: number, anio: number, row: PlanillaRow): PlanillaHistRow {
  return {
    compania,
    tipo,
    mes,
    anio,
    quincena1: Boolean(row.q1),
    fecha_q1: row.fq1 || null,
    quincena2: Boolean(row.q2),
    fecha_q2: row.fq2 || null
  };
}

export function getDemoPlanillasAlertas(mes: number, anio: number) {
  const companias: CompaniaInput[] = demoCompanias
    .filter((item) => item.activo)
    .map((item) => ({
      nombre: item.nombre,
      tipo: item.tipo,
      frecuencia_quincenas: item.frecuencia_quincenas === 1 ? 1 : 2,
      alertas_activas: item.alertas_activas
    }));

  const window = buildMonthWindow(mes, anio, HISTORY_MONTHS);
  const allRows: PlanillaHistRow[] = [];
  window.forEach(({ mes: m, anio: a }) => {
    const source = demoPlanillasByPeriod[periodKey(a, m)] ?? {};
    Object.entries(source).forEach(([key, row]) => {
      const sep = key.indexOf("||");
      const compania = sep >= 0 ? key.slice(0, sep) : key;
      const tipo = sep >= 0 ? key.slice(sep + 2) : "Seguros";
      allRows.push(planillaRowToHist(compania, tipo, m, a, row));
    });
  });

  const current = allRows.filter((row) => row.mes === mes && row.anio === anio);
  const history = allRows.filter((row) => !(row.mes === mes && row.anio === anio));

  const { alerts, summary } = computePlanillaAlerts({
    companias,
    history,
    current,
    targetMes: mes,
    targetAnio: anio,
    today: new Date()
  });

  return { mes, anio, alerts, summary };
}

let demoSeguimientos: CarteraSeguimientoItem[] = [
  {
    id: "demo-seg-1",
    created_at: "2026-04-22T14:30:00-05:00",
    empresa: "CMYM",
    tercero: "Seguros del Estado",
    tipo_gestion: "correo_manual",
    resultado: "correo_enviado",
    observacion: "Se envió estado de cuenta y soportes de marzo.",
    proxima_fecha: "2026-05-05",
    actor_usuario: "demo.admin",
    actor_nombre: "Demo Portfolio"
  },
  {
    id: "demo-seg-2",
    created_at: "2026-04-10T09:15:00-05:00",
    empresa: "CMYM",
    tercero: "Positiva Compañía de Seguros (Arl)",
    tipo_gestion: "llamada",
    resultado: "promesa_pago",
    observacion: "Confirman pago para la próxima semana.",
    proxima_fecha: null,
    actor_usuario: "gerencia.demo",
    actor_nombre: "Gerencia Demo"
  }
];

function seguimientoKey(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, " ");
}

export function listDemoSeguimientos(tercero: string, empresa: string): CarteraSeguimientoItem[] {
  const t = seguimientoKey(tercero);
  const e = empresa.trim().toUpperCase();
  return demoSeguimientos
    .filter((row) => row.empresa === e && seguimientoKey(row.tercero) === t)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .map((row) => ({ ...row }));
}

export function createDemoSeguimiento(
  payload: {
    empresa: CarteraSeguimientoItem["empresa"];
    tercero: string;
    tipo_gestion: CarteraSeguimientoTipo;
    resultado: CarteraSeguimientoResultado;
    observacion: string | null;
    proxima_fecha: string | null;
  },
  actor: { usuario: string | null; nombre: string | null }
): CarteraSeguimientoItem {
  const item: CarteraSeguimientoItem = {
    id: `demo-seg-${Date.now()}`,
    created_at: new Date().toISOString(),
    empresa: payload.empresa,
    tercero: payload.tercero,
    tipo_gestion: payload.tipo_gestion,
    resultado: payload.resultado,
    observacion: payload.observacion,
    proxima_fecha: payload.proxima_fecha,
    actor_usuario: actor.usuario,
    actor_nombre: actor.nombre
  };
  demoSeguimientos = [item, ...demoSeguimientos];
  return item;
}

export function listDemoCompanias() {
  return demoCompanias.filter((item) => item.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((item) => ({ ...item }));
}

export function createDemoCompania(input: CompaniaInputFields) {
  const nextId = demoCompanias.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const created = buildCompania({
    id: nextId,
    nombre: input.nombre,
    tipo: input.tipo,
    frecuencia_quincenas: input.frecuencia_quincenas === 1 ? 1 : 2,
    activo: true,
    alertas_activas: input.alertas_activas === undefined ? true : Boolean(input.alertas_activas),
    portal_detalle: input.portal_detalle ?? "",
    correo_remitente: input.correo_remitente ?? "",
    correo_destino: input.correo_destino ?? "",
    recepcion_notas: input.recepcion_notas ?? ""
  });
  demoCompanias = [...demoCompanias, created];
  return { ...created };
}

export function updateDemoCompania(id: number, input: CompaniaInputFields) {
  const current = demoCompanias.find((item) => item.id === id && item.activo);
  if (!current) return null;
  const updated: PlanillaCompania = {
    ...current,
    nombre: input.nombre,
    tipo: input.tipo,
    frecuencia_quincenas: input.frecuencia_quincenas === 1 ? 1 : 2,
    alertas_activas: input.alertas_activas === undefined ? current.alertas_activas : Boolean(input.alertas_activas),
    portal_detalle: input.portal_detalle ?? current.portal_detalle,
    correo_remitente: input.correo_remitente ?? current.correo_remitente,
    correo_destino: input.correo_destino ?? current.correo_destino,
    recepcion_notas: input.recepcion_notas ?? current.recepcion_notas
  };
  demoCompanias = demoCompanias.map((item) => (item.id === id ? updated : item));
  return { ...updated };
}

export function deleteDemoCompania(id: number) {
  const current = demoCompanias.find((item) => item.id === id && item.activo);
  if (!current) return false;
  demoCompanias = demoCompanias.map((item) => (item.id === id ? { ...item, activo: false } : item));
  return true;
}

export function getDemoProjectionPayload(empresa?: string): CarteraProjectionPayload {
  return buildProjectionForEmpresa(String(empresa ?? "TODAS").toUpperCase());
}

export function getDemoTercerosSugeridos(q: string, empresa: string) {
  const search = q.trim().toLowerCase();
  if (search.length < 2) return [];
  const unique = new Set<string>();
  return demoFacturas
    .filter((item) => item.empresa === empresa)
    .map((item) => item.nombre_tercero.trim())
    .filter((name) => name.toLowerCase().includes(search))
    .filter((name) => {
      const key = name.toLowerCase();
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    })
    .slice(0, 10);
}

export function getDemoMorososPorTercero(): MorosoPorTerceroItem[] {
  return buildMorososPorTercero(
    demoFacturas.map((item) => ({
      empresa: item.empresa,
      nombre_tercero: item.nombre_tercero,
      numero_factura: item.numero_factura,
      fecha_elaboracion: item.fecha_elaboracion,
      debito: item.debito,
      estado: item.estado,
      tipo: item.tipo
    })),
    demoDirectorio,
    demoDirectorioContactos,
    demoContactosEmpresa
  );
}

export function getDemoRecordatorioDetalle(tercero: string, empresa: "CMYM" | "SYSO" | "SANUM"): RecordatorioDetalleResponse {
  return buildRecordatorioDetalle(
    tercero,
    empresa,
    demoFacturas.map((item) => ({
      empresa: item.empresa,
      nombre_tercero: item.nombre_tercero,
      numero_factura: item.numero_factura,
      fecha_elaboracion: item.fecha_elaboracion,
      debito: item.debito,
      estado: item.estado,
      tipo: item.tipo
    })),
    demoDirectorio,
    demoDirectorioContactos,
    demoContactosEmpresa
  );
}
