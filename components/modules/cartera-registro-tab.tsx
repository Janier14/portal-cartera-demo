"use client";

import { Check, ChevronLeft, ChevronRight, Edit3, Eraser, FileSpreadsheet, LoaderCircle, Plus, Save, Search, SquarePen, Trash2, X } from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

import { CompanyFilter } from "@/components/ui";
import { CompanyBadge } from "@/components/ui/company-badge";
import {
  CARTERA_EMPRESAS,
  getDefaultTipoForEmpresa,
  getTiposForEmpresa,
  normalizeTipoForEmpresa,
  normalizeFacturaInput,
  normalizeFacturaRow,
  type CarteraEmpresa
} from "@/lib/cartera-facturas";
import type { RecaudoRow } from "@/lib/modules/cartera";
import { formatCurrency } from "@/lib/modules/format";

type FacturaInventoryItem = ReturnType<typeof normalizeFacturaRow>;
type EstadoFiltro = "PENDIENTE" | "PAGADA" | "ANULADA" | "ALL";
type InventarioFilters = {
  empresa: "TODAS" | "CMYM" | "SYSO" | "SANUM";
  estado: EstadoFiltro;
  q: string;
};

type FacturaFormState = {
  empresa: CarteraEmpresa;
  fecha_elaboracion: string;
  codigo_contable: string;
  identificacion: string;
  nombre_tercero: string;
  numero_factura: string;
  detalle: string;
  debito: string;
  fecha_pago: string;
  valor_pagado: string;
  estado: "PAGADA" | "PENDIENTE" | "ANULADA";
  tipo: "ARL" | "SEGUROS" | "SALUD" | "OTROS" | "N/A";
};

type EditingKey = {
  numero_factura: string;
  empresa: CarteraEmpresa;
} | null;

type CarteraRegistroTabProps = {
  empresaActiva: "CMYM" | "SYSO" | "SANUM" | "TODAS";
  onGoToFacturacion: () => void;
  onFacturaSaved: (factura: RecaudoRow, options?: { title: string; description?: string }) => void;
  onFacturaDeleted: (key: { numero_factura: string; empresa: string }, options?: { title: string; description?: string }) => void;
  onFacturasBatchSaved?: (rows: RecaudoRow[], options?: { title: string; description?: string }) => void;
};

const PAGE_SIZE = 50;
const FETCH_LIMIT = 5000;
const FIELD_WIDTHS = {
  empresa: 100,
  fecha_elaboracion: 140,
  codigo_contable: 120,
  identificacion: 140,
  nombre_tercero: 260,
  numero_factura: 140,
  detalle: 180,
  debito: 130,
  fecha_pago: 140,
  valor_pagado: 130,
  estado: 120,
  tipo: 110
} as const;

function createEmptyForm(empresa: CarteraEmpresa): FacturaFormState {
  return {
    empresa,
    fecha_elaboracion: "",
    codigo_contable: "",
    identificacion: "",
    nombre_tercero: "",
    numero_factura: "",
    detalle: "",
    debito: "",
    fecha_pago: "",
    valor_pagado: "",
    estado: "PENDIENTE",
    tipo: getDefaultTipoForEmpresa(empresa)
  };
}

function facturaToRecaudoRow(factura: FacturaInventoryItem): RecaudoRow {
  return {
    compania: factura.nombre_tercero,
    valor: factura.debito,
    pagado: factura.valor_pagado,
    fecha_factura: factura.fecha_elaboracion,
    fecha_pago: factura.fecha_pago,
    estado: factura.estado,
    tipo: factura.tipo,
    numero_factura: factura.numero_factura,
    mes: factura.mes,
    anio: factura.anio,
    empresa: factura.empresa,
    detalle: factura.detalle,
    codigo_contable: factura.codigo_contable,
    identificacion: factura.identificacion
  };
}

function formatMoneyInput(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("es-CO");
}

function parseMoneyInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function matchesFilters(factura: FacturaInventoryItem, filters: InventarioFilters) {
  const empresaMatch = filters.empresa === "TODAS" || factura.empresa === filters.empresa;
  const estadoMatch = filters.estado === "ALL" || factura.estado === filters.estado;
  const query = filters.q.trim().toLowerCase();
  const queryMatch = !query ||
    factura.numero_factura.toLowerCase().includes(query) ||
    factura.nombre_tercero.toLowerCase().includes(query);
  return empresaMatch && estadoMatch && queryMatch;
}

export function CarteraRegistroTab({
  empresaActiva,
  onGoToFacturacion,
  onFacturaSaved,
  onFacturaDeleted,
  onFacturasBatchSaved
}: CarteraRegistroTabProps) {
  const defaultEmpresa = empresaActiva === "TODAS" ? "CMYM" : empresaActiva;
  const [captureMode, setCaptureMode] = useState<"form" | "hoja">("form");
  const [form, setForm] = useState<FacturaFormState>(() => createEmptyForm(defaultEmpresa));
  const [editingKey, setEditingKey] = useState<EditingKey>(null);
  const [editingFactura, setEditingFactura] = useState<FacturaInventoryItem | null>(null);
  const [inventoryRows, setInventoryRows] = useState<FacturaInventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [inventoryError, setInventoryError] = useState("");
  const [inventoryRefreshKey, setInventoryRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<InventarioFilters>({
    empresa: "TODAS",
    estado: "PENDIENTE",
    q: ""
  });
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [infoMsg, setInfoMsg] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<{ msg: string; onConfirm: () => void } | null>(null);
  const [inlineKey, setInlineKey] = useState<{ empresa: CarteraEmpresa; numero_factura: string } | null>(null);
  const [inlineForm, setInlineForm] = useState<FacturaFormState | null>(null);
  const [inlineFocus, setInlineFocus] = useState<string>("");
  const [inlineSaving, setInlineSaving] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const [loadingSugerencias, setLoadingSugerencias] = useState(false);
  const [showSugerencias, setShowSugerencias] = useState(false);
  const suggestionBoxRef = useRef<HTMLDivElement | null>(null);
  const numeroFacturaRef = useRef<HTMLInputElement | null>(null);
  const captureCardRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!suggestionBoxRef.current) return;
      if (suggestionBoxRef.current.contains(event.target as Node)) return;
      setShowSugerencias(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    numeroFacturaRef.current?.focus();
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setPage(1);
      setFilters((current) => ({ ...current, q: searchInput.trim() }));
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  useEffect(() => {
    const q = form.nombre_tercero.trim();
    if (q.length < 2) {
      setSugerencias([]);
      setLoadingSugerencias(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setLoadingSugerencias(true);
      fetch(`/api/cartera/terceros-sugeridos?q=${encodeURIComponent(q)}&empresa=${encodeURIComponent(form.empresa)}`)
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data?.detail || "No fue posible cargar sugerencias");
          setSugerencias(Array.isArray(data.sugerencias) ? (data.sugerencias as string[]) : []);
        })
        .catch(() => setSugerencias([]))
        .finally(() => setLoadingSugerencias(false));
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [form.nombre_tercero, form.empresa]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInventory() {
      setInventoryLoading(true);
      setInventoryError("");

      try {
        const params = new URLSearchParams({
          empresa: "all",
          estado: "all",
          q: "",
          page: "1",
          limit: String(FETCH_LIMIT)
        });
        const response = await fetch(`/api/cartera/facturas?${params.toString()}`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.detail || "No fue posible cargar facturas");
        if (controller.signal.aborted) return;
        setInventoryRows(Array.isArray(data.facturas) ? (data.facturas as FacturaInventoryItem[]) : []);
      } catch (fetchError) {
        if (controller.signal.aborted) return;
        setInventoryError(fetchError instanceof Error ? fetchError.message : "No fue posible cargar facturas");
      } finally {
        if (!controller.signal.aborted) {
          setInventoryLoading(false);
        }
      }
    }

    void loadInventory();
    return () => controller.abort();
  }, [inventoryRefreshKey]);

  const filteredRows = useMemo(
    () => inventoryRows.filter((factura) => matchesFilters(factura, filters)),
    [inventoryRows, filters]
  );
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const tipoOptions = useMemo(() => getTiposForEmpresa(form.empresa), [form.empresa]);
  const pagedRows = useMemo(
    () => filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filteredRows, page]
  );

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function resetForm(nextEmpresa = form.empresa) {
    setForm(createEmptyForm(nextEmpresa));
    setEditingKey(null);
    setEditingFactura(null);
    setError("");
    setShowSugerencias(false);
    setSugerencias([]);
    requestAnimationFrame(() => numeroFacturaRef.current?.focus());
  }

  function buildFormFromFactura(factura: FacturaInventoryItem): FacturaFormState {
    return {
      empresa: factura.empresa,
      fecha_elaboracion: factura.fecha_elaboracion,
      codigo_contable: factura.codigo_contable,
      identificacion: factura.identificacion,
      nombre_tercero: factura.nombre_tercero,
      numero_factura: factura.numero_factura,
      detalle: factura.detalle,
      debito: factura.debito ? String(Math.round(factura.debito)) : "",
      fecha_pago: factura.fecha_pago,
      valor_pagado: factura.valor_pagado ? String(Math.round(factura.valor_pagado)) : "",
      estado: factura.estado === "PAGADA" || factura.estado === "ANULADA" ? factura.estado : "PENDIENTE",
      tipo: normalizeTipoForEmpresa(factura.empresa, factura.tipo)
    };
  }

  function loadFacturaIntoForm(factura: FacturaInventoryItem) {
    cancelInlineEdit();
    setCaptureMode("form");
    setEditingKey({
      numero_factura: factura.numero_factura,
      empresa: factura.empresa
    });
    setEditingFactura(factura);
    setForm(buildFormFromFactura(factura));
    setError("");
    captureCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    requestAnimationFrame(() => numeroFacturaRef.current?.focus());
  }

  function startInlineEdit(factura: FacturaInventoryItem, field = "nombre_tercero") {
    setInlineError("");
    setInlineFocus(field);
    setInlineKey({ empresa: factura.empresa, numero_factura: factura.numero_factura });
    setInlineForm(buildFormFromFactura(factura));
  }

  function cancelInlineEdit() {
    setInlineKey(null);
    setInlineForm(null);
    setInlineError("");
  }

  function patchInline(patch: Partial<FacturaFormState>) {
    setInlineForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }

  async function saveInlineEdit() {
    if (!inlineKey || !inlineForm) return;
    setInlineSaving(true);
    setInlineError("");
    try {
      const normalized = normalizeFacturaInput({
        ...inlineForm,
        debito: Number(parseMoneyInput(inlineForm.debito)),
        valor_pagado: inlineForm.valor_pagado ? Number(parseMoneyInput(inlineForm.valor_pagado)) : 0,
        numero_factura_original: inlineKey.numero_factura,
        empresa_original: inlineKey.empresa
      });
      const payload = {
        ...normalized.payload,
        numero_factura_original: normalized.numero_factura_original,
        empresa_original: normalized.empresa_original
      };
      const response = await fetch("/api/cartera/facturas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 202 && data?.pending_approval) {
        setInfoMsg(data?.detail || "El cambio quedó pendiente por aprobación del administrador.");
        cancelInlineEdit();
        return;
      }
      if (!response.ok) throw new Error(data?.detail || "No fue posible guardar la factura");
      const factura = normalizeFacturaRow(data.factura as Record<string, unknown>);
      onFacturaSaved(facturaToRecaudoRow(factura), { title: `Factura ${factura.numero_factura} actualizada ✓` });
      cancelInlineEdit();
      refreshInventory();
    } catch (saveError) {
      setInlineError(saveError instanceof Error ? saveError.message : "No fue posible guardar la factura");
    } finally {
      setInlineSaving(false);
    }
  }

  function handleInlineKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelInlineEdit();
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLButtonElement) return;
    event.preventDefault();
    void saveInlineEdit();
  }

  function refreshInventory() {
    setInventoryRefreshKey((current) => current + 1);
  }

  function askConfirm(msg: string, onConfirm: () => void) {
    setPendingConfirm({ msg, onConfirm });
  }

  async function saveFactura() {
    if (form.estado === "ANULADA" && (editingFactura?.valor_pagado ?? 0) > 0) {
      askConfirm("Esta factura tiene pago registrado. ¿Confirmas anular?", () => void doSaveFactura());
      return;
    }
    await doSaveFactura();
  }

  async function doSaveFactura() {
    setPendingConfirm(null);

    if (!form.numero_factura.trim()) { setError("El N° de factura es obligatorio."); return; }
    if (!form.nombre_tercero.trim()) { setError("El nombre del tercero es obligatorio."); return; }
    if (!form.fecha_elaboracion) { setError("La fecha de elaboración es obligatoria."); return; }
    if (!form.debito || Number(parseMoneyInput(form.debito)) <= 0) { setError("El débito debe ser mayor a cero."); return; }

    setLoading(true);
    setError("");

    try {
      const normalized = normalizeFacturaInput({
        ...form,
        debito: Number(parseMoneyInput(form.debito)),
        valor_pagado: form.valor_pagado ? Number(parseMoneyInput(form.valor_pagado)) : 0,
        numero_factura_original: editingKey?.numero_factura,
        empresa_original: editingKey?.empresa
      });

      const payload = {
        ...normalized.payload,
        numero_factura_original: normalized.numero_factura_original,
        empresa_original: normalized.empresa_original
      };

      let response = await fetch("/api/cartera/facturas", {
        method: editingKey ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      let data = await response.json();

      if (!editingKey && response.status === 409) {
        setLoading(false);
        askConfirm(
          `Ya existe la factura ${normalized.payload.numero_factura} para empresa ${normalized.payload.empresa}. ¿Actualizar con estos datos?`,
          async () => {
            setLoading(true);
            const r2 = await fetch("/api/cartera/facturas", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...payload, numero_factura_original: normalized.payload.numero_factura, empresa_original: normalized.payload.empresa })
            });
            const d2 = await r2.json();
            setLoading(false);
            if (!r2.ok) { setError(d2?.detail || "No fue posible guardar la factura"); return; }
            const f2 = normalizeFacturaRow(d2.factura as Record<string, unknown>);
            onFacturaSaved(facturaToRecaudoRow(f2), { title: `Factura ${f2.numero_factura} actualizada ✓` });
            resetForm(form.empresa);
            refreshInventory();
          }
        );
        return;
      }

      if (response.status === 202 && data?.pending_approval) {
        setInfoMsg(data?.detail || "El cambio quedó pendiente por aprobación del administrador.");
        resetForm(form.empresa);
        return;
      }

      if (!response.ok) {
        throw new Error(data?.detail || "No fue posible guardar la factura");
      }

      const factura = normalizeFacturaRow(data.factura as Record<string, unknown>);
      const visibleWithCurrentFilter = matchesFilters(factura, filters);
      const actionWord = editingKey ? "actualizada" : "creada";
      onFacturaSaved(facturaToRecaudoRow(factura), {
        title: `Factura ${factura.numero_factura} ${actionWord} ✓`,
        description: visibleWithCurrentFilter ? undefined : `Factura ${actionWord}. No se muestra porque el filtro actual es ${filters.estado === "ALL" ? "TODAS" : filters.estado}.`
      });
      resetForm(form.empresa);
      refreshInventory();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "No fue posible guardar la factura");
    } finally {
      setLoading(false);
    }
  }

  async function deleteFactura(target?: EditingKey) {
    const facturaTarget = target ?? editingKey;
    if (!facturaTarget) return;

    askConfirm(
      `¿Eliminar factura ${facturaTarget.numero_factura} de empresa ${facturaTarget.empresa}? Esta acción no se puede deshacer.`,
      () => void doDeleteFactura(facturaTarget)
    );
  }

  async function doDeleteFactura(facturaTarget: NonNullable<EditingKey>) {
    setPendingConfirm(null);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/cartera/facturas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(facturaTarget)
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 202 && data?.pending_approval) {
        setInfoMsg(data?.detail || "La eliminación quedó pendiente por aprobación del administrador.");
        if (editingKey && facturaTarget.numero_factura === editingKey.numero_factura && facturaTarget.empresa === editingKey.empresa) {
          resetForm(form.empresa);
        }
        return;
      }

      if (!response.ok) {
        throw new Error(data?.detail || "No fue posible eliminar la factura");
      }

      onFacturaDeleted(facturaTarget, {
        title: `Factura ${facturaTarget.numero_factura} eliminada ✓`
      });
      if (editingKey && facturaTarget.numero_factura === editingKey.numero_factura && facturaTarget.empresa === editingKey.empresa) {
        resetForm(form.empresa);
      }
      refreshInventory();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "No fue posible eliminar la factura");
    } finally {
      setLoading(false);
    }
  }

  function handleCompactKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      resetForm(form.empresa);
      return;
    }
    if (event.key !== "Enter" || event.shiftKey) return;
    const target = event.target as HTMLElement;
    if (target instanceof HTMLButtonElement) return;
    event.preventDefault();
    void saveFactura();
  }

  return (
    <div className="cartera-registro">
      <section ref={captureCardRef} className={`module-card cartera-registro__capture-card ${editingKey ? "is-editing" : ""}`}>
        <div className="cartera-registro__header">
          <div>
            <div className={`cartera-registro__eyebrow ${editingKey ? "cartera-registro__eyebrow--editing" : ""}`}>{editingKey ? "Edicion activa" : "Captura manual"}</div>
            <h3 className="cartera-registro__title">{editingKey ? "Editar factura" : captureMode === "hoja" ? "Captura tipo hoja" : "Nueva factura"}</h3>
          </div>
          {!editingKey ? (
            <div className="cartera-registro__mode-toggle" role="tablist" aria-label="Modo de captura">
              <button
                type="button"
                className={`cartera-registro__mode-btn ${captureMode === "form" ? "is-active" : ""}`}
                onClick={() => setCaptureMode("form")}
              >
                <SquarePen size={14} /> Formulario
              </button>
              <button
                type="button"
                className={`cartera-registro__mode-btn ${captureMode === "hoja" ? "is-active" : ""}`}
                onClick={() => setCaptureMode("hoja")}
              >
                <FileSpreadsheet size={14} /> Hoja
              </button>
            </div>
          ) : null}
        </div>

        {captureMode === "form" ? (
        <div className="cartera-registro__capture-scroll" onKeyDown={handleCompactKeyDown}>
          <div className="cartera-registro__capture-row">
            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.empresa }}>
              <span>Empresa</span>
              <select
                value={form.empresa}
                onChange={(event) => {
                  const nextEmpresa = event.target.value as CarteraEmpresa;
                  setForm((prev) => ({
                    ...prev,
                    empresa: nextEmpresa,
                    tipo: normalizeTipoForEmpresa(nextEmpresa, prev.tipo)
                  }));
                }}
              >
                {CARTERA_EMPRESAS.map((empresa) => <option key={empresa} value={empresa}>{empresa}</option>)}
              </select>
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.fecha_elaboracion }}>
              <span>Fecha elab.</span>
              <input type="date" value={form.fecha_elaboracion} onChange={(event) => setForm((prev) => ({ ...prev, fecha_elaboracion: event.target.value }))} />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.codigo_contable }}>
              <span>Cód. contable</span>
              <input value={form.codigo_contable} onChange={(event) => setForm((prev) => ({ ...prev, codigo_contable: event.target.value }))} />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.identificacion }}>
              <span>Identificación</span>
              <input value={form.identificacion} onChange={(event) => setForm((prev) => ({ ...prev, identificacion: event.target.value }))} />
            </label>

            <div className="cartera-registro__field cartera-registro__field--compact" ref={suggestionBoxRef} style={{ minWidth: FIELD_WIDTHS.nombre_tercero }}>
              <span>Tercero</span>
              <input
                value={form.nombre_tercero}
                onFocus={() => setShowSugerencias(true)}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, nombre_tercero: event.target.value }));
                  setShowSugerencias(true);
                }}
              />
              {showSugerencias && (form.nombre_tercero.trim().length >= 2 || sugerencias.length > 0) ? (
                <div className="cartera-registro__suggestions">
                  {loadingSugerencias ? <div className="cartera-registro__suggestion-empty">Buscando…</div> : null}
                  {!loadingSugerencias && sugerencias.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className="cartera-registro__suggestion"
                      onClick={() => {
                        setForm((prev) => ({ ...prev, nombre_tercero: item }));
                        setShowSugerencias(false);
                      }}
                    >
                      {item}
                    </button>
                  ))}
                  {!loadingSugerencias && sugerencias.length === 0 ? <div className="cartera-registro__suggestion-empty">Sin coincidencias. Se registrará como nuevo tercero.</div> : null}
                </div>
              ) : null}
            </div>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.numero_factura }}>
              <span>N° factura</span>
              <input ref={numeroFacturaRef} value={form.numero_factura} onChange={(event) => setForm((prev) => ({ ...prev, numero_factura: event.target.value }))} />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.detalle }}>
              <span>Detalle</span>
              <input value={form.detalle} onChange={(event) => setForm((prev) => ({ ...prev, detalle: event.target.value }))} />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.debito }}>
              <span>Débito</span>
              <input inputMode="numeric" value={formatMoneyInput(form.debito)} onChange={(event) => setForm((prev) => ({ ...prev, debito: parseMoneyInput(event.target.value) }))} />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.fecha_pago }}>
              <span>Fecha pago</span>
              <input type="date" disabled={form.estado !== "PAGADA"} value={form.fecha_pago} onChange={(event) => setForm((prev) => ({ ...prev, fecha_pago: event.target.value }))} />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.valor_pagado }}>
              <span>Valor pagado</span>
              <input
                inputMode="numeric"
                disabled={form.estado !== "PAGADA"}
                value={formatMoneyInput(form.valor_pagado)}
                onChange={(event) => setForm((prev) => ({ ...prev, valor_pagado: parseMoneyInput(event.target.value) }))}
              />
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.estado }}>
              <span>Estado</span>
              <select
                value={form.estado}
                onChange={(event) => {
                  const nextEstado = event.target.value as FacturaFormState["estado"];
                  setForm((prev) => ({
                    ...prev,
                    estado: nextEstado,
                    fecha_pago: nextEstado === "PAGADA" ? prev.fecha_pago : "",
                    valor_pagado: nextEstado === "PAGADA" ? (prev.valor_pagado || prev.debito) : ""
                  }));
                }}
              >
                <option value="PENDIENTE">PENDIENTE</option>
                <option value="PAGADA">PAGADA</option>
                <option value="ANULADA">ANULADA</option>
              </select>
            </label>

            <label className="cartera-registro__field cartera-registro__field--compact" style={{ minWidth: FIELD_WIDTHS.tipo }}>
              <span>Tipo</span>
              <select value={form.tipo} onChange={(event) => setForm((prev) => ({ ...prev, tipo: event.target.value as FacturaFormState["tipo"] }))}>
                {tipoOptions.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
              </select>
            </label>

            <div className="cartera-registro__actions cartera-registro__actions--inline">
              {editingKey ? (
                <button type="button" className="cartera-registro__btn cartera-registro__btn--danger" onClick={() => void deleteFactura()}>
                  <Trash2 size={14} /> Eliminar
                </button>
              ) : null}
              <button type="button" className="cartera-registro__btn cartera-registro__btn--secondary" onClick={() => resetForm(form.empresa)}>
                <Eraser size={14} /> Limpiar
              </button>
              <button type="button" className="cartera-registro__btn cartera-registro__btn--primary" disabled={loading} onClick={() => void saveFactura()}>
                {loading ? <LoaderCircle size={14} className="cartera-registro__spin" /> : <Plus size={14} />}
                {editingKey ? "Actualizar" : "Guardar"}
              </button>
            </div>
          </div>
        </div>
        ) : (
          <CarteraCapturaHoja
            defaultEmpresa={form.empresa}
            onBatchSaved={(savedRows, s) => {
              const parts = [`${s.created} creadas`, `${s.updated} actualizadas`];
              if (s.failed) parts.push(`${s.failed} con error`);
              onFacturasBatchSaved?.(savedRows, { title: `Captura por hoja: ${parts.join(" · ")}` });
            }}
            onAfterSave={refreshInventory}
          />
        )}

        {error ? <div className="cartera-registro__error">{error}</div> : null}
        {infoMsg ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginTop: "10px", padding: "10px 14px", borderRadius: "8px", background: "rgba(46,139,122,.08)", border: "1px solid rgba(46,139,122,.25)", fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "#2e8b7a" }}>
            <span>{infoMsg}</span>
            <button type="button" onClick={() => setInfoMsg("")} style={{ background: "transparent", border: "none", cursor: "pointer", color: "#2e8b7a", padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        ) : null}
        {pendingConfirm ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "10px", padding: "10px 14px", borderRadius: "8px", background: "rgba(245,158,11,.08)", border: "1px solid rgba(245,158,11,.3)", fontFamily: "Space Mono,monospace", fontSize: ".7rem", color: "#d97706" }}>
            <span style={{ flex: 1 }}>{pendingConfirm.msg}</span>
            <button type="button" onClick={pendingConfirm.onConfirm} style={{ background: "#d97706", border: "none", borderRadius: "5px", color: "#fff", padding: "4px 12px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", fontWeight: 700, cursor: "pointer" }}>Confirmar</button>
            <button type="button" onClick={() => setPendingConfirm(null)} style={{ background: "transparent", border: "1px solid #d97706", borderRadius: "5px", color: "#d97706", padding: "4px 12px", fontFamily: "Space Mono,monospace", fontSize: ".68rem", cursor: "pointer" }}>Cancelar</button>
          </div>
        ) : null}
      </section>

      <section className="module-card cartera-registro__table-card">
        <div className="cartera-registro__table-head">
          <div>
            <div className="cartera-registro__eyebrow">Inventario de facturas</div>
            <h3 className="cartera-registro__title">Facturas en base <span className="cartera-registro__count">{total.toLocaleString("es-CO")}</span></h3>
            <p className="cartera-registro__subtext">Doble clic en una fila para editarla aquí mismo · el lápiz abre el formulario completo.</p>
          </div>
          <button type="button" className="cartera-registro__link-btn" onClick={onGoToFacturacion}>Ver todas las facturas</button>
        </div>

        <div className="cartera-registro__filters">
          <div className="cartera-registro__search">
            <Search size={14} />
            <input disabled={inventoryLoading} value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Buscar por N° factura o tercero" />
          </div>
          <div className={inventoryLoading ? "cartera-registro__filter-disabled" : ""}>
            <CompanyFilter
              companies={["CMYM", "SYSO", "SANUM"]}
              value={filters.empresa}
              onChange={(next) => {
                if (inventoryLoading) return;
                setPage(1);
                setFilters((current) => ({ ...current, empresa: next as InventarioFilters["empresa"] }));
              }}
            />
          </div>
          <div className="cartera-registro__status-filter">
            {([
              ["PENDIENTE", "Pendientes"],
              ["PAGADA", "Pagadas"],
              ["ANULADA", "Anuladas"],
              ["ALL", "Todas"]
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                disabled={inventoryLoading}
                className={`cartera-registro__status-chip ${filters.estado === value ? "is-active" : ""}`}
                onClick={() => {
                  setPage(1);
                  setFilters((current) => ({ ...current, estado: value }));
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="cartera-registro__results">{pagedRows.length} visibles · {total.toLocaleString("es-CO")} coinciden</div>
        </div>

        {inventoryError ? <div className="cartera-registro__error">{inventoryError}</div> : null}

        <div className={`cartera-registro__table-shell ${inventoryLoading ? "is-loading" : ""}`}>
          {inventoryLoading ? (
            <div className="cartera-registro__table-overlay">
              <LoaderCircle size={18} className="cartera-registro__spin" />
            </div>
          ) : null}

          {pagedRows.length === 0 ? (
            <div className="cartera-registro__empty">Las facturas que coincidan con los filtros aparecerán aquí para revisión y edición rápida.</div>
          ) : (
            <div className="module-table-wrap">
              <table className="module-table cartera-registro__table">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>N° Factura</th>
                    <th>Fecha Elab.</th>
                    <th>Tercero</th>
                    <th>Detalle</th>
                    <th>Débito</th>
                    <th>Estado</th>
                    <th>Fecha Pago</th>
                    <th>Valor Pagado</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((item) => {
                    const isInline = inlineKey?.empresa === item.empresa && inlineKey?.numero_factura === item.numero_factura;
                    if (isInline && inlineForm) {
                      return (
                        <tr key={`${item.empresa}-${item.numero_factura}`} className="cartera-registro__edit-row" onKeyDown={handleInlineKeyDown}>
                          <td>
                            <select
                              className="cartera-registro__inline-select"
                              autoFocus={inlineFocus === "empresa"}
                              value={inlineForm.empresa}
                              onChange={(event) => {
                                const nextEmpresa = event.target.value as CarteraEmpresa;
                                patchInline({ empresa: nextEmpresa, tipo: normalizeTipoForEmpresa(nextEmpresa, inlineForm.tipo) });
                              }}
                            >
                              {CARTERA_EMPRESAS.map((empresa) => <option key={empresa} value={empresa}>{empresa}</option>)}
                            </select>
                          </td>
                          <td>
                            <input className="cartera-registro__inline-input" autoFocus={inlineFocus === "numero_factura"} value={inlineForm.numero_factura} onChange={(event) => patchInline({ numero_factura: event.target.value })} />
                          </td>
                          <td>
                            <input type="date" className="cartera-registro__inline-input" autoFocus={inlineFocus === "fecha_elaboracion"} value={inlineForm.fecha_elaboracion} onChange={(event) => patchInline({ fecha_elaboracion: event.target.value })} />
                          </td>
                          <td>
                            <input className="cartera-registro__inline-input" autoFocus={inlineFocus === "nombre_tercero"} value={inlineForm.nombre_tercero} onChange={(event) => patchInline({ nombre_tercero: event.target.value })} />
                          </td>
                          <td>
                            <input className="cartera-registro__inline-input" autoFocus={inlineFocus === "detalle"} value={inlineForm.detalle} onChange={(event) => patchInline({ detalle: event.target.value })} />
                          </td>
                          <td>
                            <input inputMode="numeric" className="cartera-registro__inline-input cartera-registro__inline-input--num" autoFocus={inlineFocus === "debito"} value={formatMoneyInput(inlineForm.debito)} onChange={(event) => patchInline({ debito: parseMoneyInput(event.target.value) })} />
                          </td>
                          <td>
                            <select
                              className="cartera-registro__inline-select"
                              autoFocus={inlineFocus === "estado"}
                              value={inlineForm.estado}
                              onChange={(event) => {
                                const nextEstado = event.target.value as FacturaFormState["estado"];
                                patchInline({
                                  estado: nextEstado,
                                  fecha_pago: nextEstado === "PAGADA" ? inlineForm.fecha_pago : "",
                                  valor_pagado: nextEstado === "PAGADA" ? (inlineForm.valor_pagado || inlineForm.debito) : ""
                                });
                              }}
                            >
                              <option value="PENDIENTE">PENDIENTE</option>
                              <option value="PAGADA">PAGADA</option>
                              <option value="ANULADA">ANULADA</option>
                            </select>
                          </td>
                          <td>
                            <input type="date" className="cartera-registro__inline-input" disabled={inlineForm.estado !== "PAGADA"} autoFocus={inlineFocus === "fecha_pago"} value={inlineForm.fecha_pago} onChange={(event) => patchInline({ fecha_pago: event.target.value })} />
                          </td>
                          <td>
                            <input inputMode="numeric" className="cartera-registro__inline-input cartera-registro__inline-input--num" disabled={inlineForm.estado !== "PAGADA"} autoFocus={inlineFocus === "valor_pagado"} value={formatMoneyInput(inlineForm.valor_pagado)} onChange={(event) => patchInline({ valor_pagado: parseMoneyInput(event.target.value) })} />
                          </td>
                          <td>
                            <div className="cartera-registro__row-actions">
                              <button type="button" className="cartera-registro__icon-btn cartera-registro__icon-btn--save" disabled={inlineSaving} onClick={() => void saveInlineEdit()} title="Guardar (Enter)">
                                {inlineSaving ? <LoaderCircle size={14} className="cartera-registro__spin" /> : <Check size={14} />}
                              </button>
                              <button type="button" className="cartera-registro__icon-btn" disabled={inlineSaving} onClick={cancelInlineEdit} title="Cancelar (Esc)">
                                <X size={14} />
                              </button>
                            </div>
                            {inlineError ? <div className="cartera-registro__inline-error">{inlineError}</div> : null}
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr
                        key={`${item.empresa}-${item.numero_factura}`}
                        className="cartera-registro__row"
                        onDoubleClick={(event) => {
                          const field = (event.target as HTMLElement).closest("td")?.getAttribute("data-field") ?? "nombre_tercero";
                          startInlineEdit(item, field);
                        }}
                      >
                        <td data-field="empresa"><CompanyBadge empresa={item.empresa} /></td>
                        <td data-field="numero_factura"><span className="cartera-registro__mono">{item.numero_factura}</span></td>
                        <td data-field="fecha_elaboracion"><span className="cartera-registro__mono">{item.fecha_elaboracion || "-"}</span></td>
                        <td data-field="nombre_tercero" title={item.nombre_tercero} className="cartera-registro__truncate">{item.nombre_tercero}</td>
                        <td data-field="detalle" title={item.detalle} className="cartera-registro__truncate">{item.detalle || "—"}</td>
                        <td data-field="debito"><span className="cartera-registro__mono">{formatCurrency(item.debito)}</span></td>
                        <td data-field="estado"><span className={`cartera-registro__status cartera-registro__status--${item.estado.toLowerCase()}`}>{item.estado}</span></td>
                        <td data-field="fecha_pago"><span className="cartera-registro__mono">{item.fecha_pago || "—"}</span></td>
                        <td data-field="valor_pagado"><span className="cartera-registro__mono">{item.valor_pagado ? formatCurrency(item.valor_pagado) : "—"}</span></td>
                        <td>
                          <div className="cartera-registro__row-actions" onDoubleClick={(event) => event.stopPropagation()}>
                            <button type="button" className="cartera-registro__icon-btn" title="Editar en formulario" onClick={() => loadFacturaIntoForm(item)}>
                              <Edit3 size={14} />
                            </button>
                            <button type="button" className="cartera-registro__icon-btn cartera-registro__icon-btn--danger" title="Eliminar" onClick={() => void deleteFactura({ empresa: item.empresa, numero_factura: item.numero_factura })}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="cartera-registro__pagination">
          <button type="button" className="cartera-registro__btn cartera-registro__btn--secondary" disabled={page <= 1 || inventoryLoading} onClick={() => setPage((current) => Math.max(1, current - 1))}>
            <ChevronLeft size={14} /> Anterior
          </button>
          <span className="cartera-registro__page-indicator">Página {page} de {totalPages}</span>
          <button type="button" className="cartera-registro__btn cartera-registro__btn--secondary" disabled={page >= totalPages || inventoryLoading} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
            Siguiente <ChevronRight size={14} />
          </button>
        </div>
      </section>
    </div>
  );
}

// =====================================================================
// Captura tipo hoja: entrada masiva estilo Excel (teclado + pegar + lote)
// =====================================================================

type SheetColType = "text" | "date" | "money" | "empresa" | "estado" | "tipo";
type SheetColumn = { key: keyof FacturaFormState; label: string; type: SheetColType; width: number };

const SHEET_COLUMNS: SheetColumn[] = [
  { key: "empresa", label: "Empresa", type: "empresa", width: 92 },
  { key: "fecha_elaboracion", label: "Fecha elab.", type: "date", width: 150 },
  { key: "codigo_contable", label: "Cód. contable", type: "text", width: 120 },
  { key: "identificacion", label: "Identificación", type: "text", width: 130 },
  { key: "nombre_tercero", label: "Tercero", type: "text", width: 220 },
  { key: "numero_factura", label: "N° factura", type: "text", width: 130 },
  { key: "detalle", label: "Detalle", type: "text", width: 170 },
  { key: "debito", label: "Débito", type: "money", width: 130 },
  { key: "estado", label: "Estado", type: "estado", width: 130 },
  { key: "fecha_pago", label: "Fecha pago", type: "date", width: 150 },
  { key: "valor_pagado", label: "Valor pagado", type: "money", width: 130 },
  { key: "tipo", label: "Tipo", type: "tipo", width: 100 }
];

const BLANK_SHEET_ROWS = 4;

type SheetRowStatus = "idle" | "ok" | "error";
type SheetRow = FacturaFormState & { _id: string; _status: SheetRowStatus; _msg: string };

let sheetRowCounter = 0;
function createSheetRow(empresa: CarteraEmpresa): SheetRow {
  sheetRowCounter += 1;
  return { ...createEmptyForm(empresa), _id: `sr${sheetRowCounter}`, _status: "idle", _msg: "" };
}

function parseAnyDate(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = value.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (match) {
    const [, day, month, yearRaw] = match;
    const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }
  return value;
}

function coerceSheetValue(column: SheetColumn, raw: string, empresa: CarteraEmpresa): string {
  const value = String(raw ?? "").trim();
  switch (column.type) {
    case "money":
      return parseMoneyInput(value);
    case "date":
      return parseAnyDate(value);
    case "empresa": {
      const up = value.toUpperCase();
      return (CARTERA_EMPRESAS as readonly string[]).includes(up) ? up : empresa;
    }
    case "estado": {
      const up = value.toUpperCase();
      if (up.startsWith("PAGAD") || up.startsWith("PAGÓ") || up === "PAGO") return "PAGADA";
      if (up.startsWith("ANULAD")) return "ANULADA";
      return "PENDIENTE";
    }
    case "tipo":
      return normalizeTipoForEmpresa(empresa, value);
    default:
      return value;
  }
}

function isSheetRowEmpty(row: SheetRow) {
  return (
    !row.numero_factura.trim() &&
    !row.nombre_tercero.trim() &&
    !row.debito.trim() &&
    !row.detalle.trim() &&
    !row.fecha_elaboracion.trim()
  );
}

function validateSheetRow(row: SheetRow): string {
  if (!row.numero_factura.trim()) return "Falta N° factura";
  if (!row.nombre_tercero.trim()) return "Falta tercero";
  if (!row.fecha_elaboracion.trim()) return "Falta fecha elab.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_elaboracion)) return "Fecha elab. inválida";
  if (!row.debito.trim() || Number(parseMoneyInput(row.debito)) <= 0) return "Débito debe ser > 0";
  if (row.estado === "PAGADA") {
    if (!row.fecha_pago.trim()) return "PAGADA requiere fecha de pago";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.fecha_pago)) return "Fecha de pago inválida";
  }
  return "";
}

type CapturaHojaProps = {
  defaultEmpresa: CarteraEmpresa;
  onBatchSaved: (rows: RecaudoRow[], summary: { created: number; updated: number; failed: number }) => void;
  onAfterSave: () => void;
};

function CarteraCapturaHoja({ defaultEmpresa, onBatchSaved, onAfterSave }: CapturaHojaProps) {
  const [rows, setRows] = useState<SheetRow[]>(() =>
    Array.from({ length: BLANK_SHEET_ROWS }, () => createSheetRow(defaultEmpresa))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const cellRefs = useRef<Map<string, HTMLInputElement | HTMLSelectElement | null>>(new Map());
  const [focusTarget, setFocusTarget] = useState<{ row: number; col: number } | null>(null);

  useEffect(() => {
    if (!focusTarget) return;
    const element = cellRefs.current.get(`${focusTarget.row}:${focusTarget.col}`);
    if (element) {
      element.focus();
      if (element instanceof HTMLInputElement && element.type !== "date") element.select();
    }
    setFocusTarget(null);
  }, [focusTarget, rows.length]);

  function patchCell(rowIdx: number, key: keyof FacturaFormState, value: string) {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIdx], _status: "idle", _msg: "" } as SheetRow;
      (row as Record<string, string>)[key] = value;
      if (key === "empresa") {
        row.tipo = normalizeTipoForEmpresa(value as CarteraEmpresa, row.tipo);
      }
      if (key === "estado") {
        if (value !== "PAGADA") {
          row.fecha_pago = "";
          row.valor_pagado = "";
        } else if (!row.valor_pagado) {
          row.valor_pagado = row.debito;
        }
      }
      next[rowIdx] = row;
      return next;
    });
  }

  function moveFocus(rowIdx: number, colIdx: number, deltaRow: number) {
    const targetRow = rowIdx + deltaRow;
    if (targetRow < 0) return;
    if (targetRow >= rows.length) {
      setRows((prev) => [...prev, createSheetRow(defaultEmpresa)]);
    }
    setFocusTarget({ row: targetRow, col: colIdx });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>, rowIdx: number, colIdx: number) {
    if (event.key === "Enter") {
      event.preventDefault();
      moveFocus(rowIdx, colIdx, event.shiftKey ? -1 : 1);
    }
  }

  // El pegado se maneja a nivel del contenedor (no por celda) para que funcione
  // sin importar si la celda activa es un input de texto, un date o un select
  // (los select no disparan onPaste). Se ubica la celda activa por data-row/col.
  function handleContainerPaste(event: ClipboardEvent<HTMLElement>) {
    const active = document.activeElement as HTMLElement | null;
    const rowAttr = active?.getAttribute("data-row");
    const colAttr = active?.getAttribute("data-col");
    if (rowAttr == null || colAttr == null) return;
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    applyPaste(text, Number(rowAttr), Number(colAttr));
  }

  function applyPaste(text: string, rowIdx: number, colIdx: number) {
    const matrix = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, index, all) => !(index === all.length - 1 && line === ""))
      .map((line) => line.split("\t"));

    setRows((prev) => {
      const next = [...prev];
      matrix.forEach((cells, rowOffset) => {
        const targetRowIdx = rowIdx + rowOffset;
        while (targetRowIdx >= next.length) next.push(createSheetRow(defaultEmpresa));
        const row: SheetRow = { ...next[targetRowIdx], _status: "idle", _msg: "" };
        cells.forEach((cellRaw, cellOffset) => {
          const targetColIdx = colIdx + cellOffset;
          if (targetColIdx >= SHEET_COLUMNS.length) return;
          const column = SHEET_COLUMNS[targetColIdx];
          (row as Record<string, string>)[column.key] = coerceSheetValue(column, cellRaw, row.empresa);
        });
        row.tipo = normalizeTipoForEmpresa(row.empresa, row.tipo);
        if (row.estado !== "PAGADA") {
          row.fecha_pago = "";
          row.valor_pagado = "";
        }
        next[targetRowIdx] = row;
      });
      return next;
    });
  }

  function addBlankRows(count = 3) {
    setRows((prev) => [...prev, ...Array.from({ length: count }, () => createSheetRow(defaultEmpresa))]);
  }

  function removeRow(rowIdx: number) {
    setRows((prev) => {
      const next = prev.filter((_, index) => index !== rowIdx);
      return next.length ? next : [createSheetRow(defaultEmpresa)];
    });
  }

  function clearAll() {
    setRows(Array.from({ length: BLANK_SHEET_ROWS }, () => createSheetRow(defaultEmpresa)));
    setError("");
    setSummary("");
  }

  async function saveAll() {
    const indexed = rows.map((row, idx) => ({ row, idx })).filter(({ row }) => !isSheetRowEmpty(row));
    if (indexed.length === 0) {
      setError("No hay filas con datos para guardar.");
      return;
    }
    setSaving(true);
    setError("");
    setSummary("");

    const updated = [...rows];
    const savedRecaudos: RecaudoRow[] = [];
    let created = 0;
    let updatedCount = 0;
    let failed = 0;

    for (const { row, idx } of indexed) {
      const invalid = validateSheetRow(row);
      if (invalid) {
        updated[idx] = { ...updated[idx], _status: "error", _msg: invalid };
        failed += 1;
        continue;
      }

      try {
        const normalized = normalizeFacturaInput({
          ...row,
          debito: Number(parseMoneyInput(row.debito)),
          valor_pagado: row.valor_pagado ? Number(parseMoneyInput(row.valor_pagado)) : 0
        });
        const payload = {
          ...normalized.payload,
          numero_factura_original: normalized.payload.numero_factura,
          empresa_original: normalized.payload.empresa
        };

        let response = await fetch("/api/cartera/facturas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        let data = await response.json().catch(() => ({}));
        let wasUpdate = false;

        if (response.status === 409) {
          response = await fetch("/api/cartera/facturas", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          data = await response.json().catch(() => ({}));
          wasUpdate = true;
        }

        if (response.status === 202 && data?.pending_approval) {
          updated[idx] = { ...updated[idx], _status: "ok", _msg: "Enviada a aprobación" };
          created += 1;
          continue;
        }

        if (!response.ok) throw new Error(data?.detail || "No fue posible guardar");

        const factura = normalizeFacturaRow(data.factura as Record<string, unknown>);
        savedRecaudos.push(facturaToRecaudoRow(factura));
        updated[idx] = { ...updated[idx], _status: "ok", _msg: wasUpdate ? "Actualizada ✓" : "Creada ✓" };
        if (wasUpdate) updatedCount += 1;
        else created += 1;
      } catch (saveError) {
        updated[idx] = {
          ...updated[idx],
          _status: "error",
          _msg: saveError instanceof Error ? saveError.message : "Error al guardar"
        };
        failed += 1;
      }
    }

    // Quitar las que entraron bien; conservar las que fallaron para corregirlas.
    const remaining = updated.filter((row, idx) => {
      const processed = indexed.some((item) => item.idx === idx);
      return !processed || row._status === "error";
    });
    const blanksNeeded = Math.max(0, BLANK_SHEET_ROWS - remaining.length);
    const finalRows = [
      ...remaining,
      ...Array.from({ length: blanksNeeded }, () => createSheetRow(defaultEmpresa))
    ];
    setRows(finalRows.length ? finalRows : Array.from({ length: BLANK_SHEET_ROWS }, () => createSheetRow(defaultEmpresa)));

    setSaving(false);
    setSummary(`Creadas: ${created} · Actualizadas: ${updatedCount} · Con error: ${failed}`);
    if (failed > 0) setError("Algunas filas tienen errores (en rojo). Corrígelas y vuelve a guardar.");
    if (savedRecaudos.length) onBatchSaved(savedRecaudos, { created, updated: updatedCount, failed });
    onAfterSave();
  }

  const nonEmptyCount = rows.filter((row) => !isSheetRowEmpty(row)).length;

  return (
    <div className="cartera-hoja">
      <p className="cartera-hoja__hint">
        Escribe varias facturas seguidas. <strong>Enter</strong> baja a la fila siguiente · <strong>Tab</strong> pasa de columna ·
        puedes <strong>copiar un rango en Excel y pegarlo (Ctrl+V)</strong> sobre cualquier celda. Las filas vacías se ignoran.
      </p>

      <div className="cartera-hoja__scroll" onPaste={handleContainerPaste}>
        <table className="cartera-hoja__table">
          <thead>
            <tr>
              <th className="cartera-hoja__rownum">#</th>
              {SHEET_COLUMNS.map((column) => (
                <th key={column.key} style={{ minWidth: column.width }}>{column.label}</th>
              ))}
              <th className="cartera-hoja__status-col">Estado</th>
              <th aria-label="acciones" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const tipoOptions = getTiposForEmpresa(row.empresa);
              return (
                <tr key={row._id} className={`cartera-hoja__row cartera-hoja__row--${row._status}`}>
                  <td className="cartera-hoja__rownum">{rowIdx + 1}</td>
                  {SHEET_COLUMNS.map((column, colIdx) => {
                    const refKey = `${rowIdx}:${colIdx}`;
                    const setRef = (element: HTMLInputElement | HTMLSelectElement | null) => {
                      cellRefs.current.set(refKey, element);
                    };
                    const common = {
                      ref: setRef as never,
                      "data-row": rowIdx,
                      "data-col": colIdx,
                      onKeyDown: (event: KeyboardEvent<HTMLElement>) => handleKeyDown(event, rowIdx, colIdx),
                      className: "cartera-hoja__cell-input"
                    };

                    if (column.type === "empresa") {
                      return (
                        <td key={column.key}>
                          <select {...common} value={row.empresa} onChange={(event) => patchCell(rowIdx, "empresa", event.target.value)}>
                            {CARTERA_EMPRESAS.map((empresa) => <option key={empresa} value={empresa}>{empresa}</option>)}
                          </select>
                        </td>
                      );
                    }
                    if (column.type === "estado") {
                      return (
                        <td key={column.key}>
                          <select {...common} value={row.estado} onChange={(event) => patchCell(rowIdx, "estado", event.target.value)}>
                            <option value="PENDIENTE">PENDIENTE</option>
                            <option value="PAGADA">PAGADA</option>
                            <option value="ANULADA">ANULADA</option>
                          </select>
                        </td>
                      );
                    }
                    if (column.type === "tipo") {
                      return (
                        <td key={column.key}>
                          <select {...common} value={row.tipo} onChange={(event) => patchCell(rowIdx, "tipo", event.target.value)}>
                            {tipoOptions.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                          </select>
                        </td>
                      );
                    }
                    if (column.type === "date") {
                      const disabled = column.key === "fecha_pago" && row.estado !== "PAGADA";
                      return (
                        <td key={column.key}>
                          <input {...common} type="date" disabled={disabled} value={row[column.key]} onChange={(event) => patchCell(rowIdx, column.key, event.target.value)} />
                        </td>
                      );
                    }
                    if (column.type === "money") {
                      const disabled = column.key === "valor_pagado" && row.estado !== "PAGADA";
                      return (
                        <td key={column.key}>
                          <input
                            {...common}
                            inputMode="numeric"
                            disabled={disabled}
                            className="cartera-hoja__cell-input cartera-hoja__cell-input--num"
                            value={formatMoneyInput(row[column.key])}
                            onChange={(event) => patchCell(rowIdx, column.key, parseMoneyInput(event.target.value))}
                          />
                        </td>
                      );
                    }
                    return (
                      <td key={column.key}>
                        <input {...common} value={row[column.key]} onChange={(event) => patchCell(rowIdx, column.key, event.target.value)} />
                      </td>
                    );
                  })}
                  <td className="cartera-hoja__status-col">
                    {row._status === "error" ? <span className="cartera-hoja__status-msg cartera-hoja__status-msg--error">{row._msg}</span> : null}
                    {row._status === "ok" ? <span className="cartera-hoja__status-msg cartera-hoja__status-msg--ok">{row._msg}</span> : null}
                  </td>
                  <td>
                    <button type="button" className="cartera-registro__icon-btn cartera-registro__icon-btn--danger" title="Quitar fila" onClick={() => removeRow(rowIdx)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="cartera-hoja__footer">
        <div className="cartera-hoja__footer-left">
          <button type="button" className="cartera-registro__btn cartera-registro__btn--secondary" onClick={() => addBlankRows()}>
            <Plus size={14} /> Agregar filas
          </button>
          <button type="button" className="cartera-registro__btn cartera-registro__btn--secondary" onClick={clearAll}>
            <Eraser size={14} /> Limpiar
          </button>
          {summary ? <span className="cartera-hoja__summary">{summary}</span> : null}
        </div>
        <button type="button" className="cartera-registro__btn cartera-registro__btn--primary" disabled={saving} onClick={() => void saveAll()}>
          {saving ? <LoaderCircle size={14} className="cartera-registro__spin" /> : <Save size={14} />}
          {saving ? "Guardando…" : `Guardar ${nonEmptyCount || ""} ${nonEmptyCount === 1 ? "factura" : "facturas"}`.trim()}
        </button>
      </div>

      {error ? <div className="cartera-registro__error">{error}</div> : null}
    </div>
  );
}
