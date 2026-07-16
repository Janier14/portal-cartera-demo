import { NextResponse } from "next/server";

import { isPortfolioDemoMode } from "@/lib/env";
import { getDemoArlData } from "@/lib/demo-insurance";
import { readArlData } from "@/lib/data-files";
import { normalizeArlData, type ArlData } from "@/lib/modules/arl";

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

function resolveArlYear(value: Record<string, unknown>) {
  return Number(
    value["A\u00d1O"] ??
    value["AÃ‘O"] ??
      value["AÃƒâ€˜O"] ??
      value["AÃƒÆ’Ã¢â‚¬ËœO"] ??
      value["AÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“O"] ??
      0
  );
}

function resolveArlCutoffLabel(data: ArlData) {
  let latest: Date | null = null;

  for (const row of data.detalle ?? []) {
    const year = resolveArlYear(row as unknown as Record<string, unknown>);
    const monthText = String(row.MES ?? "").trim().toLowerCase().slice(0, 3);
    const monthIndex = MONTH_MAP[monthText];
    if (!year || monthIndex === undefined) continue;

    const candidate = new Date(Date.UTC(year, monthIndex + 1, 0));
    if (!latest || candidate.getTime() > latest.getTime()) {
      latest = candidate;
    }
  }

  return latest ? formatCutoffLabel(latest) : null;
}

export async function GET() {
  try {
    if (isPortfolioDemoMode()) {
      const data = getDemoArlData();
      const importDate = parseImportDate(data._meta?.last_import);
      return NextResponse.json({
        ...data,
        cutoff_label: importDate ? formatCutoffLabel(importDate) : resolveArlCutoffLabel(data)
      });
    }

    const data = normalizeArlData((await readArlData()) as ArlData);
    const importDate = parseImportDate(data._meta?.last_import);
    return NextResponse.json({
      ...data,
      cutoff_label: importDate ? formatCutoffLabel(importDate) : resolveArlCutoffLabel(data)
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "No fue posible cargar datos ARL";
    return NextResponse.json({ detail }, { status: 500 });
  }
}
