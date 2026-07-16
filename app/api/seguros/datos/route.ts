import { NextResponse } from "next/server";

import { isPortfolioDemoMode } from "@/lib/env";
import { getDemoSegurosData } from "@/lib/demo-insurance";
import { readSegurosData } from "@/lib/data-files";
import type { SegurosData, SegurosRow } from "@/lib/modules/seguros";

const MONTH_MAP: Record<string, number> = {
  ene: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11
};

function formatCutoffLabel(date: Date) {
  const month = new Intl.DateTimeFormat("es-CO", {
    month: "short",
    timeZone: "America/Bogota"
  })
    .format(date)
    .replace(".", "")
    .toUpperCase();

  return `${String(date.getUTCDate()).padStart(2, "0")}-${month}-${date.getUTCFullYear()}`;
}

function parseImportDate(value: string | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parsePaidDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const parsed = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parts = raw.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function resolveSegurosCutoffLabel(rows: SegurosRow[]) {
  let latestPaidDate: Date | null = null;
  let latestFallback: Date | null = null;

  for (const row of rows) {
    const paidDate = parsePaidDate(row.FECHA_PAGADA);
    if (paidDate && (!latestPaidDate || paidDate.getTime() > latestPaidDate.getTime())) {
      latestPaidDate = paidDate;
    }

    const monthIndex = MONTH_MAP[String(row.MES_KEY || row.MES || "").trim().toLowerCase().slice(0, 3)];
    const year = Number(row.ANIO || 0);
    if (monthIndex !== undefined && year) {
      const fallbackDate = new Date(Date.UTC(year, monthIndex + 1, 0));
      if (!latestFallback || fallbackDate.getTime() > latestFallback.getTime()) {
        latestFallback = fallbackDate;
      }
    }
  }

  const cutoff = latestPaidDate ?? latestFallback;
  return cutoff ? formatCutoffLabel(cutoff) : null;
}

export async function GET() {
  try {
    if (isPortfolioDemoMode()) {
      const data = getDemoSegurosData();
      const importDate = parseImportDate(data._meta?.last_import);
      return NextResponse.json({
        ...data,
        cutoff_label: importDate
          ? formatCutoffLabel(importDate)
          : resolveSegurosCutoffLabel(data.detalle ?? [])
      });
    }

    const data = await readSegurosData() as SegurosData;
    const importDate = parseImportDate(data._meta?.last_import);
    return NextResponse.json({
      ...data,
      cutoff_label: importDate
        ? formatCutoffLabel(importDate)
        : resolveSegurosCutoffLabel(data.detalle ?? [])
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible cargar datos Seguros";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
