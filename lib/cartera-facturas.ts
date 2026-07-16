export const CARTERA_EMPRESAS = ["CMYM", "SYSO", "SANUM"] as const;
export const CARTERA_ESTADOS = ["PAGADA", "PENDIENTE", "ANULADA"] as const;
export const CARTERA_TIPOS = ["ARL", "SEGUROS", "SALUD", "OTROS", "N/A"] as const;

export type CarteraEmpresa = (typeof CARTERA_EMPRESAS)[number];
export type CarteraEstado = (typeof CARTERA_ESTADOS)[number];
export type CarteraTipo = (typeof CARTERA_TIPOS)[number];

export type FacturaFormInput = {
  empresa?: unknown;
  fecha_elaboracion?: unknown;
  codigo_contable?: unknown;
  identificacion?: unknown;
  nombre_tercero?: unknown;
  numero_factura?: unknown;
  detalle?: unknown;
  debito?: unknown;
  fecha_pago?: unknown;
  valor_pagado?: unknown;
  estado?: unknown;
  tipo?: unknown;
  numero_factura_original?: unknown;
  empresa_original?: unknown;
};

export type FacturaPayload = {
  empresa: CarteraEmpresa;
  numero_factura: string;
  fecha_elaboracion: string;
  nombre_tercero: string;
  detalle: string | null;
  debito: number;
  estado: CarteraEstado;
  tipo: CarteraTipo;
  fecha_pago: string | null;
  valor_pagado: number;
  codigo_contable: string | null;
  mes: number;
  anio: number;
  identificacion: string | null;
};

export type FacturaNormalized = {
  numero_factura_original: string;
  empresa_original: CarteraEmpresa;
  payload: FacturaPayload;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function parseEmpresa(value: unknown): CarteraEmpresa {
  const empresa = cleanString(value).toUpperCase();
  if (!CARTERA_EMPRESAS.includes(empresa as CarteraEmpresa)) {
    throw new Error("La empresa debe ser CMYM, SYSO o SANUM");
  }
  return empresa as CarteraEmpresa;
}

function parseEstado(value: unknown): CarteraEstado {
  const estado = cleanString(value).toUpperCase();
  if (!CARTERA_ESTADOS.includes(estado as CarteraEstado)) {
    throw new Error("El estado debe ser PAGADA, PENDIENTE o ANULADA");
  }
  return estado as CarteraEstado;
}

function parseTipo(value: unknown): CarteraTipo {
  const tipo = cleanString(value).toUpperCase();
  if (!CARTERA_TIPOS.includes(tipo as CarteraTipo)) {
    throw new Error("El tipo debe ser ARL, SEGUROS, SALUD, OTROS o N/A");
  }
  return tipo as CarteraTipo;
}

export function getDefaultTipoForEmpresa(empresa: CarteraEmpresa): CarteraTipo {
  return empresa === "CMYM" ? "N/A" : "OTROS";
}

export function getTiposForEmpresa(empresa: CarteraEmpresa): CarteraTipo[] {
  if (empresa === "CMYM") {
    return ["ARL", "SEGUROS", "SALUD", "N/A"];
  }
  return ["OTROS"];
}

export function normalizeTipoForEmpresa(empresa: CarteraEmpresa, value: unknown): CarteraTipo {
  const parsed = cleanString(value) ? parseTipo(value) : getDefaultTipoForEmpresa(empresa);
  if (empresa === "CMYM") {
    return parsed === "OTROS" ? "N/A" : parsed;
  }
  return "OTROS";
}

function parseDate(value: unknown, fieldName: string, required: boolean) {
  const raw = cleanString(value);
  if (!raw) {
    if (required) throw new Error(`La ${fieldName} es obligatoria`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`La ${fieldName} no es valida`);
  }
  const parsed = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`La ${fieldName} no es valida`);
  }
  return raw;
}

function parseAmount(value: unknown, fieldName: string, required: boolean) {
  const raw = typeof value === "number" ? value : Number(String(value ?? "").replaceAll(",", "").trim());
  if (!Number.isFinite(raw)) {
    if (!required && cleanString(value) === "") return 0;
    throw new Error(`El campo ${fieldName} debe ser numerico`);
  }
  return Math.round(raw);
}

export function normalizeFacturaInput(input: FacturaFormInput): FacturaNormalized {
  const empresa = parseEmpresa(input.empresa);
  const numero_factura = cleanString(input.numero_factura);
  if (!numero_factura) {
    throw new Error("El numero de factura es obligatorio");
  }

  const fecha_elaboracion = parseDate(input.fecha_elaboracion, "fecha de elaboracion", true);
  if (!fecha_elaboracion) {
    throw new Error("La fecha de elaboracion es obligatoria");
  }
  const nombre_tercero = cleanString(input.nombre_tercero);
  if (!nombre_tercero) {
    throw new Error("El nombre del tercero es obligatorio");
  }

  const estado = parseEstado(input.estado ?? "PENDIENTE");
  const tipo = normalizeTipoForEmpresa(empresa, input.tipo ?? getDefaultTipoForEmpresa(empresa));
  const debito = parseAmount(input.debito, "debito", true);
  if (debito <= 0) {
    throw new Error("El debito debe ser mayor a 0");
  }

  let fecha_pago = parseDate(input.fecha_pago, "fecha de pago", false);
  let valor_pagado = parseAmount(input.valor_pagado, "valor_pagado", false);

  if (estado === "PAGADA") {
    if (!fecha_pago) throw new Error("La fecha de pago es obligatoria cuando la factura esta pagada");
    if (valor_pagado <= 0) throw new Error("El valor pagado es obligatorio cuando la factura esta pagada");
    if (fecha_pago < fecha_elaboracion) {
      throw new Error("La fecha de pago no puede ser anterior a la fecha de elaboracion");
    }
  } else {
    fecha_pago = null;
    valor_pagado = 0;
  }

  const [anio, mes] = fecha_elaboracion.split("-").map(Number);

  return {
    numero_factura_original: cleanString(input.numero_factura_original) || numero_factura,
    empresa_original: cleanString(input.empresa_original)
      ? parseEmpresa(input.empresa_original)
      : empresa,
    payload: {
      empresa,
      numero_factura,
      fecha_elaboracion,
      nombre_tercero,
      detalle: cleanString(input.detalle) || null,
      debito,
      codigo_contable: cleanString(input.codigo_contable) || null,
      estado,
      tipo,
      fecha_pago,
      valor_pagado,
      mes,
      anio,
      identificacion: cleanString(input.identificacion) || null
    }
  };
}

export function normalizeFacturaRow(row: Record<string, unknown>) {
  return {
    empresa: parseEmpresa(row.empresa),
    numero_factura: cleanString(row.numero_factura),
    fecha_elaboracion: cleanString(row.fecha_elaboracion),
    nombre_tercero: cleanString(row.nombre_tercero),
    detalle: cleanString(row.detalle),
    debito: Number(row.debito ?? 0),
    estado: cleanString(row.estado).toUpperCase(),
    tipo: cleanString(row.tipo).toUpperCase(),
    fecha_pago: cleanString(row.fecha_pago),
    valor_pagado: Number(row.valor_pagado ?? 0),
    codigo_contable: cleanString(row.codigo_contable),
    mes: Number(row.mes ?? 0),
    anio: Number(row.anio ?? 0),
    identificacion: cleanString(row.identificacion)
  };
}
