from __future__ import annotations

import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd  # type: ignore

BASE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BASE_DIR.parent
DATA_DIR = PROJECT_ROOT / "data"

DEFAULT_ARL_EXCEL = BASE_DIR / "TABLA DE COMISIONES ARL.xlsx"
DEFAULT_SEGUROS_EXCEL = BASE_DIR / "Informe comisiones seguros.xlsx"

ARL_EXCEL = Path(os.getenv("EXCEL_ARL_PATH", str(DEFAULT_ARL_EXCEL)))
SEGUROS_EXCEL = Path(os.getenv("EXCEL_SEGUROS_PATH", str(DEFAULT_SEGUROS_EXCEL)))

ARL_SHEET_NAME = "TABLA DE COMISIONES"
ARL_SHEET_RETORNO = "Retorno"
ARL_BASE_SHEET = "Base de Datos"
ARL_HEADER_ROW = 8
ARL_YEAR_FROM = 2020
ARL_YEAR_TO = 2035

SEGUROS_SHEET_NAME = "INFORME DE VENTAS"

ARL_JSON_PATH = DATA_DIR / "datos_arl.json"
SEGUROS_JSON_PATH = DATA_DIR / "datos_seguros.json"

MONTH_ORDER = [
    ("ENERO", "ene", "ENE", 1),
    ("FEBRERO", "feb", "FEB", 2),
    ("MARZO", "mar", "MAR", 3),
    ("ABRIL", "abr", "ABR", 4),
    ("MAYO", "may", "MAY", 5),
    ("JUNIO", "jun", "JUN", 6),
    ("JULIO", "jul", "JUL", 7),
    ("AGOSTO", "ago", "AGO", 8),
    ("SEPTIEMBRE", "sep", "SEP", 9),
    ("OCTUBRE", "oct", "OCT", 10),
    ("NOVIEMBRE", "nov", "NOV", 11),
    ("DICIEMBRE", "dic", "DIC", 12),
]

MONTH_NAME_TO_KEY = {name: key for name, key, _, _ in MONTH_ORDER}
MONTH_KEY_TO_SHORT = {key: short for _, key, short, _ in MONTH_ORDER}
MONTH_KEY_TO_ORDER = {key: order for _, key, _, order in MONTH_ORDER}


@dataclass
class ProcessResult:
    output_path: Path
    records: int
    summary: str


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def strip_accents(value: str) -> str:
    replacements = str.maketrans(
        {
            "Á": "A",
            "É": "E",
            "Í": "I",
            "Ó": "O",
            "Ú": "U",
            "á": "a",
            "é": "e",
            "í": "i",
            "ó": "o",
            "ú": "u",
            "Ñ": "N",
            "ñ": "n",
        }
    )
    return value.translate(replacements)


def normalize_header(value: Any) -> str:
    text = normalize_text(value)
    text = text.replace("\n", " ").replace("\r", " ")
    text = re.sub(r"\s+", " ", text)
    return text


def normalize_company_key(value: Any) -> str:
    return re.sub(r"\s+", " ", normalize_text(value)).upper()


def clean_nit(value: Any) -> str:
    if pd.isna(value):
        return ""
    nit = normalize_text(value)
    if not nit or nit.lower() == "nan":
        return ""
    if nit.endswith(".0"):
        nit = nit[:-2]
    return re.sub(r"[^\d\-]", "", nit)


def normalize_month_label(value: Any) -> tuple[str | None, str | None]:
    if isinstance(value, pd.Timestamp):
        month_number = int(value.month)
        for _, key, short, order in MONTH_ORDER:
            if order == month_number:
                return key, short

    raw = strip_accents(normalize_text(value).upper())
    if not raw or raw == "NAN":
        return None, None

    parsed = pd.to_datetime(raw, errors="coerce")
    if pd.notna(parsed):
        month_number = int(parsed.month)
        for _, key, short, order in MONTH_ORDER:
            if order == month_number:
                return key, short

    key = MONTH_NAME_TO_KEY.get(raw)
    if not key:
        return None, None
    return key, MONTH_KEY_TO_SHORT[key]


def month_sort_key(value: str) -> tuple[int, int]:
    raw = normalize_text(value)
    if not raw:
        return (0, 0)

    parts = raw.split("-")
    if len(parts) != 2:
        return (0, 0)

    month_name = strip_accents(parts[0].upper())
    year = int(parts[1]) if parts[1].isdigit() else 0
    month_key = MONTH_NAME_TO_KEY.get(month_name)
    return (year, MONTH_KEY_TO_ORDER.get(month_key or "", 0))


def build_meta() -> dict[str, Any]:
    return {
        "_meta": {
            "last_import": datetime.now().replace(microsecond=0).isoformat()
        }
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as file:
        json.dump(payload, file, ensure_ascii=False)


def build_nit_map(df_principal: pd.DataFrame, excel_path: Path) -> dict[str, str]:
    nit_map: dict[str, str] = {}

    if {"EMPRESA", "NIT"}.issubset(df_principal.columns):
        for _, row in df_principal[["EMPRESA", "NIT"]].dropna(subset=["EMPRESA"]).iterrows():
            key = normalize_company_key(row["EMPRESA"])
            nit = clean_nit(row["NIT"])
            if key and nit and key not in nit_map:
                nit_map[key] = nit

    try:
        df_base = pd.read_excel(excel_path, sheet_name=ARL_BASE_SHEET, header=5)
        df_base.columns = [normalize_header(column) for column in df_base.columns]
        if {"EMPRESA", "NIT"}.issubset(df_base.columns):
            for _, row in df_base[["EMPRESA", "NIT"]].dropna(subset=["EMPRESA"]).iterrows():
                key = normalize_company_key(row["EMPRESA"])
                nit = clean_nit(row["NIT"])
                if key and nit and key not in nit_map:
                    nit_map[key] = nit
    except Exception as error:
        print(f"[ARL] Advertencia: no se pudo leer NIT desde '{ARL_BASE_SHEET}': {error}")

    return nit_map


def process_arl_excel(excel_path: Path) -> ProcessResult:
    df = pd.read_excel(excel_path, sheet_name=ARL_SHEET_NAME, header=ARL_HEADER_ROW)
    df.columns = [normalize_header(column) for column in df.columns]
    if "AÑO" not in df.columns:
        first_column = str(df.columns[0])
        if first_column.isdigit():
            df = df.rename(columns={first_column: "AÑO"})

    required_columns = [
        "EMPRESA",
        "ARL",
        "AÑO",
        "MES COTIZADO",
        "COMISION CMYM",
        "COTIZACION PLANILLA ARL",
        "CIUDAD",
        "NIT",
    ]
    missing = [column for column in required_columns if column not in df.columns]
    if missing:
        raise ValueError(f"faltan columnas requeridas en hoja '{ARL_SHEET_NAME}': {', '.join(missing)}")

    df["COMISION CMYM"] = pd.to_numeric(df["COMISION CMYM"], errors="coerce").fillna(0)
    df["COTIZACION PLANILLA ARL"] = pd.to_numeric(df["COTIZACION PLANILLA ARL"], errors="coerce").fillna(0)
    df["AÑO"] = pd.to_numeric(df["AÑO"], errors="coerce")
    df = df[df["AÑO"].between(ARL_YEAR_FROM, ARL_YEAR_TO)].copy()
    df["AÑO"] = df["AÑO"].astype(int)

    month_pairs = df["MES COTIZADO"].apply(normalize_month_label)
    df["MES_KEY"] = month_pairs.apply(lambda value: value[0])
    df["MES"] = month_pairs.apply(lambda value: value[1])
    df = df[df["MES_KEY"].notna()].copy()

    nit_map = build_nit_map(df, excel_path)

    try:
        df_retornos = pd.read_excel(excel_path, sheet_name=ARL_SHEET_RETORNO)
        df_retornos.columns = [normalize_header(column) for column in df_retornos.columns]
        df_retornos = df_retornos.rename(columns={"Retorno ": "Retorno"})
        required_ret_cols = {"Empresa", "Retorno", "retenciones"}
        if not required_ret_cols.issubset(df_retornos.columns):
            missing_ret = sorted(required_ret_cols - set(df_retornos.columns))
            raise ValueError(", ".join(missing_ret))

        df_retornos["Retorno"] = pd.to_numeric(df_retornos["Retorno"], errors="coerce").fillna(0)
        df_retornos["retenciones"] = pd.to_numeric(df_retornos["retenciones"], errors="coerce").fillna(0)

        if not df_retornos.empty and df_retornos["Retorno"].max() > 1:
            df_retornos["Retorno"] = df_retornos["Retorno"] / 100.0
        if not df_retornos.empty and df_retornos["retenciones"].max() > 1:
            df_retornos["retenciones"] = df_retornos["retenciones"] / 100.0

        df = pd.merge(
            df,
            df_retornos[["Empresa", "Retorno", "retenciones"]],
            left_on="EMPRESA",
            right_on="Empresa",
            how="left",
        )
        df["Retorno"] = df["Retorno"].fillna(0)
        df["retenciones"] = df["retenciones"].fillna(0)
        df = df.drop(columns=["Empresa"])
    except Exception as error:
        print(f"[ARL] Advertencia: no se pudo procesar hoja '{ARL_SHEET_RETORNO}': {error}")
        df["Retorno"] = 0.0
        df["retenciones"] = 0.0

    df["VALOR_RETENCION"] = df["COMISION CMYM"] * df["retenciones"]
    df["SUBTOTAL"] = df["COMISION CMYM"] - df["VALOR_RETENCION"]
    df["VALOR_RETORNO"] = df["SUBTOTAL"] * df["Retorno"]
    df["COMISION NETA"] = df["SUBTOTAL"] - df["VALOR_RETORNO"]

    month_sorted = sorted(df["MES_KEY"].dropna().unique(), key=lambda value: MONTH_KEY_TO_ORDER.get(str(value), 0))

    por_anio = {
        str(int(year)): int(total)
        for year, total in df.groupby("AÑO")["COMISION CMYM"].sum().round(0).items()
    }
    por_anio_neta = {
        str(int(year)): int(total)
        for year, total in df.groupby("AÑO")["COMISION NETA"].sum().round(0).items()
    }
    por_arl = {
        str(arl): int(total)
        for arl, total in df.groupby("ARL")["COMISION CMYM"].sum().round(0).sort_values(ascending=False).items()
    }
    por_arl_neta = {
        str(arl): int(total)
        for arl, total in df.groupby("ARL")["COMISION NETA"].sum().round(0).sort_values(ascending=False).items()
    }
    por_ciudad = {
        str(ciudad): int(total)
        for ciudad, total in df.groupby("CIUDAD")["COMISION CMYM"].sum().round(0).sort_values(ascending=False).items()
    }
    por_ciudad_neta = {
        str(ciudad): int(total)
        for ciudad, total in df.groupby("CIUDAD")["COMISION NETA"].sum().round(0).sort_values(ascending=False).items()
    }
    por_mes = {
        MONTH_KEY_TO_SHORT[key]: int(df.loc[df["MES_KEY"] == key, "COMISION CMYM"].sum())
        for key in month_sorted
    }
    por_mes_neta = {
        MONTH_KEY_TO_SHORT[key]: int(df.loc[df["MES_KEY"] == key, "COMISION NETA"].sum())
        for key in month_sorted
    }
    top_empresas = {
        str(empresa): int(total)
        for empresa, total in (
            df.groupby("EMPRESA")["COMISION CMYM"].sum().round(0).sort_values(ascending=False).head(10).items()
        )
    }
    top_empresas_neta = {
        str(empresa): int(total)
        for empresa, total in (
            df.groupby("EMPRESA")["COMISION NETA"].sum().round(0).sort_values(ascending=False).head(10).items()
        )
    }

    arl_anio_df = (
        df.groupby(["AÑO", "ARL"], as_index=False)[["COMISION CMYM", "COMISION NETA"]]
        .sum()
        .round(0)
    )
    arl_anio = [
        {
            "AÑO": int(row["AÑO"]),
            "ARL": row["ARL"],
            "COMISION": int(row["COMISION CMYM"]),
            "COMISION_NETA": int(row["COMISION NETA"]),
        }
        for _, row in arl_anio_df.iterrows()
    ]

    detalle_df = (
        df.groupby(["EMPRESA", "ARL", "AÑO", "MES_KEY"], sort=False)
        .agg(
            NIT=("NIT", "first"),
            COMISION=("COMISION CMYM", "sum"),
            COMISION_NETA=("COMISION NETA", "sum"),
            VALOR_RETENCION=("VALOR_RETENCION", "sum"),
            VALOR_RETORNO=("VALOR_RETORNO", "sum"),
            COTIZACION=("COTIZACION PLANILLA ARL", "sum"),
        )
        .reset_index()
    )
    detalle = []
    for _, row in detalle_df.iterrows():
        empresa = row["EMPRESA"]
        detalle.append(
            {
                "EMPRESA": empresa,
                "ARL": row["ARL"],
                "AÑO": int(row["AÑO"]),
                "MES": MONTH_KEY_TO_SHORT[str(row["MES_KEY"])],
                "NIT": clean_nit(row["NIT"]) or nit_map.get(normalize_company_key(empresa), ""),
                "COMISION": int(round(float(row["COMISION"]) if pd.notna(row["COMISION"]) else 0)),
                "COMISION_NETA": int(round(float(row["COMISION_NETA"]) if pd.notna(row["COMISION_NETA"]) else 0)),
                "VALOR_RETENCION": int(round(float(row["VALOR_RETENCION"]) if pd.notna(row["VALOR_RETENCION"]) else 0)),
                "VALOR_RETORNO": int(round(float(row["VALOR_RETORNO"]) if pd.notna(row["VALOR_RETORNO"]) else 0)),
                "COTIZACION": int(round(float(row["COTIZACION"]) if pd.notna(row["COTIZACION"]) else 0)),
            }
        )

    payload = {
        **build_meta(),
        "por_anio": por_anio,
        "por_anio_neta": por_anio_neta,
        "por_arl": por_arl,
        "por_arl_neta": por_arl_neta,
        "por_ciudad": por_ciudad,
        "por_ciudad_neta": por_ciudad_neta,
        "por_mes": por_mes,
        "por_mes_neta": por_mes_neta,
        "top_empresas": top_empresas,
        "top_empresas_neta": top_empresas_neta,
        "arl_anio": arl_anio,
        "detalle": detalle,
        "total_comision": int(round(df["COMISION CMYM"].sum())),
        "total_comision_neta": int(round(df["COMISION NETA"].sum())),
        "total_cotizacion": int(round(df["COTIZACION PLANILLA ARL"].sum())),
        "total_registros": int(len(df)),
        "total_empresas": int(df["EMPRESA"].nunique()),
        "anios_disponibles": sorted(int(year) for year in df["AÑO"].dropna().unique().tolist()),
    }
    write_json(ARL_JSON_PATH, payload)

    return ProcessResult(
        output_path=ARL_JSON_PATH,
        records=int(len(df)),
        summary=f"{len(df):,} registros | {payload['total_empresas']} empresas",
    )


def process_seguros_excel(excel_path: Path) -> ProcessResult:
    df = pd.read_excel(excel_path, sheet_name=SEGUROS_SHEET_NAME)
    df.columns = [normalize_header(column) for column in df.columns]
    df = df.rename(columns={"POLIZA ": "POLIZA"})

    required_columns = [
        "ASEGURADO",
        "ASEGURADORA",
        "PRIMA PAGADA",
        "comision pagada",
        "% Comision",
        "MES movimiento",
        "AÑO",
        "FECHA PAGADA",
        "Estado de factura",
        "POLIZA",
    ]
    missing = [column for column in required_columns if column not in df.columns]
    if missing:
        raise ValueError(f"faltan columnas requeridas en hoja '{SEGUROS_SHEET_NAME}': {', '.join(missing)}")

    df = df[required_columns].copy()
    df["ASEGURADO"] = df["ASEGURADO"].fillna("").astype(str).str.strip()
    df["ASEGURADORA"] = df["ASEGURADORA"].fillna("").astype(str).str.strip()
    df["POLIZA"] = df["POLIZA"].fillna("").astype(str).str.strip()
    df["Estado de factura"] = df["Estado de factura"].fillna("SIN ESTADO").astype(str).str.strip().str.upper()
    df["PRIMA PAGADA"] = pd.to_numeric(df["PRIMA PAGADA"], errors="coerce").fillna(0)
    df["comision pagada"] = pd.to_numeric(df["comision pagada"], errors="coerce").fillna(0)
    df["% Comision"] = pd.to_numeric(df["% Comision"], errors="coerce")
    df["AÑO"] = pd.to_numeric(df["AÑO"], errors="coerce")
    df["FECHA PAGADA"] = pd.to_datetime(df["FECHA PAGADA"], errors="coerce")

    month_pairs = df["MES movimiento"].apply(normalize_month_label)
    df["MES_KEY"] = month_pairs.apply(lambda value: value[0])
    df["MES"] = month_pairs.apply(lambda value: value[1])

    df = df[
        (df["ASEGURADO"] != "")
        & (df["ASEGURADORA"] != "")
        & df["AÑO"].notna()
        & df["MES_KEY"].notna()
    ].copy()
    df["AÑO"] = df["AÑO"].astype(int)

    resumen = {
        "total_comisiones": float(df["comision pagada"].sum()),
        "total_prima": float(df["PRIMA PAGADA"].sum()),
        "clientes_unicos": int(df["ASEGURADO"].nunique()),
        "registros_totales": int(len(df)),
        "años": sorted(int(year) for year in df["AÑO"].dropna().unique().tolist()),
    }
    por_anio = {
        str(int(year)): float(total)
        for year, total in df.groupby("AÑO")["comision pagada"].sum().sort_index().items()
    }
    por_aseguradora = {
        aseguradora: float(total)
        for aseguradora, total in df.groupby("ASEGURADORA")["comision pagada"].sum().sort_values(ascending=False).items()
    }

    tendencia_mensual = []
    for _, key, short, _ in MONTH_ORDER:
        month_df = df[df["MES_KEY"] == key]
        tendencia_mensual.append(
            {
                "mes": short,
                "comision": float(month_df["comision pagada"].sum()),
                "prima": float(month_df["PRIMA PAGADA"].sum()),
            }
        )

    top_clientes_df = (
        df.groupby("ASEGURADO", as_index=False)
        .agg({"comision pagada": "sum", "PRIMA PAGADA": "sum"})
        .sort_values("comision pagada", ascending=False)
        .head(10)
    )
    top_clientes = [
        {
            "asegurado": row["ASEGURADO"],
            "comision": float(row["comision pagada"]),
            "prima": float(row["PRIMA PAGADA"]),
        }
        for _, row in top_clientes_df.iterrows()
    ]

    detalle = [
        {
            "ASEGURADO": row["ASEGURADO"],
            "ASEGURADORA": row["ASEGURADORA"],
            "PRIMA": float(row["PRIMA PAGADA"]),
            "COMISION": float(row["comision pagada"]),
            "PORCENTAJE_COMISION": float(row["% Comision"]) if pd.notna(row["% Comision"]) else None,
            "MES": row["MES"],
            "MES_KEY": row["MES_KEY"],
            "ANIO": int(row["AÑO"]),
            "FECHA_PAGADA": row["FECHA PAGADA"].strftime("%Y-%m-%d") if pd.notna(row["FECHA PAGADA"]) else "",
            "ESTADO": row["Estado de factura"],
            "POLIZA": row["POLIZA"],
        }
        for _, row in df.sort_values(["AÑO", "MES_KEY", "ASEGURADO", "POLIZA"]).iterrows()
    ]

    payload = {
        **build_meta(),
        "resumen": resumen,
        "por_anio": por_anio,
        "por_aseguradora": por_aseguradora,
        "tendencia_mensual": tendencia_mensual,
        "top_clientes": top_clientes,
        "detalle": detalle,
    }
    write_json(SEGUROS_JSON_PATH, payload)

    return ProcessResult(
        output_path=SEGUROS_JSON_PATH,
        records=int(len(df)),
        summary=f"{len(df):,} registros | {resumen['clientes_unicos']} clientes",
    )


def run_job(label: str, excel_path: Path, processor) -> tuple[bool, ProcessResult | None]:
    if not excel_path.exists():
        print(f"[{label}] Archivo no encontrado: {excel_path}")
        return False, None

    try:
        result = processor(excel_path)
        print(f"[{label}] OK -> {result.output_path} | {result.summary}")
        return True, result
    except Exception as error:
        print(f"[{label}] Error procesando '{excel_path.name}': {error}")
        return False, None


def main() -> int:
    print("Publicando datasets operativos para Next.js")
    print(f"ARL source: {ARL_EXCEL}")
    print(f"Seguros source: {SEGUROS_EXCEL}")

    success_arl, result_arl = run_job("ARL", ARL_EXCEL, process_arl_excel)
    success_seguros, result_seguros = run_job("SEGUROS", SEGUROS_EXCEL, process_seguros_excel)

    print("")
    print("Resumen final")
    if result_arl:
        print(f"- ARL: {result_arl.records:,} registros -> {result_arl.output_path}")
    if result_seguros:
        print(f"- Seguros: {result_seguros.records:,} registros -> {result_seguros.output_path}")

    return 0 if success_arl and success_seguros else 1


if __name__ == "__main__":
    raise SystemExit(main())
