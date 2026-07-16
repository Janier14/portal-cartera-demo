"""
importar_recaudos.py - Lee hojas CMYM, SYSO y SANUM de FACTURACION_CMYM.xlsx
y hace UPSERT a Supabase tabla recaudos.
on_conflict: numero_factura, empresa
"""

import argparse
import os
import re
import sys
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client

sys.stdout.reconfigure(encoding="utf-8")

load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

EXCEL_PATH = Path(__file__).resolve().parent / "FACTURACION_CMYM.xlsx"
VALID_EMPRESAS = ["CMYM", "SYSO", "SANUM"]
TIPOS_VALIDOS_CMYM = ["ARL", "SEGUROS", "SALUD", "OTROS", "N/A"]
TIPOS_VALIDOS_OTROS = ["OTROS", "N/A"]
EXPECTED_COLUMNS = [
    "Fecha elaboración",
    "Código contable",
    "Identificación",
    "Nombre tercero",
    "Detalle",
    "Débito",
    "Fecha pago",
    "Valor pagado",
    "Estado",
    "Tipo",
]
ESTADOS_VALIDOS = {
    "PAGADO": "PAGADA",
    "PAGADA": "PAGADA",
    "PENDIENTE": "PENDIENTE",
    "ANULADO": "ANULADA",
    "ANULADA": "ANULADA",
}
FACTURA_REGEX = re.compile(r"FV-\d+-\d+", re.IGNORECASE)
EPOCH_INVALIDO = date(1970, 1, 1)


@dataclass
class ValidationMessage:
    level: str
    message: str
    hoja: str | None = None
    fila_excel: int | None = None

    def render(self) -> str:
        location = []
        if self.hoja:
            location.append(f"Hoja {self.hoja}")
        if self.fila_excel is not None:
            location.append(f"fila {self.fila_excel}")
        prefix = f"[{self.level}]"
        if location:
            return f"{prefix} {', '.join(location)}: {self.message}"
        return f"{prefix} {self.message}"


@dataclass
class DuplicateGroup:
    empresa: str
    numero_factura: str
    filas: list[int]


@dataclass
class SheetStats:
    rows_read: int = 0
    inserted: int = 0
    skipped: int = 0


@dataclass
class ImportReport:
    messages: list[ValidationMessage] = field(default_factory=list)
    duplicates: list[DuplicateGroup] = field(default_factory=list)
    skipped_rows: list[str] = field(default_factory=list)
    sheet_stats: dict[str, SheetStats] = field(
        default_factory=lambda: {empresa: SheetStats() for empresa in VALID_EMPRESAS}
    )
    normalization_counts: dict[str, int] = field(
        default_factory=lambda: {
            "vida_to_seguros": 0,
            "pagada_fecha_fallback": 0,
            "pagada_valor_fallback": 0,
            "tipo_invalido_cmym_a_na": 0,
            "tipo_normalizado_otros": 0,
            "duplicados_saltados": 0,
        }
    )
    fatal_errors: list[str] = field(default_factory=list)
    strict_findings: int = 0


@dataclass
class UpsertStats:
    total: int = 0
    created: int = 0
    updated: int = 0
    batches: int = 0


def normalize_text(value: Any) -> str:
    text = "" if value is None else str(value)
    text = unicodedata.normalize("NFKD", text)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return " ".join(text.strip().lower().split())


def format_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    if pd.isna(value):
        return ""
    return str(value).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Valida y carga recaudos desde FACTURACION_CMYM.xlsx a Supabase."
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--dry-run",
        action="store_true",
        help="Valida el Excel y reporta resultados sin insertar en Supabase.",
    )
    mode.add_argument(
        "--execute",
        action="store_true",
        help="Valida primero y, si no hay errores criticos, inserta en Supabase.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Modo auditoria: convierte warnings y filas saltadas en hallazgos bloqueantes.",
    )
    parser.add_argument(
        "--actor-user",
        help="Usuario responsable de la carga para auditoria. Si no se envia, intenta usar AUDIT_ACTOR_USUARIO o el usuario del sistema.",
    )
    return parser.parse_args()


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        sys.exit(
            f"Variable de entorno '{name}' no encontrada. Agregala a .env.local antes de ejecutar este script."
        )
    return value


def excel_row_number(index: int) -> int:
    return int(index) + 2


def is_blank(value: Any) -> bool:
    if value is None:
        return True
    if pd.isna(value):
        return True
    return str(value).strip() == ""


def parse_date(value: Any) -> date | None:
    if is_blank(value):
        return None
    try:
        parsed = pd.to_datetime(value, errors="raise")
    except Exception:
        return None
    if pd.isna(parsed):
        return None
    if hasattr(parsed, "to_pydatetime"):
        parsed_date = parsed.to_pydatetime().date()
    else:
        parsed_date = parsed.date()
    if parsed_date == EPOCH_INVALIDO:
        return None
    return parsed_date


def parse_number(value: Any) -> float | None:
    if is_blank(value):
        return None
    if isinstance(value, (int, float)) and not pd.isna(value):
        return float(value)

    text = str(value).strip().replace(" ", "")
    if not text:
        return None

    if "," in text and "." in text:
        last_comma = text.rfind(",")
        last_dot = text.rfind(".")
        if last_comma > last_dot:
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    else:
        text = text.replace(",", ".")

    try:
        return float(text)
    except ValueError:
        return None


def limpiar_numero_factura(detalle: Any) -> str | None:
    if isinstance(detalle, (int, float)) and not pd.isna(detalle):
        entero = int(detalle)
        if float(detalle) == float(entero):
            return f"FV-1-{entero}"

    detalle_texto = format_cell(detalle)
    if not detalle_texto:
        return None

    match = FACTURA_REGEX.search(detalle_texto)
    if match:
        return match.group(0).upper()

    match_simple = re.fullmatch(r"(\d{4,6})", detalle_texto)
    if match_simple:
        return f"FV-1-{match_simple.group(1)}"

    return None


def normalize_estado(raw_value: Any) -> str | None:
    return ESTADOS_VALIDOS.get(normalize_text(raw_value).upper())


def build_column_map(columns: list[Any]) -> dict[str, str]:
    return {normalize_text(column): str(column) for column in columns}


def add_message(
    report: ImportReport,
    level: str,
    message: str,
    hoja: str | None = None,
    fila_excel: int | None = None,
    strict: bool = False,
) -> None:
    report.messages.append(ValidationMessage(level, message, hoja=hoja, fila_excel=fila_excel))
    if strict and level in {"WARNING", "ERROR"}:
        report.strict_findings += 1


def add_skipped_row(
    report: ImportReport,
    hoja: str,
    fila_excel: int,
    reason: str,
    strict: bool,
    context: str | None = None,
) -> None:
    report.sheet_stats[hoja].skipped += 1
    suffix = f" | {context}" if context else ""
    report.skipped_rows.append(f"{hoja} fila {fila_excel}: {reason}{suffix}")
    if strict:
        report.strict_findings += 1


def build_skip_context(row: pd.Series, required_columns: dict[str, str]) -> str | None:
    detalle = row[required_columns["Detalle"]]
    detalle_preview = format_cell(detalle)
    nombre_tercero_preview = format_cell(row[required_columns["Nombre tercero"]])
    numero_factura_preview = limpiar_numero_factura(detalle)
    parts = [
        f'factura="{numero_factura_preview}"' if numero_factura_preview else "",
        f'tercero="{nombre_tercero_preview}"' if nombre_tercero_preview else "",
        f'detalle="{detalle_preview}"' if detalle_preview else "",
    ]
    context = ", ".join(part for part in parts if part)
    return context or None


def resolve_tipo(
    empresa: str,
    tipo_raw: Any,
    fila_excel: int,
    report: ImportReport,
    strict: bool,
) -> str:
    tipo = format_cell(tipo_raw).upper()

    if empresa == "CMYM":
        if not tipo:
            return "N/A"
        if tipo == "VIDA":
            report.normalization_counts["vida_to_seguros"] += 1
            add_message(
                report,
                "INFO",
                "tipo 'VIDA' normalizado a 'SEGUROS'",
                hoja=empresa,
                fila_excel=fila_excel,
                strict=False,
            )
            return "SEGUROS"
        if tipo in TIPOS_VALIDOS_CMYM:
            return tipo

        report.normalization_counts["tipo_invalido_cmym_a_na"] += 1
        add_message(
            report,
            "WARNING",
            f'tipo "{tipo}" no valido para CMYM, normalizado a "N/A"',
            hoja=empresa,
            fila_excel=fila_excel,
            strict=strict,
        )
        return "N/A"

    if not tipo:
        return "OTROS"
    if tipo in TIPOS_VALIDOS_OTROS:
        return "OTROS" if tipo == "N/A" else tipo

    report.normalization_counts["tipo_normalizado_otros"] += 1
    add_message(
        report,
        "WARNING",
        f'tipo "{tipo}" en {empresa}, normalizado a "OTROS"',
        hoja=empresa,
        fila_excel=fila_excel,
        strict=strict,
    )
    return "OTROS"


def validate_required_sheets(xl: pd.ExcelFile, report: ImportReport) -> None:
    for empresa in VALID_EMPRESAS:
        if empresa not in xl.sheet_names:
            report.fatal_errors.append(f"Falta la hoja {empresa} en el Excel")


def validate_required_columns(df: pd.DataFrame, hoja: str, report: ImportReport) -> dict[str, str] | None:
    column_map = build_column_map(list(df.columns))
    normalized_expected = {normalize_text(column): column for column in EXPECTED_COLUMNS}
    missing = [
        display_name
        for normalized_name, display_name in normalized_expected.items()
        if normalized_name not in column_map
    ]

    if missing:
        for column_name in missing:
            report.fatal_errors.append(f"Falta columna '{column_name}' en hoja {hoja}")
        return None

    return {
        display_name: column_map[normalized_name]
        for normalized_name, display_name in normalized_expected.items()
    }


def pre_scan_duplicates(df: pd.DataFrame, hoja: str, required_columns: dict[str, str]) -> list[DuplicateGroup]:
    seen: dict[str, list[int]] = {}
    detalle_col = required_columns["Detalle"]
    for idx, row in df.iterrows():
        fila = excel_row_number(idx)
        numero_factura = limpiar_numero_factura(row[detalle_col])
        if not numero_factura:
            continue
        seen.setdefault(numero_factura, []).append(fila)

    duplicates = []
    for numero_factura, filas in seen.items():
        if len(filas) > 1:
            duplicates.append(DuplicateGroup(empresa=hoja, numero_factura=numero_factura, filas=filas))
    return sorted(duplicates, key=lambda item: (item.empresa, item.numero_factura))


def process_sheet(
    df: pd.DataFrame,
    hoja: str,
    required_columns: dict[str, str],
    report: ImportReport,
    strict: bool,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    first_occurrence_rows: dict[str, int] = {}

    for idx, row in df.iterrows():
        fila = excel_row_number(idx)

        fecha_elaboracion_raw = row[required_columns["Fecha elaboración"]]
        fecha_elaboracion = parse_date(fecha_elaboracion_raw)
        if fecha_elaboracion is None:
            add_skipped_row(
                report,
                hoja,
                fila,
                f'fecha_elaboracion invalida o vacia ("{format_cell(fecha_elaboracion_raw)}")',
                strict,
                context=build_skip_context(row, required_columns),
            )
            continue

        debito_raw = row[required_columns["Débito"]]
        debito = parse_number(debito_raw)
        if debito is None or debito <= 0:
            detail = format_cell(debito_raw)
            add_skipped_row(
                report,
                hoja,
                fila,
                f'debito invalido ("{detail}")',
                strict,
                context=build_skip_context(row, required_columns),
            )
            continue

        nombre_tercero = format_cell(row[required_columns["Nombre tercero"]])
        if not nombre_tercero:
            add_skipped_row(
                report,
                hoja,
                fila,
                "nombre_tercero vacio",
                strict,
                context=build_skip_context(row, required_columns),
            )
            continue

        detalle = row[required_columns["Detalle"]]
        numero_factura = limpiar_numero_factura(detalle)
        if not numero_factura:
            add_skipped_row(
                report,
                hoja,
                fila,
                f'numero de factura no extraible desde Detalle ("{format_cell(detalle)}")',
                strict,
                context=build_skip_context(row, required_columns),
            )
            continue

        if numero_factura in first_occurrence_rows:
            report.normalization_counts["duplicados_saltados"] += 1
            add_message(
                report,
                "WARNING",
                f"duplicado interno de factura {numero_factura}; se usa la primera ocurrencia en fila {first_occurrence_rows[numero_factura]}",
                hoja=hoja,
                fila_excel=fila,
                strict=strict,
            )
            add_skipped_row(
                report,
                hoja,
                fila,
                f"duplicado de factura {numero_factura} (ya procesada en fila {first_occurrence_rows[numero_factura]})",
                strict,
                context=build_skip_context(row, required_columns),
            )
            continue

        first_occurrence_rows[numero_factura] = fila

        estado = normalize_estado(row[required_columns["Estado"]])
        if estado is None:
            add_message(
                report,
                "WARNING",
                f'estado invalido ("{format_cell(row[required_columns["Estado"]])}"), normalizado a "PENDIENTE"',
                hoja=hoja,
                fila_excel=fila,
                strict=strict,
            )
            estado = "PENDIENTE"

        fecha_pago_raw = row[required_columns["Fecha pago"]]
        fecha_pago = parse_date(fecha_pago_raw)
        if not is_blank(fecha_pago_raw) and fecha_pago is None:
            add_message(
                report,
                "WARNING",
                f'fecha_pago invalida ("{format_cell(fecha_pago_raw)}"), se usó fecha_elaboracion',
                hoja=hoja,
                fila_excel=fila,
                strict=strict,
            )
            fecha_pago = fecha_elaboracion

        valor_pagado_raw = row[required_columns["Valor pagado"]]
        valor_pagado = parse_number(valor_pagado_raw)
        if not is_blank(valor_pagado_raw) and valor_pagado is None:
            add_message(
                report,
                "WARNING",
                f'valor_pagado no numerico ("{format_cell(valor_pagado_raw)}"), se usó 0',
                hoja=hoja,
                fila_excel=fila,
                strict=strict,
            )
            valor_pagado = 0.0
        elif valor_pagado is not None and valor_pagado < 0:
            add_message(
                report,
                "WARNING",
                f"valor_pagado negativo ({valor_pagado}), se usó 0",
                hoja=hoja,
                fila_excel=fila,
                strict=strict,
            )
            valor_pagado = 0.0

        if estado == "PAGADA":
            if fecha_pago is None:
                fecha_pago = fecha_elaboracion
                report.normalization_counts["pagada_fecha_fallback"] += 1
                add_message(
                    report,
                    "WARNING",
                    "PAGADA sin fecha_pago, se usó fecha_elaboracion como fallback",
                    hoja=hoja,
                    fila_excel=fila,
                    strict=strict,
                )
            if is_blank(valor_pagado_raw):
                valor_pagado = debito
                report.normalization_counts["pagada_valor_fallback"] += 1
                add_message(
                    report,
                    "WARNING",
                    "PAGADA sin valor_pagado, se usó debito como fallback",
                    hoja=hoja,
                    fila_excel=fila,
                    strict=strict,
                )
            elif valor_pagado is None:
                valor_pagado = debito
                report.normalization_counts["pagada_valor_fallback"] += 1
                add_message(
                    report,
                    "WARNING",
                    "PAGADA con valor_pagado invalido, se usó debito como fallback",
                    hoja=hoja,
                    fila_excel=fila,
                    strict=strict,
                )
        else:
            if fecha_pago is None:
                fecha_pago_value = None
            else:
                fecha_pago_value = fecha_pago.isoformat()

            if valor_pagado is None:
                valor_pagado = 0.0

            tipo = resolve_tipo(hoja, row[required_columns["Tipo"]], fila, report, strict)
            codigo_contable = format_cell(row[required_columns["Código contable"]]) or None

            records.append(
                {
                    "numero_factura": numero_factura,
                    "detalle": format_cell(detalle) or None,
                    "nombre_tercero": nombre_tercero,
                    "debito": debito,
                    "valor_pagado": valor_pagado,
                    "fecha_elaboracion": fecha_elaboracion.isoformat(),
                    "fecha_pago": fecha_pago_value,
                    "estado": estado,
                    "tipo": tipo,
                    "mes": fecha_elaboracion.month,
                    "anio": fecha_elaboracion.year,
                    "empresa": hoja,
                    "codigo_contable": codigo_contable,
                }
            )
            report.sheet_stats[hoja].inserted += 1
            continue

        if valor_pagado is None:
            valor_pagado = 0.0

        tipo = resolve_tipo(hoja, row[required_columns["Tipo"]], fila, report, strict)
        codigo_contable = format_cell(row[required_columns["Código contable"]]) or None

        records.append(
            {
                "numero_factura": numero_factura,
                "detalle": format_cell(detalle) or None,
                "nombre_tercero": nombre_tercero,
                "debito": debito,
                "valor_pagado": valor_pagado,
                "fecha_elaboracion": fecha_elaboracion.isoformat(),
                "fecha_pago": fecha_pago.isoformat() if fecha_pago else None,
                "estado": estado,
                "tipo": tipo,
                "mes": fecha_elaboracion.month,
                "anio": fecha_elaboracion.year,
                "empresa": hoja,
                "codigo_contable": codigo_contable,
            }
        )
        report.sheet_stats[hoja].inserted += 1

    return records


def leer_y_validar_excel(strict: bool) -> tuple[list[dict[str, Any]], ImportReport]:
    report = ImportReport()
    if not EXCEL_PATH.exists():
        report.fatal_errors.append(f"No se encontro el Excel en {EXCEL_PATH}")
        return [], report

    print(f"[INFO] Leyendo '{EXCEL_PATH}'")
    try:
        xl = pd.ExcelFile(EXCEL_PATH)
    except Exception as exc:
        report.fatal_errors.append(f"Excel corrupto o no legible: {exc}")
        return [], report

    print(f"[INFO] Hojas disponibles: {', '.join(xl.sheet_names)}")
    validate_required_sheets(xl, report)
    if report.fatal_errors:
        return [], report

    all_records: list[dict[str, Any]] = []
    sheet_dfs: dict[str, tuple[pd.DataFrame, dict[str, str]]] = {}

    for hoja in VALID_EMPRESAS:
        df = pd.read_excel(EXCEL_PATH, sheet_name=hoja, header=0)
        report.sheet_stats[hoja].rows_read = len(df.index)
        required_columns = validate_required_columns(df, hoja, report)
        if required_columns is None:
            continue
        sheet_dfs[hoja] = (df, required_columns)
        report.duplicates.extend(pre_scan_duplicates(df, hoja, required_columns))

    if report.fatal_errors:
        return [], report

    for hoja in VALID_EMPRESAS:
        df, required_columns = sheet_dfs[hoja]
        add_message(report, "INFO", f"{len(df.index)} filas procesadas", hoja=hoja)
        all_records.extend(process_sheet(df, hoja, required_columns, report, strict))

    return all_records, report


def print_duplicate_alert(report: ImportReport) -> None:
    if not report.duplicates:
        return

    print("\n=======================================")
    print("ATENCION - FACTURAS DUPLICADAS EN EXCEL")
    print("=======================================")
    print(f"Se detectaron {len(report.duplicates)} facturas duplicadas:")
    for duplicate in report.duplicates:
        filas = ", ".join(str(fila) for fila in duplicate.filas)
        print(
            f"  - {duplicate.empresa} factura {duplicate.numero_factura} aparece en filas {filas}"
        )
    print("Se usara la primera ocurrencia de cada una.")
    print("Corregir el Excel despues del import para evitar confusion.")
    print("=======================================")


def print_summary(report: ImportReport, ready_rows: int) -> None:
    infos = [message for message in report.messages if message.level == "INFO"]
    warnings = [message for message in report.messages if message.level == "WARNING"]
    errors = [message for message in report.messages if message.level == "ERROR"]

    for fatal_error in report.fatal_errors:
        print(f"[ERROR] {fatal_error}")
    for message in infos:
        print(message.render())
    for message in warnings:
        print(message.render())
    for message in errors:
        print(message.render())

    print("\nResumen import")
    print("=======================================")
    total_inserted = 0
    total_skipped = 0
    for hoja in VALID_EMPRESAS:
        stats = report.sheet_stats[hoja]
        total_inserted += stats.inserted
        total_skipped += stats.skipped
        print(f"Hoja {hoja}:")
        print(f"  - {stats.rows_read} filas leidas")
        print(f"  - {stats.inserted} filas insertadas")
        print(f"  - {stats.skipped} filas saltadas")

    print(f"\nTotal: {total_inserted} insertadas, {total_skipped} saltadas")

    print("\nNormalizaciones aplicadas:")
    print(f"  - {report.normalization_counts['vida_to_seguros']} tipos \"VIDA\" -> \"SEGUROS\"")
    print(
        f"  - {report.normalization_counts['pagada_fecha_fallback']} facturas PAGADAS sin fecha_pago -> fecha_elaboracion"
    )
    print(
        f"  - {report.normalization_counts['pagada_valor_fallback']} facturas PAGADAS sin valor_pagado -> debito"
    )
    print(
        f"  - {report.normalization_counts['tipo_invalido_cmym_a_na']} tipos invalidos en CMYM -> N/A"
    )
    print(
        f"  - {report.normalization_counts['tipo_normalizado_otros']} tipos invalidos en SYSO/SANUM -> OTROS"
    )
    print(f"  - {report.normalization_counts['duplicados_saltados']} filas saltadas por duplicado interno")

    print("\nFilas saltadas:")
    if report.skipped_rows:
        for item in report.skipped_rows:
            print(f"  - {item}")
    else:
        print("  - Ninguna")

    warning_count = len(warnings)
    error_count = len(report.fatal_errors) + len(errors)
    print("=======================================")
    print(
        f"Resumen final: {ready_rows} filas listas para cargar, {error_count} errores, {warning_count} advertencias"
    )


def resolve_actor_user(explicit_actor: str | None) -> str | None:
    candidate = (explicit_actor or os.getenv("AUDIT_ACTOR_USUARIO") or os.getenv("USERNAME") or "").strip()
    return candidate or None


def fetch_existing_keys(supabase: Any, registros: list[dict[str, Any]]) -> set[tuple[str, str]]:
    numeros = sorted({str(item["numero_factura"]) for item in registros})
    empresas = sorted({str(item["empresa"]) for item in registros})
    existing: set[tuple[str, str]] = set()

    if not numeros or not empresas:
        return existing

    chunk_size = 200
    for start in range(0, len(numeros), chunk_size):
        chunk = numeros[start : start + chunk_size]
        response = (
            supabase.table("recaudos")
            .select("numero_factura,empresa")
            .in_("numero_factura", chunk)
            .in_("empresa", empresas)
            .execute()
        )
        for row in response.data or []:
            existing.add((str(row["empresa"]), str(row["numero_factura"])))

    return existing


def registrar_auditoria_importacion(
    *,
    actor_user: str | None,
    mode: str,
    success: bool,
    report: ImportReport,
    ready_rows: int,
    execute: bool,
    strict: bool,
    upsert_stats: UpsertStats | None = None,
    runtime_error: str | None = None,
) -> None:
    try:
        supabase_url = _require_env("SUPABASE_URL")
        supabase_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
        supabase = create_client(supabase_url, supabase_key)
        warnings = len([message for message in report.messages if message.level == "WARNING"])
        errors = len(report.fatal_errors) + len([message for message in report.messages if message.level == "ERROR"])
        actor = actor_user or "script"
        summary = (
            f"Importacion recaudos {mode}: archivo {EXCEL_PATH.name}, "
            f"{ready_rows} listas, {sum(stats.skipped for stats in report.sheet_stats.values())} rechazadas"
        )
        if upsert_stats is not None:
            summary += (
                f", {upsert_stats.created} creadas, {upsert_stats.updated} actualizadas"
            )

        payload = {
            "actor_usuario": actor,
            "action": f"recaudos_{mode}",
            "entity_type": "recaudos_import",
            "entity_id": EXCEL_PATH.name,
            "module": "cartera",
            "source": "script",
            "status": "success" if success else "failure",
            "summary": summary,
            "metadata": {
                "execute": execute,
                "strict": strict,
                "archivo": str(EXCEL_PATH),
                "archivo_nombre": EXCEL_PATH.name,
                "archivo_modificado_at": datetime.fromtimestamp(EXCEL_PATH.stat().st_mtime).isoformat()
                if EXCEL_PATH.exists()
                else None,
                "actor_user": actor_user,
                "os_user": os.getenv("USERNAME"),
                "ready_rows": ready_rows,
                "warning_count": warnings,
                "error_count": errors,
                "strict_findings": report.strict_findings,
                "skipped_rows": report.skipped_rows,
                "fatal_errors": report.fatal_errors,
                "upsert_total": upsert_stats.total if upsert_stats else 0,
                "created_count": upsert_stats.created if upsert_stats else 0,
                "updated_count": upsert_stats.updated if upsert_stats else 0,
                "batch_count": upsert_stats.batches if upsert_stats else 0,
                "runtime_error": runtime_error,
            },
        }
        supabase.table("audit_events").insert(payload).execute()
    except Exception as exc:
        print(f"[WARNING] No se pudo registrar auditoria de importacion: {exc}")


def subir_a_supabase(registros: list[dict[str, Any]]) -> UpsertStats:
    supabase_url = _require_env("SUPABASE_URL")
    supabase_key = _require_env("SUPABASE_SERVICE_ROLE_KEY")
    supabase = create_client(supabase_url, supabase_key)

    batch = 100
    stats = UpsertStats()
    print(f"\n[INFO] Subiendo {len(registros)} registros en lotes de {batch}")
    for i in range(0, len(registros), batch):
        lote = registros[i : i + batch]
        existing_keys = fetch_existing_keys(supabase, lote)
        batch_created = sum(
            1
            for item in lote
            if (str(item["empresa"]), str(item["numero_factura"])) not in existing_keys
        )
        stats.created += batch_created
        stats.updated += len(lote) - batch_created
        supabase.table("recaudos").upsert(lote, on_conflict="numero_factura,empresa").execute()
        stats.total += len(lote)
        stats.batches += 1
        print(f"[INFO] Lote {i // batch + 1}: {len(lote)} registros OK")
    return stats


def main() -> int:
    args = parse_args()
    execute = bool(args.execute)
    strict = bool(args.strict)
    actor_user = resolve_actor_user(args.actor_user)

    records, report = leer_y_validar_excel(strict=strict)
    print_duplicate_alert(report)
    print_summary(report, ready_rows=len(records) if not report.fatal_errors else 0)

    if report.fatal_errors:
        registrar_auditoria_importacion(
            actor_user=actor_user,
            mode="validation_failed",
            success=False,
            report=report,
            ready_rows=0,
            execute=execute,
            strict=strict,
        )
        print("[ERROR] Validacion estructural fallida. No se insertaron datos.")
        return 1

    if strict and report.strict_findings:
        registrar_auditoria_importacion(
            actor_user=actor_user,
            mode="strict_blocked",
            success=False,
            report=report,
            ready_rows=len(records),
            execute=execute,
            strict=strict,
        )
        print("[ERROR] Modo strict: se detectaron hallazgos de auditoria. No se insertaron datos.")
        return 1

    if not execute:
        registrar_auditoria_importacion(
            actor_user=actor_user,
            mode="dry_run",
            success=True,
            report=report,
            ready_rows=len(records),
            execute=False,
            strict=strict,
        )
        print("[INFO] Dry-run completado. No se realizaron inserciones.")
        return 0

    try:
        upsert_stats = subir_a_supabase(records)
    except Exception as exc:
        registrar_auditoria_importacion(
            actor_user=actor_user,
            mode="execute",
            success=False,
            report=report,
            ready_rows=len(records),
            execute=True,
            strict=strict,
            runtime_error=str(exc),
        )
        print(f"[ERROR] Fallo la carga a Supabase: {exc}")
        return 1

    registrar_auditoria_importacion(
        actor_user=actor_user,
        mode="execute",
        success=True,
        report=report,
        ready_rows=len(records),
        execute=True,
        strict=strict,
        upsert_stats=upsert_stats,
    )
    print(f"[INFO] {upsert_stats.total} filas insertadas/actualizadas")
    print(f"[INFO] Creadas: {upsert_stats.created} | Actualizadas: {upsert_stats.updated}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
