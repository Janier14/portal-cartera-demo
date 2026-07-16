import { normalizeArlData, type ArlData } from "@/lib/modules/arl";
import type { SegurosData } from "@/lib/modules/seguros";

const ARL_DETAIL = [
  {
    EMPRESA: "Clinica Horizonte",
    ARL: "ARL SURA",
    MES: "ene",
    NIT: "900100101-1",
    COMISION: 6800000,
    COMISION_NETA: 5950000,
    VALOR_RETENCION: 420000,
    VALOR_RETORNO: 430000,
    COTIZACION: 56200000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Transportes Andina",
    ARL: "POSITIVA",
    MES: "ene",
    NIT: "900100102-2",
    COMISION: 4900000,
    COMISION_NETA: 4350000,
    VALOR_RETENCION: 280000,
    VALOR_RETORNO: 270000,
    COTIZACION: 40800000,
    CIUDAD: "Medellin",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Fundacion Amanecer",
    ARL: "COLMENA",
    MES: "feb",
    NIT: "900100103-3",
    COMISION: 3600000,
    COMISION_NETA: 3180000,
    VALOR_RETENCION: 210000,
    VALOR_RETORNO: 210000,
    COTIZACION: 28700000,
    CIUDAD: "Cali",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Logistica Boreal",
    ARL: "COLPATRIA",
    MES: "feb",
    NIT: "900100104-4",
    COMISION: 4100000,
    COMISION_NETA: 3660000,
    VALOR_RETENCION: 220000,
    VALOR_RETORNO: 220000,
    COTIZACION: 32100000,
    CIUDAD: "Barranquilla",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Innova Sys",
    ARL: "ARL COLSANITAS",
    MES: "mar",
    NIT: "900100105-5",
    COMISION: 5200000,
    COMISION_NETA: 4590000,
    VALOR_RETENCION: 305000,
    VALOR_RETORNO: 305000,
    COTIZACION: 43300000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Clinica Horizonte",
    ARL: "ARL SURA",
    MES: "abr",
    NIT: "900100101-1",
    COMISION: 7100000,
    COMISION_NETA: 6210000,
    VALOR_RETENCION: 445000,
    VALOR_RETORNO: 445000,
    COTIZACION: 58900000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Transportes Andina",
    ARL: "POSITIVA",
    MES: "may",
    NIT: "900100102-2",
    COMISION: 5300000,
    COMISION_NETA: 4700000,
    VALOR_RETENCION: 300000,
    VALOR_RETORNO: 300000,
    COTIZACION: 44100000,
    CIUDAD: "Medellin",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Fundacion Amanecer",
    ARL: "COLMENA",
    MES: "jun",
    NIT: "900100103-3",
    COMISION: 3950000,
    COMISION_NETA: 3500000,
    VALOR_RETENCION: 225000,
    VALOR_RETORNO: 225000,
    COTIZACION: 30200000,
    CIUDAD: "Cali",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Logistica Boreal",
    ARL: "COLPATRIA",
    MES: "jul",
    NIT: "900100104-4",
    COMISION: 4380000,
    COMISION_NETA: 3890000,
    VALOR_RETENCION: 245000,
    VALOR_RETORNO: 245000,
    COTIZACION: 33800000,
    CIUDAD: "Barranquilla",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Innova Sys",
    ARL: "ARL COLSANITAS",
    MES: "ago",
    NIT: "900100105-5",
    COMISION: 5480000,
    COMISION_NETA: 4840000,
    VALOR_RETENCION: 320000,
    VALOR_RETORNO: 320000,
    COTIZACION: 45100000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Clinica Horizonte",
    ARL: "ARL SURA",
    MES: "sep",
    NIT: "900100101-1",
    COMISION: 7350000,
    COMISION_NETA: 6430000,
    VALOR_RETENCION: 460000,
    VALOR_RETORNO: 460000,
    COTIZACION: 60400000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Transportes Andina",
    ARL: "POSITIVA",
    MES: "oct",
    NIT: "900100102-2",
    COMISION: 5590000,
    COMISION_NETA: 4950000,
    VALOR_RETENCION: 320000,
    VALOR_RETORNO: 320000,
    COTIZACION: 45800000,
    CIUDAD: "Medellin",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Fundacion Amanecer",
    ARL: "COLMENA",
    MES: "nov",
    NIT: "900100103-3",
    COMISION: 4180000,
    COMISION_NETA: 3710000,
    VALOR_RETENCION: 235000,
    VALOR_RETORNO: 235000,
    COTIZACION: 31800000,
    CIUDAD: "Cali",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Logistica Boreal",
    ARL: "COLPATRIA",
    MES: "dic",
    NIT: "900100104-4",
    COMISION: 4620000,
    COMISION_NETA: 4110000,
    VALOR_RETENCION: 255000,
    VALOR_RETORNO: 255000,
    COTIZACION: 34900000,
    CIUDAD: "Barranquilla",
    "AÃƒâ€˜O": 2025
  },
  {
    EMPRESA: "Innova Sys",
    ARL: "ARL COLSANITAS",
    MES: "ene",
    NIT: "900100105-5",
    COMISION: 5660000,
    COMISION_NETA: 4990000,
    VALOR_RETENCION: 335000,
    VALOR_RETORNO: 335000,
    COTIZACION: 46800000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2026
  },
  {
    EMPRESA: "Clinica Horizonte",
    ARL: "ARL SURA",
    MES: "feb",
    NIT: "900100101-1",
    COMISION: 7540000,
    COMISION_NETA: 6590000,
    VALOR_RETENCION: 475000,
    VALOR_RETORNO: 475000,
    COTIZACION: 62100000,
    CIUDAD: "Bogota",
    "AÃƒâ€˜O": 2026
  },
  {
    EMPRESA: "Transportes Andina",
    ARL: "POSITIVA",
    MES: "mar",
    NIT: "900100102-2",
    COMISION: 5860000,
    COMISION_NETA: 5180000,
    VALOR_RETENCION: 340000,
    VALOR_RETORNO: 340000,
    COTIZACION: 47600000,
    CIUDAD: "Medellin",
    "AÃƒâ€˜O": 2026
  },
  {
    EMPRESA: "Fundacion Amanecer",
    ARL: "COLMENA",
    MES: "abr",
    NIT: "900100103-3",
    COMISION: 4460000,
    COMISION_NETA: 3950000,
    VALOR_RETENCION: 255000,
    VALOR_RETORNO: 255000,
    COTIZACION: 33600000,
    CIUDAD: "Cali",
    "AÃƒâ€˜O": 2026
  }
] as const;

function sumByKey<T>(rows: T[], keySelector: (row: T) => string, valueSelector: (row: T) => number) {
  return rows.reduce<Record<string, number>>((acc, row) => {
    const key = keySelector(row);
    acc[key] = (acc[key] ?? 0) + valueSelector(row);
    return acc;
  }, {});
}

function sortEntriesDesc(map: Record<string, number>) {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1]));
}

export function getDemoArlData(): ArlData {
  const detalle = ARL_DETAIL.map((row) => ({ ...row }));
  const porAnio = sumByKey(detalle, (row) => String(row["AÃƒâ€˜O"]), (row) => row.COMISION);
  const porAnioNeta = sumByKey(detalle, (row) => String(row["AÃƒâ€˜O"]), (row) => row.COMISION_NETA);
  const porArl = sumByKey(detalle, (row) => row.ARL, (row) => row.COMISION);
  const porArlNeta = sumByKey(detalle, (row) => row.ARL, (row) => row.COMISION_NETA);
  const porCiudad = sumByKey(detalle, (row) => String(row.CIUDAD ?? "").toUpperCase(), (row) => row.COMISION);
  const porCiudadNeta = sumByKey(detalle, (row) => String(row.CIUDAD ?? "").toUpperCase(), (row) => row.COMISION_NETA);
  const porMes = sumByKey(detalle, (row) => row.MES, (row) => row.COMISION);
  const porMesNeta = sumByKey(detalle, (row) => row.MES, (row) => row.COMISION_NETA);
  const topEmpresas = sortEntriesDesc(sumByKey(detalle, (row) => row.EMPRESA, (row) => row.COMISION));
  const topEmpresasNeta = sortEntriesDesc(sumByKey(detalle, (row) => row.EMPRESA, (row) => row.COMISION_NETA));

  const arlAnioMap = new Map<string, { ARL: string; COMISION: number; COMISION_NETA: number; "AÃƒâ€˜O": number }>();
  detalle.forEach((row) => {
    const key = `${row.ARL}::${row["AÃƒâ€˜O"]}`;
    const current = arlAnioMap.get(key) ?? { ARL: row.ARL, COMISION: 0, COMISION_NETA: 0, "AÃƒâ€˜O": row["AÃƒâ€˜O"] };
    current.COMISION += row.COMISION;
    current.COMISION_NETA += row.COMISION_NETA;
    arlAnioMap.set(key, current);
  });

  return normalizeArlData({
    _meta: { last_import: "2026-04-30T00:00:00.000Z" },
    por_anio: porAnio,
    por_anio_neta: porAnioNeta,
    por_arl: sortEntriesDesc(porArl),
    por_arl_neta: sortEntriesDesc(porArlNeta),
    por_ciudad: sortEntriesDesc(porCiudad),
    por_ciudad_neta: sortEntriesDesc(porCiudadNeta),
    por_mes: porMes,
    por_mes_neta: porMesNeta,
    top_empresas: topEmpresas,
    top_empresas_neta: topEmpresasNeta,
    arl_anio: Array.from(arlAnioMap.values()).sort((a, b) => a["AÃƒâ€˜O"] - b["AÃƒâ€˜O"] || a.ARL.localeCompare(b.ARL)),
    detalle,
    anios_disponibles: [2025, 2026],
    total_registros: detalle.length,
    total_empresas: new Set(detalle.map((row) => row.EMPRESA)).size,
    total_comision: detalle.reduce((sum, row) => sum + row.COMISION, 0),
    total_comision_neta: detalle.reduce((sum, row) => sum + row.COMISION_NETA, 0),
    total_cotizacion: detalle.reduce((sum, row) => sum + row.COTIZACION, 0)
  });
}

const SEGUROS_DETALLE = [
  { ASEGURADO: "Clinica Horizonte", ASEGURADORA: "Sura", PRIMA: 128000000, COMISION: 15360000, PORCENTAJE_COMISION: 12, MES: "Enero", MES_KEY: "ene", ANIO: 2025, FECHA_PAGADA: "2025-01-15", ESTADO: "Pagada", POLIZA: "SG-1001" },
  { ASEGURADO: "Transportes Andina", ASEGURADORA: "Bolivar", PRIMA: 94000000, COMISION: 11280000, PORCENTAJE_COMISION: 12, MES: "Febrero", MES_KEY: "feb", ANIO: 2025, FECHA_PAGADA: "2025-02-10", ESTADO: "Pagada", POLIZA: "SG-1002" },
  { ASEGURADO: "Fundacion Amanecer", ASEGURADORA: "Mapfre", PRIMA: 72000000, COMISION: 7920000, PORCENTAJE_COMISION: 11, MES: "Marzo", MES_KEY: "mar", ANIO: 2025, FECHA_PAGADA: "2025-03-08", ESTADO: "Pagada", POLIZA: "SG-1003" },
  { ASEGURADO: "Logistica Boreal", ASEGURADORA: "Allianz", PRIMA: 86000000, COMISION: 9460000, PORCENTAJE_COMISION: 11, MES: "Abril", MES_KEY: "abr", ANIO: 2025, FECHA_PAGADA: "2025-04-19", ESTADO: "Pagada", POLIZA: "SG-1004" },
  { ASEGURADO: "Innova Sys", ASEGURADORA: "Axa Colpatria", PRIMA: 91000000, COMISION: 10920000, PORCENTAJE_COMISION: 12, MES: "Mayo", MES_KEY: "may", ANIO: 2025, FECHA_PAGADA: "2025-05-11", ESTADO: "Pagada", POLIZA: "SG-1005" },
  { ASEGURADO: "Clinica Horizonte", ASEGURADORA: "Sura", PRIMA: 132000000, COMISION: 15840000, PORCENTAJE_COMISION: 12, MES: "Junio", MES_KEY: "jun", ANIO: 2025, FECHA_PAGADA: "2025-06-14", ESTADO: "Pagada", POLIZA: "SG-1006" },
  { ASEGURADO: "Transportes Andina", ASEGURADORA: "Bolivar", PRIMA: 97000000, COMISION: 11640000, PORCENTAJE_COMISION: 12, MES: "Julio", MES_KEY: "jul", ANIO: 2025, FECHA_PAGADA: "2025-07-17", ESTADO: "Pagada", POLIZA: "SG-1007" },
  { ASEGURADO: "Fundacion Amanecer", ASEGURADORA: "Mapfre", PRIMA: 76000000, COMISION: 8360000, PORCENTAJE_COMISION: 11, MES: "Agosto", MES_KEY: "ago", ANIO: 2025, FECHA_PAGADA: "2025-08-21", ESTADO: "Pagada", POLIZA: "SG-1008" },
  { ASEGURADO: "Logistica Boreal", ASEGURADORA: "Allianz", PRIMA: 90500000, COMISION: 9955000, PORCENTAJE_COMISION: 11, MES: "Septiembre", MES_KEY: "sep", ANIO: 2025, FECHA_PAGADA: "2025-09-13", ESTADO: "Pagada", POLIZA: "SG-1009" },
  { ASEGURADO: "Innova Sys", ASEGURADORA: "Axa Colpatria", PRIMA: 93800000, COMISION: 11256000, PORCENTAJE_COMISION: 12, MES: "Octubre", MES_KEY: "oct", ANIO: 2025, FECHA_PAGADA: "2025-10-09", ESTADO: "Pagada", POLIZA: "SG-1010" },
  { ASEGURADO: "Clinica Horizonte", ASEGURADORA: "Sura", PRIMA: 136000000, COMISION: 16320000, PORCENTAJE_COMISION: 12, MES: "Noviembre", MES_KEY: "nov", ANIO: 2025, FECHA_PAGADA: "2025-11-06", ESTADO: "Pagada", POLIZA: "SG-1011" },
  { ASEGURADO: "Transportes Andina", ASEGURADORA: "Bolivar", PRIMA: 98500000, COMISION: 11820000, PORCENTAJE_COMISION: 12, MES: "Diciembre", MES_KEY: "dic", ANIO: 2025, FECHA_PAGADA: "2025-12-20", ESTADO: "Pagada", POLIZA: "SG-1012" },
  { ASEGURADO: "Fundacion Amanecer", ASEGURADORA: "Mapfre", PRIMA: 81000000, COMISION: 8910000, PORCENTAJE_COMISION: 11, MES: "Enero", MES_KEY: "ene", ANIO: 2026, FECHA_PAGADA: "2026-01-12", ESTADO: "Pagada", POLIZA: "SG-1013" },
  { ASEGURADO: "Logistica Boreal", ASEGURADORA: "Allianz", PRIMA: 94400000, COMISION: 10384000, PORCENTAJE_COMISION: 11, MES: "Febrero", MES_KEY: "feb", ANIO: 2026, FECHA_PAGADA: "2026-02-18", ESTADO: "Pagada", POLIZA: "SG-1014" },
  { ASEGURADO: "Innova Sys", ASEGURADORA: "Axa Colpatria", PRIMA: 97800000, COMISION: 11736000, PORCENTAJE_COMISION: 12, MES: "Marzo", MES_KEY: "mar", ANIO: 2026, FECHA_PAGADA: "2026-03-16", ESTADO: "Pendiente", POLIZA: "SG-1015" },
  { ASEGURADO: "Clinica Horizonte", ASEGURADORA: "Sura", PRIMA: 141000000, COMISION: 16920000, PORCENTAJE_COMISION: 12, MES: "Abril", MES_KEY: "abr", ANIO: 2026, FECHA_PAGADA: "2026-04-25", ESTADO: "Pagada", POLIZA: "SG-1016" }
] as const;

export function getDemoSegurosData(): SegurosData {
  const detalle = SEGUROS_DETALLE.map((row) => ({ ...row }));
  const years = Array.from(new Set(detalle.map((row) => row.ANIO))).sort((a, b) => a - b);
  const totalComisiones = detalle.reduce((sum, row) => sum + row.COMISION, 0);
  const totalPrima = detalle.reduce((sum, row) => sum + row.PRIMA, 0);
  const porAnio = sumByKey(detalle, (row) => String(row.ANIO), (row) => row.COMISION);
  const porAseguradora = sortEntriesDesc(sumByKey(detalle, (row) => row.ASEGURADORA, (row) => row.COMISION));
  const tendenciaMensual = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"].map((mes, index) => {
    const rows = detalle.filter((row) => row.MES_KEY === mes);
    return {
      mes: ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"][index],
      comision: rows.reduce((sum, row) => sum + row.COMISION, 0),
      prima: rows.reduce((sum, row) => sum + row.PRIMA, 0)
    };
  });
  const topClientes = Object.values(
    detalle.reduce<Record<string, { asegurado: string; comision: number; prima: number }>>((acc, row) => {
      const current = acc[row.ASEGURADO] ?? { asegurado: row.ASEGURADO, comision: 0, prima: 0 };
      current.comision += row.COMISION;
      current.prima += row.PRIMA;
      acc[row.ASEGURADO] = current;
      return acc;
    }, {})
  ).sort((a, b) => b.comision - a.comision);

  return {
    _meta: { last_import: "2026-04-30T00:00:00.000Z" },
    resumen: {
      total_comisiones: totalComisiones,
      total_prima: totalPrima,
      clientes_unicos: new Set(detalle.map((row) => row.ASEGURADO)).size,
      registros_totales: detalle.length,
      años: years
    },
    por_anio: porAnio,
    por_aseguradora: porAseguradora,
    tendencia_mensual: tendenciaMensual,
    top_clientes: topClientes,
    detalle
  };
}
