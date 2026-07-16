import { Copy, LoaderCircle, Mail, Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { MorosoPorTerceroItem, RecordatorioDetalleResponse } from "@/lib/cartera-recordatorios";
import { formatCurrencyCopDetailed } from "@/lib/cartera-recordatorios";
import {
  CARTERA_SEGUIMIENTO_RESULTADOS,
  CARTERA_SEGUIMIENTO_RESULTADO_LABEL,
  CARTERA_SEGUIMIENTO_TIPOS,
  CARTERA_SEGUIMIENTO_TIPO_LABEL,
  type CarteraSeguimientoItem,
  type CarteraSeguimientoResultado,
  type CarteraSeguimientoTipo,
  formatSeguimientoDate,
  formatSeguimientoTimestamp
} from "@/lib/cartera-seguimiento";
import { CompanyBadge } from "@/components/ui/company-badge";

type ModalGenerarCorreoProps = {
  target: MorosoPorTerceroItem | null;
  open: boolean;
  onBack: () => void;
  onSeguimientoSaved?: () => void;
};

const inputStyle = {
  width: "100%",
  border: "1px solid var(--module-border)",
  background: "var(--module-surface-2)",
  color: "var(--module-text)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: "0.9rem",
  outline: "none"
} satisfies React.CSSProperties;

type SeguimientoFormState = {
  tipo_gestion: CarteraSeguimientoTipo;
  resultado: CarteraSeguimientoResultado;
  observacion: string;
  proxima_fecha: string;
};

const DEFAULT_FORM: SeguimientoFormState = {
  tipo_gestion: "correo_manual",
  resultado: "correo_enviado",
  observacion: "",
  proxima_fecha: ""
};

export function ModalGenerarCorreo({ target, open, onBack, onSeguimientoSaved }: ModalGenerarCorreoProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [payload, setPayload] = useState<RecordatorioDetalleResponse | null>(null);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [htmlBody, setHtmlBody] = useState("");
  const [copied, setCopied] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyItems, setHistoryItems] = useState<CarteraSeguimientoItem[]>([]);
  const [seguimientoForm, setSeguimientoForm] = useState<SeguimientoFormState>(DEFAULT_FORM);
  const [savingSeguimiento, setSavingSeguimiento] = useState(false);
  const [seguimientoError, setSeguimientoError] = useState("");
  const [seguimientoSuccess, setSeguimientoSuccess] = useState("");

  useEffect(() => {
    if (!open || !target) return;

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError("");
    setPayload(null);
    setCopied(false);
    setHistoryLoading(true);
    setHistoryError("");
    setHistoryItems([]);
    setSeguimientoForm(DEFAULT_FORM);
    setSeguimientoError("");
    setSeguimientoSuccess("");

    const params = new URLSearchParams({
      tercero: target.nombre_tercero,
      empresa: target.empresa
    });

    const detailPromise = fetch(`/api/cartera/recordatorio?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as RecordatorioDetalleResponse | { detail?: string };
        if (!response.ok) {
          throw new Error("detail" in data ? (data.detail ?? "No fue posible generar el correo") : "No fue posible generar el correo");
        }
        return data as RecordatorioDetalleResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setPayload(data);
        setTo(data.email_destino ?? "");
        setSubject(data.asunto);
        setBody(data.cuerpo);
        setHtmlBody(data.cuerpo_html);
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        const detail = fetchError instanceof Error ? fetchError.message : "No fue posible generar el correo";
        setError(detail);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const historyPromise = fetch(`/api/cartera/seguimientos?${params.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as CarteraSeguimientoItem[] | { detail?: string };
        if (!response.ok) {
          throw new Error(Array.isArray(data) ? "No fue posible cargar el historial" : (data.detail ?? "No fue posible cargar el historial"));
        }
        return data as CarteraSeguimientoItem[];
      })
      .then((data) => {
        if (!cancelled) {
          setHistoryItems(data);
        }
      })
      .catch((fetchError: unknown) => {
        if (cancelled) return;
        const detail = fetchError instanceof Error ? fetchError.message : "No fue posible cargar el historial";
        setHistoryError(detail);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    void Promise.allSettled([detailPromise, historyPromise]);

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [open, target]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  useEffect(() => {
    if (!seguimientoSuccess) return;
    const timeout = window.setTimeout(() => setSeguimientoSuccess(""), 2500);
    return () => window.clearTimeout(timeout);
  }, [seguimientoSuccess]);

  const previewText = useMemo(() => {
    if (!subject && !body) return "";
    return `Asunto: ${subject}\n\n${body}`;
  }, [subject, body]);

  const previewHtml = useMemo(() => {
    if (!subject && !body) return "";

    const escapedSubject = subject
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");

    const bodyHtml =
      payload && body === payload.cuerpo_texto
        ? htmlBody
        : `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;white-space:pre-wrap;">${body
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\n", "<br>")}</div>`;

    return [
      '<div style="font-family:Arial,sans-serif;font-size:14px;color:#111827;">',
      `<p style="margin:0 0 16px 0;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;"><strong>Asunto:</strong> ${escapedSubject}</p>`,
      bodyHtml,
      "</div>"
    ].join("");
  }, [body, htmlBody, payload, subject]);

  async function handleCopy() {
    if (!previewText) return;
    try {
      if (typeof navigator.clipboard.write === "function" && typeof ClipboardItem !== "undefined") {
        const item = new ClipboardItem({
          "text/plain": new Blob([previewText], { type: "text/plain" }),
          "text/html": new Blob([previewHtml], { type: "text/html" })
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(previewText);
      }
      setCopied(true);
    } catch {
      setError("No fue posible copiar al portapapeles.");
    }
  }

  function handleMailto() {
    const destination = to.trim();
    const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    const mailto = `mailto:${destination}?${query}`;
    window.location.href = mailto;
  }

  async function handleSaveSeguimiento() {
    if (!target) return;

    setSavingSeguimiento(true);
    setSeguimientoError("");
    setSeguimientoSuccess("");

    try {
      const response = await fetch("/api/cartera/seguimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tercero: target.nombre_tercero,
          empresa: target.empresa,
          ...seguimientoForm,
          proxima_fecha: seguimientoForm.proxima_fecha || null
        })
      });

      const data = (await response.json()) as { ok?: boolean; seguimiento?: CarteraSeguimientoItem; detail?: string };
      if (!response.ok || !data.seguimiento) {
        throw new Error(data.detail ?? "No fue posible registrar el seguimiento");
      }

      setHistoryItems((current) => [data.seguimiento as CarteraSeguimientoItem, ...current]);
      setSeguimientoForm(DEFAULT_FORM);
      setSeguimientoSuccess("Seguimiento registrado.");
      onSeguimientoSaved?.();
    } catch (saveError: unknown) {
      setSeguimientoError(saveError instanceof Error ? saveError.message : "No fue posible registrar el seguimiento");
    } finally {
      setSavingSeguimiento(false);
    }
  }

  if (!open || !target) return null;

  return (
    <div className={`module-modal-backdrop ${open ? "open" : ""} cartera-recordatorios-backdrop`} onClick={onBack}>
      <div
        className="module-modal cartera-recordatorios-modal cartera-recordatorios-modal--mail"
        style={{ maxWidth: 920, position: "relative" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recordatorio-mail-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="cartera-recordatorios-close" onClick={onBack} aria-label="Cerrar" title="Cerrar">
          <X size={18} strokeWidth={2.25} />
        </button>
        <div className="module-modal-head" style={{ borderTop: "4px solid #cc0000" }}>
          <div>
            <div className="module-kicker">Recordatorio de cobranza</div>
            <h3 className="module-section-title" id="recordatorio-mail-title" style={{ marginBottom: 8 }}>
              Generar correo
            </h3>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <CompanyBadge empresa={target.empresa} />
              <span style={{ fontSize: ".84rem", color: "var(--module-text)" }}>{target.nombre_tercero}</span>
            </div>
          </div>
        </div>

        <div className="module-modal-body">
          {loading ? (
            <div style={{ display: "grid", placeItems: "center", minHeight: 260, color: "var(--module-muted)", gap: 10 }}>
              <LoaderCircle size={22} className="animate-spin" />
              <span style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: ".72rem" }}>Generando correo...</span>
            </div>
          ) : error ? (
            <div style={{ border: "1px solid rgba(204,0,0,.16)", background: "rgba(204,0,0,.06)", color: "#991b1b", borderRadius: 12, padding: 16 }}>
              {error}
            </div>
          ) : payload ? (
            <div style={{ display: "grid", gap: 18 }}>
              <div className="cartera-recordatorios-summary">
                <div className="cartera-recordatorios-summary__item">
                  <span className="cartera-recordatorios-summary__label">Facturas</span>
                  <strong>{payload.facturas.length}</strong>
                </div>
                <div className="cartera-recordatorios-summary__item">
                  <span className="cartera-recordatorios-summary__label">Total cartera</span>
                  <strong>{formatCurrencyCopDetailed(payload.total)}</strong>
                </div>
                <div className="cartera-recordatorios-summary__item">
                  <span className="cartera-recordatorios-summary__label">De</span>
                  <strong>{payload.email_remitente}</strong>
                </div>
              </div>

              <div className="module-form-grid cartera-recordatorios-form">
                <div className="module-form-field full">
                  <label htmlFor="recordatorio-to">Para:</label>
                  <input
                    id="recordatorio-to"
                    className="module-form-input"
                    style={inputStyle}
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                    placeholder="Email del destinatario"
                  />
                </div>

                <div className="module-form-field full">
                  <label htmlFor="recordatorio-from">De:</label>
                  <input
                    id="recordatorio-from"
                    className="module-form-input"
                    style={{ ...inputStyle, color: "var(--module-muted)" }}
                    value={payload.email_remitente}
                    readOnly
                  />
                </div>

                <div className="module-form-field full">
                  <label htmlFor="recordatorio-subject">Asunto:</label>
                  <input
                    id="recordatorio-subject"
                    className="module-form-input"
                    style={inputStyle}
                    value={subject}
                    onChange={(event) => setSubject(event.target.value)}
                  />
                </div>

                <div className="module-form-field full">
                  <label htmlFor="recordatorio-body">Cuerpo:</label>
                  <textarea
                    id="recordatorio-body"
                    className="module-form-textarea"
                    style={{ ...inputStyle, minHeight: 340, resize: "vertical", whiteSpace: "pre", fontFamily: "var(--font-space-mono), monospace", fontSize: ".8rem", lineHeight: 1.55 }}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                  />
                </div>
              </div>

              <section style={{ border: "1px solid var(--module-border)", borderRadius: 14, padding: 16, display: "grid", gap: 14 }}>
                <div>
                  <div className="module-kicker" style={{ marginBottom: 6 }}>Seguimiento</div>
                  <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--module-text)" }}>Registrar gestión manual</h4>
                  <p style={{ margin: "6px 0 0 0", fontSize: ".82rem", color: "var(--module-muted)" }}>
                    Usa este bloque cuando ya copiaste o enviaste el correo por fuera del sistema.
                  </p>
                </div>

                <div className="module-form-grid">
                  <div className="module-form-field">
                    <label htmlFor="seguimiento-tipo">Tipo de gestión:</label>
                    <select
                      id="seguimiento-tipo"
                      className="module-form-input"
                      style={inputStyle}
                      value={seguimientoForm.tipo_gestion}
                      onChange={(event) => setSeguimientoForm((current) => ({ ...current, tipo_gestion: event.target.value as CarteraSeguimientoTipo }))}
                    >
                      {CARTERA_SEGUIMIENTO_TIPOS.map((item) => (
                        <option key={item} value={item}>{CARTERA_SEGUIMIENTO_TIPO_LABEL[item]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="module-form-field">
                    <label htmlFor="seguimiento-resultado">Resultado:</label>
                    <select
                      id="seguimiento-resultado"
                      className="module-form-input"
                      style={inputStyle}
                      value={seguimientoForm.resultado}
                      onChange={(event) => setSeguimientoForm((current) => ({ ...current, resultado: event.target.value as CarteraSeguimientoResultado }))}
                    >
                      {CARTERA_SEGUIMIENTO_RESULTADOS.map((item) => (
                        <option key={item} value={item}>{CARTERA_SEGUIMIENTO_RESULTADO_LABEL[item]}</option>
                      ))}
                    </select>
                  </div>

                  <div className="module-form-field">
                    <label htmlFor="seguimiento-proxima">Próxima fecha:</label>
                    <input
                      id="seguimiento-proxima"
                      type="date"
                      className="module-form-input"
                      style={inputStyle}
                      value={seguimientoForm.proxima_fecha}
                      onChange={(event) => setSeguimientoForm((current) => ({ ...current, proxima_fecha: event.target.value }))}
                    />
                  </div>

                  <div className="module-form-field full">
                    <label htmlFor="seguimiento-observacion">Observación:</label>
                    <textarea
                      id="seguimiento-observacion"
                      className="module-form-textarea"
                      style={{ ...inputStyle, minHeight: 96, resize: "vertical" }}
                      value={seguimientoForm.observacion}
                      onChange={(event) => setSeguimientoForm((current) => ({ ...current, observacion: event.target.value }))}
                      placeholder="Ejemplo: correo enviado y quedo pendiente confirmacion de pago para el viernes."
                    />
                  </div>
                </div>

                {seguimientoError ? (
                  <div style={{ border: "1px solid rgba(204,0,0,.16)", background: "rgba(204,0,0,.06)", color: "#991b1b", borderRadius: 12, padding: 12 }}>
                    {seguimientoError}
                  </div>
                ) : null}
                {seguimientoSuccess ? (
                  <div style={{ border: "1px solid rgba(46,139,122,.18)", background: "rgba(46,139,122,.08)", color: "#166534", borderRadius: 12, padding: 12 }}>
                    {seguimientoSuccess}
                  </div>
                ) : null}

                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" className="module-primary-btn" onClick={() => void handleSaveSeguimiento()} disabled={savingSeguimiento}>
                    {savingSeguimiento ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
                    {savingSeguimiento ? "Guardando..." : "Registrar gestión"}
                  </button>
                </div>
              </section>

              <section style={{ border: "1px solid var(--module-border)", borderRadius: 14, padding: 16, display: "grid", gap: 12 }}>
                <div>
                  <div className="module-kicker" style={{ marginBottom: 6 }}>Historial</div>
                  <h4 style={{ margin: 0, fontSize: "1rem", color: "var(--module-text)" }}>Seguimientos registrados</h4>
                </div>

                {historyLoading ? (
                  <div style={{ display: "grid", placeItems: "center", minHeight: 120, color: "var(--module-muted)", gap: 8 }}>
                    <LoaderCircle size={18} className="animate-spin" />
                    <span style={{ fontSize: ".8rem" }}>Cargando historial...</span>
                  </div>
                ) : historyError ? (
                  <div style={{ border: "1px solid rgba(204,0,0,.16)", background: "rgba(204,0,0,.06)", color: "#991b1b", borderRadius: 12, padding: 12 }}>
                    {historyError}
                  </div>
                ) : historyItems.length === 0 ? (
                  <div style={{ border: "1px dashed var(--module-border)", borderRadius: 12, padding: 16, color: "var(--module-muted)" }}>
                    Todavía no hay gestión registrada para este tercero.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 10 }}>
                    {historyItems.map((item) => (
                      <article key={item.id} style={{ border: "1px solid var(--module-border)", borderRadius: 12, padding: 12, background: "var(--module-surface-2)", display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: ".72rem", padding: "3px 8px", borderRadius: 999, background: "rgba(204,0,0,.08)", color: "#cc0000" }}>
                              {CARTERA_SEGUIMIENTO_TIPO_LABEL[item.tipo_gestion]}
                            </span>
                            <span style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: ".72rem", padding: "3px 8px", borderRadius: 999, background: "rgba(0,119,200,.08)", color: "#0077c8" }}>
                              {CARTERA_SEGUIMIENTO_RESULTADO_LABEL[item.resultado]}
                            </span>
                          </div>
                          <span style={{ fontSize: ".78rem", color: "var(--module-muted)" }}>{formatSeguimientoTimestamp(item.created_at)}</span>
                        </div>
                        <div style={{ fontSize: ".82rem", color: "var(--module-text)" }}>
                          {item.observacion || "Sin observación adicional."}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: ".78rem", color: "var(--module-muted)" }}>
                          <span>Registró: {item.actor_nombre || item.actor_usuario || "Usuario"}</span>
                          <span>Próximo: {item.proxima_fecha ? formatSeguimientoDate(item.proxima_fecha) : "Sin fecha"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          ) : null}
        </div>

        <div className="module-modal-actions cartera-recordatorios-actions">
          <button type="button" className="module-secondary-btn" onClick={handleCopy} disabled={loading || !payload}>
            <Copy size={15} />
            {copied ? "Copiado ✓" : "Copiar al portapapeles"}
          </button>
          <button type="button" className="module-primary-btn" onClick={handleMailto} disabled={loading || !payload}>
            <Mail size={15} />
            Abrir en correo
          </button>
        </div>
      </div>
    </div>
  );
}
