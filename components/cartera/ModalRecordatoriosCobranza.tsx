import { LoaderCircle, MailPlus, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { MorosoPorTerceroItem } from "@/lib/cartera-recordatorios";
import { formatCurrencyCopDetailed } from "@/lib/cartera-recordatorios";
import {
  CARTERA_SEGUIMIENTO_RESULTADO_LABEL,
  CARTERA_SEGUIMIENTO_TIPO_LABEL,
  type CarteraSeguimientoResultado,
  type CarteraSeguimientoTipo,
  formatSeguimientoDate,
  formatSeguimientoTimestamp
} from "@/lib/cartera-seguimiento";
import { CompanyBadge } from "@/components/ui/company-badge";

type EmpresaFilter = "TODAS" | "CMYM" | "SYSO" | "SANUM";

type ModalRecordatoriosCobranzaProps = {
  open: boolean;
  refreshKey?: number;
  onClose: () => void;
  onSelectTercero: (item: MorosoPorTerceroItem) => void;
};

type SeguimientoBadge = {
  label: string;
  style: React.CSSProperties;
  secondary: string | null;
};

function parseDateOnly(value: string | null | undefined) {
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

function getSeguimientoBadge(item: MorosoPorTerceroItem): SeguimientoBadge {
  if (!item.ultimo_seguimiento_at) {
    return {
      label: "Sin gestión",
      style: {
        background: "rgba(204,0,0,.10)",
        color: "#cc0000"
      },
      secondary: null
    };
  }

  const today = getTodayInBogota();
  const nextDate = parseDateOnly(item.proxima_gestion_fecha);
  const label = item.ultimo_seguimiento_resultado
    ? CARTERA_SEGUIMIENTO_RESULTADO_LABEL[item.ultimo_seguimiento_resultado as CarteraSeguimientoResultado]
    : item.ultimo_seguimiento_tipo
      ? CARTERA_SEGUIMIENTO_TIPO_LABEL[item.ultimo_seguimiento_tipo as CarteraSeguimientoTipo]
      : "Gestión registrada";

  if (nextDate && nextDate < today) {
    return {
      label,
      style: {
        background: "rgba(204,0,0,.12)",
        color: "#991b1b"
      },
      secondary: "Seguimiento vencido"
    };
  }

  if (nextDate && nextDate >= today) {
    return {
      label,
      style: {
        background: "rgba(245,158,11,.14)",
        color: "#b45309"
      },
      secondary: `Próximo ${formatSeguimientoDate(item.proxima_gestion_fecha ?? "")}`
    };
  }

  return {
    label,
    style: {
      background: "rgba(46,139,122,.12)",
      color: "#166534"
    },
    secondary: null
  };
}

export function ModalRecordatoriosCobranza({
  open,
  refreshKey = 0,
  onClose,
  onSelectTercero
}: ModalRecordatoriosCobranzaProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<MorosoPorTerceroItem[]>([]);
  const [empresa, setEmpresa] = useState<EmpresaFilter>("TODAS");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError("");

    fetch("/api/cartera/morosos-por-tercero", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as MorosoPorTerceroItem[] | { detail?: string };
        if (!response.ok) {
          throw new Error(Array.isArray(data) ? "No fue posible cargar los morosos" : (data.detail ?? "No fue posible cargar los morosos"));
        }
        return data as MorosoPorTerceroItem[];
      })
      .then((data) => {
        if (!cancelled) {
          setItems(data);
        }
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        const detail = fetchError instanceof Error ? fetchError.message : "No fue posible cargar los morosos";
        setError(detail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, refreshKey]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (empresa !== "TODAS" && item.empresa !== empresa) return false;
      if (query && !item.nombre_tercero.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [empresa, items, search]);

  if (!open) return null;

  return (
    <div className={`module-modal-backdrop ${open ? "open" : ""} cartera-recordatorios-backdrop`} onClick={onClose}>
      <div
        className="module-modal cartera-recordatorios-modal"
        style={{ maxWidth: 960, position: "relative" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recordatorios-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="cartera-recordatorios-close" onClick={onClose} aria-label="Cerrar" title="Cerrar">
          <X size={18} strokeWidth={2.25} />
        </button>
        <div className="module-modal-head" style={{ borderTop: "4px solid #cc0000" }}>
          <div>
            <div className="module-kicker">Cobranza por tercero</div>
            <h3 className="module-section-title" id="recordatorios-title">Generar recordatorios</h3>
            <p style={{ marginTop: 8, fontSize: ".82rem", color: "var(--module-muted)" }}>
              Terceros con facturas pendientes de más de 30 días.
            </p>
          </div>
        </div>

        <div className="module-modal-body" style={{ display: "grid", gap: 18 }}>
          <div className="cartera-recordatorios-toolbar">
            <div className="cartera-recordatorios-company-filter">
              {(["TODAS", "CMYM", "SYSO", "SANUM"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`cartera-recordatorios-filter-btn ${empresa === item ? "is-active" : ""}`}
                  onClick={() => setEmpresa(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div style={{ position: "relative", minWidth: 240, flex: "1 1 260px" }}>
              <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--module-muted)" }} />
              <input
                className="module-form-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar tercero"
                style={{ width: "100%", paddingLeft: 38 }}
              />
            </div>
          </div>

          {loading ? (
            <div style={{ display: "grid", placeItems: "center", minHeight: 220, color: "var(--module-muted)", gap: 10 }}>
              <LoaderCircle size={22} className="animate-spin" />
              <span style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: ".72rem" }}>Consultando morosos...</span>
            </div>
          ) : error ? (
            <div style={{ border: "1px solid rgba(204,0,0,.16)", background: "rgba(204,0,0,.06)", color: "#991b1b", borderRadius: 12, padding: 16 }}>
              {error}
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ border: "1px dashed var(--module-border)", borderRadius: 14, padding: 28, textAlign: "center", color: "var(--module-muted)" }}>
              No hay terceros morosos con esos filtros.
            </div>
          ) : (
            <div className="cartera-recordatorios-list">
              {filtered.map((item) => {
                const badge = getSeguimientoBadge(item);

                return (
                  <article key={`${item.empresa}-${item.nombre_tercero}`} className="cartera-recordatorios-card">
                    <div style={{ display: "grid", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <CompanyBadge empresa={item.empresa} />
                        <h4 style={{ margin: 0, fontSize: ".95rem", color: "var(--module-text)" }}>{item.nombre_tercero}</h4>
                        <span
                          style={{
                            ...badge.style,
                            display: "inline-flex",
                            alignItems: "center",
                            borderRadius: 999,
                            padding: "4px 10px",
                            fontSize: ".72rem",
                            fontFamily: "var(--font-space-mono), monospace",
                            fontWeight: 700
                          }}
                        >
                          {badge.label}
                        </span>
                        {badge.secondary ? (
                          <span
                            style={{
                              fontSize: ".72rem",
                              fontFamily: "var(--font-space-mono), monospace",
                              color: badge.secondary === "Seguimiento vencido" ? "#991b1b" : "#b45309"
                            }}
                          >
                            {badge.secondary}
                          </span>
                        ) : null}
                      </div>
                      <div className="cartera-recordatorios-meta">
                        <span><strong>{item.cantidad_facturas}</strong> facturas vencidas</span>
                        <span><strong>{formatCurrencyCopDetailed(item.total_adeudado)}</strong> adeudado</span>
                        <span><strong>{item.dias_mora_max}</strong> días de mora</span>
                      </div>
                      <div className="cartera-recordatorios-meta">
                        <span><strong>Seguimiento:</strong> {item.ultimo_seguimiento_at ? formatSeguimientoTimestamp(item.ultimo_seguimiento_at) : "Sin gestión"}</span>
                        <span><strong>Próximo:</strong> {item.proxima_gestion_fecha ? formatSeguimientoDate(item.proxima_gestion_fecha) : "Sin fecha"}</span>
                      </div>
                    </div>

                    <button type="button" className="module-primary-btn" onClick={() => onSelectTercero(item)}>
                      <MailPlus size={15} />
                      Generar correo
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
