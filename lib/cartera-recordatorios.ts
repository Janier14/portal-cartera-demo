type EmpresaCode = "CMYM" | "SYSO" | "SANUM";

type RecaudoReminderRow = {
  empresa: EmpresaCode;
  nombre_tercero: string;
  numero_factura: string;
  fecha_elaboracion: string;
  debito: number;
  estado: string;
  tipo: string;
};

type DirectorioRow = {
  id: number;
  nombre: string;
};

type DirectorioContactoRow = {
  directorio_id: number;
  rol: string;
  email: string;
};

type ContactoEmpresaRow = {
  empresa: "SYSO" | "SANUM";
  razon_social: string;
  email: string;
  activo: boolean;
};

export type MorosoPorTerceroItem = {
  nombre_tercero: string;
  empresa: EmpresaCode;
  email: string | null;
  cantidad_facturas: number;
  total_adeudado: number;
  dias_mora_max: number;
  ultimo_seguimiento_at?: string | null;
  ultimo_seguimiento_tipo?: string | null;
  ultimo_seguimiento_resultado?: string | null;
  proxima_gestion_fecha?: string | null;
};

export type RecordatorioFactura = {
  numero_factura: string;
  fecha_vencimiento: string;
  total_cartera: number;
  dias_en_cartera: number;
};

export type RecordatorioDetalleResponse = {
  tercero: string;
  empresa: EmpresaCode;
  email_destino: string | null;
  email_remitente: string;
  asunto: string;
  cuerpo: string;
  cuerpo_html: string;
  cuerpo_texto: string;
  facturas: RecordatorioFactura[];
  total: number;
};

export const CARTERA_RECORDATORIO_EMPRESAS = ["CMYM", "SYSO", "SANUM"] as const;

const COMPANY_DISPLAY_NAME: Record<EmpresaCode, string> = {
  CMYM: "CMYM Asesores",
  SYSO: "SYSO",
  SANUM: "SANUM"
};

// Demo: correos de ejemplo. En produccion se configuran por entorno.
const REMITENTE_POR_EMPRESA: Record<EmpresaCode, string> = {
  CMYM: "cartera@demo.example",
  SYSO: "cartera@demo.example",
  SANUM: "cartera@demo.example"
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeKey(value: string) {
  return cleanString(value).toUpperCase().replace(/\s+/g, " ");
}

function parseEmpresa(value: unknown): EmpresaCode {
  const empresa = cleanString(value).toUpperCase();
  if (!CARTERA_RECORDATORIO_EMPRESAS.includes(empresa as EmpresaCode)) {
    throw new Error("Empresa no valida");
  }
  return empresa as EmpresaCode;
}

export function parseReminderEmpresa(value: unknown): EmpresaCode {
  return parseEmpresa(value);
}

function parseDateOnly(value: string) {
  const raw = cleanString(value);
  if (!raw) return null;

  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parsed = new Date(`${iso}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const parts = raw.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getTodayInBogota() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const today = formatter.format(new Date());
  return new Date(`${today}T00:00:00`);
}

export function formatDateDisplay(value: string) {
  const parsed = parseDateOnly(value);
  if (!parsed) return cleanString(value);
  return `${String(parsed.getDate()).padStart(2, "0")}/${String(parsed.getMonth() + 1).padStart(2, "0")}/${parsed.getFullYear()}`;
}

export function formatCurrencyCopDetailed(value: number) {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function daysInCartera(fechaElaboracion: string, today = getTodayInBogota()) {
  const parsed = parseDateOnly(fechaElaboracion);
  if (!parsed) return 0;
  return Math.max(0, Math.floor((today.getTime() - parsed.getTime()) / 86400000));
}

function normalizeRecaudoReminderRow(row: Record<string, unknown>): RecaudoReminderRow {
  return {
    empresa: parseEmpresa(row.empresa),
    nombre_tercero: cleanString(row.nombre_tercero),
    numero_factura: cleanString(row.numero_factura),
    fecha_elaboracion: cleanString(row.fecha_elaboracion),
    debito: Number(row.debito ?? 0),
    estado: cleanString(row.estado).toUpperCase(),
    tipo: cleanString(row.tipo).toUpperCase()
  };
}

function normalizeDirectorioRow(row: Record<string, unknown>): DirectorioRow {
  return {
    id: Number(row.id ?? 0),
    nombre: cleanString(row.nombre)
  };
}

function normalizeDirectorioContactoRow(row: Record<string, unknown>): DirectorioContactoRow {
  return {
    directorio_id: Number(row.directorio_id ?? 0),
    rol: cleanString(row.rol),
    email: cleanString(row.email)
  };
}

function normalizeContactoEmpresaRow(row: Record<string, unknown>): ContactoEmpresaRow {
  return {
    empresa: parseEmpresa(row.empresa) as "SYSO" | "SANUM",
    razon_social: cleanString(row.razon_social),
    email: cleanString(row.email),
    activo: Boolean(row.activo ?? true)
  };
}

export function filterEligibleReminderRows(rows: Record<string, unknown>[]) {
  return rows
    .map(normalizeRecaudoReminderRow)
    .filter((row) => row.estado === "PENDIENTE")
    .filter((row) => row.tipo !== "AJUSTE")
    .filter((row) => daysInCartera(row.fecha_elaboracion) > 30);
}

function buildEmailMaps(
  directorioRows: Record<string, unknown>[],
  directorioContactosRows: Record<string, unknown>[],
  contactosRows: Record<string, unknown>[]
) {
  const directorioMap = new Map<string, string>();
  const contactosMap = new Map<string, string>();
  const directorioById = new Map<number, string>();

  directorioRows
    .map(normalizeDirectorioRow)
    .forEach((row) => {
      if (row.id > 0 && row.nombre) {
        directorioById.set(row.id, row.nombre);
      }
    });

  directorioContactosRows
    .map(normalizeDirectorioContactoRow)
    .filter((row) => row.rol.toLowerCase() === "cartera")
    .filter((row) => row.email)
    .forEach((row) => {
      const nombre = directorioById.get(row.directorio_id);
      if (!nombre) return;

      const key = normalizeKey(nombre);
      const current = directorioMap.get(key);
      if (!current) {
        directorioMap.set(key, row.email);
        return;
      }

      const emails = new Set(
        current
          .split(",")
          .map((item) => cleanString(item))
          .filter(Boolean)
      );
      emails.add(row.email);
      directorioMap.set(key, [...emails].join(", "));
    });

  contactosRows
    .map(normalizeContactoEmpresaRow)
    .filter((row) => row.activo)
    .forEach((row) => {
      if (row.email) {
        contactosMap.set(`${row.empresa}::${normalizeKey(row.razon_social)}`, row.email);
      }
    });

  return { directorioMap, contactosMap };
}

export function buildMorososPorTercero(
  recaudosRows: Record<string, unknown>[],
  directorioRows: Record<string, unknown>[],
  directorioContactosRows: Record<string, unknown>[],
  contactosRows: Record<string, unknown>[]
): MorosoPorTerceroItem[] {
  const eligibleRows = filterEligibleReminderRows(recaudosRows);
  const { directorioMap, contactosMap } = buildEmailMaps(directorioRows, directorioContactosRows, contactosRows);
  const grouped = new Map<string, MorosoPorTerceroItem>();

  eligibleRows.forEach((row) => {
    const key = `${row.empresa}::${normalizeKey(row.nombre_tercero)}`;
    const email =
      row.empresa === "CMYM"
        ? directorioMap.get(normalizeKey(row.nombre_tercero)) ?? null
        : contactosMap.get(`${row.empresa}::${normalizeKey(row.nombre_tercero)}`) ?? null;

    const current = grouped.get(key);
    const dias = daysInCartera(row.fecha_elaboracion);

    if (!current) {
      grouped.set(key, {
        nombre_tercero: row.nombre_tercero,
        empresa: row.empresa,
        email,
        cantidad_facturas: 1,
        total_adeudado: row.debito,
        dias_mora_max: dias
      });
      return;
    }

    current.cantidad_facturas += 1;
    current.total_adeudado += row.debito;
    current.dias_mora_max = Math.max(current.dias_mora_max, dias);
    if (!current.email && email) current.email = email;
  });

  return [...grouped.values()].sort((a, b) => b.total_adeudado - a.total_adeudado);
}

function getEmitterInfo(empresa: EmpresaCode) {
  if (empresa === "CMYM") {
    return {
      razonSocial: "CMYM Asesores de Seguro LTDA",
      nit: "900123456-7"
    };
  }

  if (empresa === "SYSO") {
    return {
      razonSocial: "SYSO CONSULTORIA SAS",
      nit: "900123456-7"
    };
  }

  if (empresa === "SANUM") {
    return {
      razonSocial: "SANUM SAS",
      nit: "901987654-3"
    };
  }

  return {
    razonSocial: "[RAZON_SOCIAL_EMITTER]",
    nit: "[NIT_EMITTER]"
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMailTablePlain(facturas: RecordatorioFactura[]) {
  const headers = ["Documento", "Fecha vencimiento", "Total cartera", "Días en cartera"];
  const rows = facturas.map((factura) => [
    factura.numero_factura,
    factura.fecha_vencimiento,
    formatCurrencyCopDetailed(factura.total_cartera),
    String(factura.dias_en_cartera)
  ]);

  const widths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => row[index]?.length ?? 0)
    )
  );

  const pad = (value: string, length: number) => value.padEnd(length, " ");

  const lines = [
    headers.map((header, index) => pad(header, widths[index])).join("    "),
    ...rows.map((row) => row.map((value, index) => pad(value, widths[index])).join("    "))
  ];

  return lines.join("\n");
}

function buildParagraphHtml(text: string) {
  return `<p style="margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">${escapeHtml(text)}</p>`;
}

function formatMailTableHtml(facturas: RecordatorioFactura[], total: number) {
  const headerCellStyle = "border:1px solid #ccc;padding:6px 10px;background:#f3f4f6;font-weight:700;text-align:left;font-family:Arial,sans-serif;font-size:14px;color:#111827;";
  const cellBaseStyle = "border:1px solid #ccc;padding:6px 10px;text-align:left;font-family:Arial,sans-serif;font-size:14px;color:#111827;";

  const rows = facturas
    .map((factura, index) => {
      const background = index % 2 === 0 ? "#ffffff" : "#fafafa";
      const cellStyle = `${cellBaseStyle}background:${background};`;
      const nowrapCellStyle = `${cellStyle}white-space:nowrap;`;
      const amountCellStyle = `${cellStyle}text-align:right;`;

      return [
        "<tr>",
        `<td style="${nowrapCellStyle}">${escapeHtml(factura.numero_factura)}</td>`,
        `<td style="${nowrapCellStyle}">${escapeHtml(factura.fecha_vencimiento)}</td>`,
        `<td style="${amountCellStyle}">${escapeHtml(formatCurrencyCopDetailed(factura.total_cartera))}</td>`,
        `<td style="${nowrapCellStyle}">${escapeHtml(String(factura.dias_en_cartera))}</td>`,
        "</tr>"
      ].join("");
    })
    .join("");

  const totalRow = [
    "<tr>",
    `<td colspan="4" style="border:1px solid #ccc;padding:6px 10px;background:#ffffff;font-weight:700;text-align:left;font-family:Arial,sans-serif;font-size:14px;color:#111827;">Total cartera: ${escapeHtml(formatCurrencyCopDetailed(total))}</td>`,
    "</tr>"
  ].join("");

  return [
    '<table width="600" style="border-collapse:collapse;width:600px;max-width:100%;margin:0 0 16px 0;">',
    "<thead>",
    "<tr>",
    `<th style="${headerCellStyle}white-space:nowrap;">Documento</th>`,
    `<th style="${headerCellStyle}white-space:nowrap;">Fecha vencimiento</th>`,
    `<th style="${headerCellStyle}text-align:right;">Total cartera</th>`,
    `<th style="${headerCellStyle}white-space:nowrap;">Días en cartera</th>`,
    "</tr>",
    "</thead>",
    `<tbody>${rows}${totalRow}</tbody>`,
    "</table>"
  ].join("");
}

export function buildRecordatorioDetalle(
  tercero: string,
  empresaInput: unknown,
  recaudosRows: Record<string, unknown>[],
  directorioRows: Record<string, unknown>[],
  directorioContactosRows: Record<string, unknown>[],
  contactosRows: Record<string, unknown>[]
): RecordatorioDetalleResponse {
  const empresa = parseEmpresa(empresaInput);
  const targetKey = normalizeKey(tercero);
  const { directorioMap, contactosMap } = buildEmailMaps(directorioRows, directorioContactosRows, contactosRows);

  const facturas = filterEligibleReminderRows(recaudosRows)
    .filter((row) => row.empresa === empresa)
    .filter((row) => normalizeKey(row.nombre_tercero) === targetKey)
    .sort((a, b) => {
      const left = parseDateOnly(a.fecha_elaboracion)?.getTime() ?? 0;
      const right = parseDateOnly(b.fecha_elaboracion)?.getTime() ?? 0;
      return left - right;
    })
    .map((row) => ({
      numero_factura: row.numero_factura,
      fecha_vencimiento: formatDateDisplay(row.fecha_elaboracion),
      total_cartera: row.debito,
      dias_en_cartera: daysInCartera(row.fecha_elaboracion)
    }));

  if (!facturas.length) {
    throw new Error("No hay facturas vencidas para el tercero solicitado");
  }

  const total = facturas.reduce((sum, factura) => sum + factura.total_cartera, 0);
  const email_destino =
    empresa === "CMYM"
      ? directorioMap.get(targetKey) ?? null
      : contactosMap.get(`${empresa}::${targetKey}`) ?? null;

  const emitter = getEmitterInfo(empresa);
  const tablaTexto = formatMailTablePlain(facturas);
  const asunto = `Recordatorio de pago - Cartera pendiente ${COMPANY_DISPLAY_NAME[empresa]}`;
  const cuerpoTexto = [
    "Estimados Buen día,",
    "",
    "Cordial saludo, Espero se encuentren muy bien.",
    "",
    `Por medio del presente, solicitamos de su amable colaboración informándonos la programación de pago de las facturas a continuación a nombre de ${emitter.razonSocial} NIT ${emitter.nit}, ya que a la fecha registra aun en nuestra cartera.`,
    "",
    "A continuación, relaciono reporte de facturación:",
    "",
    `Cliente: ${cleanString(tercero)}`,
    "",
    tablaTexto,
    "",
    `Total cartera: ${formatCurrencyCopDetailed(total)}`,
    "",
    "Si estas facturas ya fueron canceladas, agradecemos compartir el soporte de pago indicando la fecha y el valor pagado.",
    "",
    "Quedo atento a comentarios.",
    "",
    "Cordialmente,"
  ].join("\n");
  const cuerpoHtml = [
    '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;">',
    buildParagraphHtml("Estimados Buen día,"),
    buildParagraphHtml("Cordial saludo, Espero se encuentren muy bien."),
    buildParagraphHtml(`Por medio del presente, solicitamos de su amable colaboración informándonos la programación de pago de las facturas a continuación a nombre de ${emitter.razonSocial} NIT ${emitter.nit}, ya que a la fecha registra aun en nuestra cartera.`),
    buildParagraphHtml("A continuación, relaciono reporte de facturación:"),
    buildParagraphHtml(`Cliente: ${cleanString(tercero)}`),
    formatMailTableHtml(facturas, total),
    buildParagraphHtml("Si estas facturas ya fueron canceladas, agradecemos compartir el soporte de pago indicando la fecha y el valor pagado."),
    buildParagraphHtml("Quedo atento a comentarios."),
    '<p style="margin:0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;">Cordialmente,</p>',
    "</div>"
  ].join("");

  return {
    tercero: cleanString(tercero),
    empresa,
    email_destino,
    email_remitente: REMITENTE_POR_EMPRESA[empresa],
    asunto,
    cuerpo: cuerpoTexto,
    cuerpo_html: cuerpoHtml,
    cuerpo_texto: cuerpoTexto,
    facturas,
    total
  };
}
