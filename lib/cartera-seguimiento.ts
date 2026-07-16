type EmpresaCode = "CMYM" | "SYSO" | "SANUM";

export const CARTERA_SEGUIMIENTO_TIPOS = [
  "correo_manual",
  "llamada",
  "whatsapp",
  "compromiso_pago",
  "sin_respuesta"
] as const;

export const CARTERA_SEGUIMIENTO_RESULTADOS = [
  "correo_enviado",
  "cliente_respondio",
  "sin_respuesta",
  "promesa_pago",
  "soporte_recibido",
  "gestion_realizada"
] as const;

export type CarteraSeguimientoTipo = (typeof CARTERA_SEGUIMIENTO_TIPOS)[number];
export type CarteraSeguimientoResultado = (typeof CARTERA_SEGUIMIENTO_RESULTADOS)[number];

export type CarteraSeguimientoItem = {
  id: string;
  created_at: string;
  empresa: EmpresaCode;
  tercero: string;
  tipo_gestion: CarteraSeguimientoTipo;
  resultado: CarteraSeguimientoResultado;
  observacion: string | null;
  proxima_fecha: string | null;
  actor_usuario: string | null;
  actor_nombre: string | null;
};

export type CarteraSeguimientoSummary = {
  ultimo_seguimiento_at: string | null;
  ultimo_seguimiento_tipo: CarteraSeguimientoTipo | null;
  ultimo_seguimiento_resultado: CarteraSeguimientoResultado | null;
  proxima_gestion_fecha: string | null;
};

const EMPRESAS = ["CMYM", "SYSO", "SANUM"] as const;

export const CARTERA_SEGUIMIENTO_TIPO_LABEL: Record<CarteraSeguimientoTipo, string> = {
  correo_manual: "Correo enviado",
  llamada: "Llamada realizada",
  whatsapp: "WhatsApp enviado",
  compromiso_pago: "Compromiso de pago",
  sin_respuesta: "Sin respuesta"
};

export const CARTERA_SEGUIMIENTO_RESULTADO_LABEL: Record<CarteraSeguimientoResultado, string> = {
  correo_enviado: "Correo enviado",
  cliente_respondio: "Cliente respondió",
  sin_respuesta: "Sin respuesta",
  promesa_pago: "Promesa de pago",
  soporte_recibido: "Soporte recibido",
  gestion_realizada: "Gestión realizada"
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: string) {
  return cleanString(value).toUpperCase().replace(/\s+/g, " ");
}

function parseEmpresa(value: unknown): EmpresaCode {
  const empresa = cleanString(value).toUpperCase();
  if (!EMPRESAS.includes(empresa as EmpresaCode)) {
    throw new Error("Empresa no valida");
  }
  return empresa as EmpresaCode;
}

function parseTipoGestion(value: unknown): CarteraSeguimientoTipo {
  const tipo = cleanString(value).toLowerCase();
  if (!CARTERA_SEGUIMIENTO_TIPOS.includes(tipo as CarteraSeguimientoTipo)) {
    throw new Error("Tipo de gestion no valido");
  }
  return tipo as CarteraSeguimientoTipo;
}

function parseResultado(value: unknown): CarteraSeguimientoResultado {
  const resultado = cleanString(value).toLowerCase();
  if (!CARTERA_SEGUIMIENTO_RESULTADOS.includes(resultado as CarteraSeguimientoResultado)) {
    throw new Error("Resultado de gestion no valido");
  }
  return resultado as CarteraSeguimientoResultado;
}

function parseDateOnly(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error("La proxima fecha debe tener formato YYYY-MM-DD");
  }
  return raw;
}

export function normalizeSeguimientoRow(row: Record<string, unknown>): CarteraSeguimientoItem {
  return {
    id: cleanString(row.id),
    created_at: cleanString(row.created_at),
    empresa: parseEmpresa(row.empresa),
    tercero: cleanString(row.tercero),
    tipo_gestion: parseTipoGestion(row.tipo_gestion),
    resultado: parseResultado(row.resultado),
    observacion: cleanString(row.observacion) || null,
    proxima_fecha: parseDateOnly(row.proxima_fecha),
    actor_usuario: cleanString(row.actor_usuario) || null,
    actor_nombre: cleanString(row.actor_nombre) || null
  };
}

export function normalizeSeguimientoInput(body: Record<string, unknown>) {
  const tercero = cleanString(body.tercero);
  if (!tercero) {
    throw new Error("El tercero es obligatorio");
  }

  const observacion = cleanString(body.observacion);

  return {
    tercero,
    payload: {
      empresa: parseEmpresa(body.empresa),
      tercero,
      tipo_gestion: parseTipoGestion(body.tipo_gestion),
      resultado: parseResultado(body.resultado),
      observacion: observacion || null,
      proxima_fecha: parseDateOnly(body.proxima_fecha)
    }
  };
}

function parseComparableDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getTodayInBogota() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return new Date(`${formatter.format(new Date())}T00:00:00`);
}

export function buildSeguimientoSummaryMap(rows: CarteraSeguimientoItem[]) {
  const today = getTodayInBogota();
  const grouped = new Map<string, CarteraSeguimientoSummary>();

  rows.forEach((row) => {
    const key = `${row.empresa}::${normalizeKey(row.tercero)}`;
    const current = grouped.get(key);
    const nextDate = parseComparableDate(row.proxima_fecha);
    const currentNextDate = parseComparableDate(current?.proxima_gestion_fecha ?? null);

    if (!current) {
      grouped.set(key, {
        ultimo_seguimiento_at: row.created_at,
        ultimo_seguimiento_tipo: row.tipo_gestion,
        ultimo_seguimiento_resultado: row.resultado,
        proxima_gestion_fecha: nextDate && nextDate >= today ? row.proxima_fecha : null
      });
      return;
    }

    if (!current.proxima_gestion_fecha && nextDate && nextDate >= today) {
      current.proxima_gestion_fecha = row.proxima_fecha;
      return;
    }

    if (
      nextDate &&
      nextDate >= today &&
      currentNextDate &&
      currentNextDate >= today &&
      nextDate < currentNextDate
    ) {
      current.proxima_gestion_fecha = row.proxima_fecha;
    }
  });

  return grouped;
}

export function formatSeguimientoTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Bogota"
  }).format(parsed);
}

export function formatSeguimientoDate(value: string) {
  const parsed = parseComparableDate(value);
  if (!parsed) return value;
  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeZone: "America/Bogota"
  }).format(parsed);
}
