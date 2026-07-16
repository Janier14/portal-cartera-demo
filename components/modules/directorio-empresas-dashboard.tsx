"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { FileText, Mail, Search, User, Phone, Pencil, Trash2, Building, Hash, Briefcase } from "lucide-react";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { EmptyState, KpiCard } from "@/components/ui/dashboard-primitives";

type EmpresaCode = "SYSO" | "SANUM";

type EmpresaContacto = {
  id: number;
  empresa: EmpresaCode;
  nit: string;
  razon_social: string;
  nombre_contacto: string;
  cargo: string;
  telefono: string;
  email: string;
  observaciones: string;
  created_at: string;
};

type EmpresaContactoForm = {
  razon_social: string;
  nit: string;
  nombre_contacto: string;
  cargo: string;
  email: string;
  telefono: string;
  observaciones: string;
};

type DirectorioEmpresasDashboardProps = {
  empresa: EmpresaCode;
  canEdit: boolean;
};

const emptyForm: EmpresaContactoForm = {
  razon_social: "",
  nit: "",
  nombre_contacto: "",
  cargo: "",
  email: "",
  telefono: "",
  observaciones: ""
};

export function DirectorioEmpresasDashboard({ empresa, canEdit }: DirectorioEmpresasDashboardProps) {
  const [empresas, setEmpresas] = useState<EmpresaContacto[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<EmpresaContactoForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function loadEmpresas(currentEmpresa: EmpresaCode) {
    const response = await fetch(`/api/contactos-empresa?empresa=${currentEmpresa}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.detail ?? "No fue posible cargar las empresas cliente.");
    }

    setEmpresas(Array.isArray(data) ? (data as EmpresaContacto[]) : []);
  }

  useEffect(() => {
    void (async () => {
      try {
        setError("");
        setSearch("");
        await loadEmpresas(empresa);
      } catch (loadError) {
        setEmpresas([]);
        setError(loadError instanceof Error ? loadError.message : "No fue posible cargar las empresas cliente.");
      }
    })();
  }, [empresa]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return empresas;
    return empresas.filter((item) => {
      const razonSocial = item.razon_social.toLowerCase();
      const nit = item.nit.toLowerCase();
      return razonSocial.includes(query) || nit.includes(query);
    });
  }, [empresas, search]);

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(item: EmpresaContacto) {
    setEditingId(item.id);
    setForm({
      razon_social: item.razon_social,
      nit: item.nit,
      nombre_contacto: item.nombre_contacto,
      cargo: item.cargo,
      email: item.email,
      telefono: item.telefono,
      observaciones: item.observaciones
    });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  async function saveEmpresa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = {
      empresa,
      razon_social: form.razon_social.trim(),
      nit: form.nit.trim(),
      nombre_contacto: form.nombre_contacto.trim(),
      cargo: form.cargo.trim(),
      email: form.email.trim(),
      telefono: form.telefono.trim(),
      observaciones: form.observaciones.trim()
    };

    if (!payload.razon_social) {
      window.alert("La raz\u00f3n social es obligatoria.");
      return;
    }

    const path = editingId ? `/api/contactos-empresa/${editingId}` : "/api/contactos-empresa";
    const method = editingId ? "PUT" : "POST";

    setSaving(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "No fue posible guardar la empresa cliente.");
      }

      closeModal();
      setError("");
      await loadEmpresas(empresa);
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : "No fue posible guardar la empresa cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function removeEmpresa(id: number) {
    const item = empresas.find((empresaItem) => empresaItem.id === id);
    if (!item) return;

    if (!window.confirm(`Eliminar a ${item.razon_social}? Esta acci\u00f3n borra el registro f\u00edsicamente.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/contactos-empresa/${id}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail ?? "No fue posible eliminar la empresa cliente.");
      }

      setError("");
      await loadEmpresas(empresa);
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : "No fue posible eliminar la empresa cliente.");
    }
  }

  return (
    <>
      <AssistantShell
        title={`Directorio ${empresa}`}
        contextBuilder={() =>
          JSON.stringify({
            empresa,
            total: empresas.length,
            resultados: filtered.slice(0, 20).map((item) => ({
              razon_social: item.razon_social,
              nit: item.nit,
              nombre_contacto: item.nombre_contacto,
              cargo: item.cargo,
              email: item.email,
              telefono: item.telefono
            }))
          })
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="module-kpi-card">
          <p className="module-kpi__label">Total empresas activas</p>
          <p className="module-kpi__value">{empresas.length}</p>
          <p className="module-kpi__sub">Empresas cliente activas de {empresa}</p>
        </div>
      </div>

      <section className="module-toolbar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
        <div style={{ display: "flex", width: "100%", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div className="module-search-wrap" style={{ maxWidth: 400, flex: 1 }}>
            <Search className="module-search-icon" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="module-search"
              placeholder="Buscar por razón social o NIT"
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="module-results-label" style={{ margin: 0 }}>{filtered.length} empresas encontradas</div>
            {canEdit ? (
              <button type="button" onClick={openCreateModal} className="module-primary-btn">
                Nueva empresa cliente
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {error ? (
        <EmptyState message={`Error de carga. ${error}`} />
      ) : filtered.length === 0 ? (
        <EmptyState message="Sin resultados. Ajusta la busqueda o crea una nueva empresa cliente." />
      ) : (
        <section className="module-directory-grid">
          {filtered.map((item) => (
            <article key={item.id} className="module-directory-card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                <div className="module-directory-top" style={{ marginBottom: 0 }}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <div className="module-directory-title" style={{ fontSize: "1.05rem" }}>{item.razon_social}</div>
                    <div className="module-directory-row__value is-muted" style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: "0.7rem", marginTop: 2 }}>{item.nit || <i style={{ opacity: 0.5 }}>NIT no registrado</i>}</div>
                  </div>
                  <span
                    style={{
                      padding: "4px 10px",
                      borderRadius: 20,
                      fontSize: "0.65rem",
                      fontFamily: "var(--font-space-mono), monospace",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                      background: "var(--module-surface-2)",
                      color: "var(--module-text)",
                      border: "1px solid var(--module-border)"
                    }}
                  >
                    {item.empresa}
                  </span>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div className="module-directory-row" style={{ gap: 12 }}>
                    <User className="module-directory-row__icon" style={{ opacity: 0.5 }} />
                    <span className="module-directory-row__value" style={{ fontWeight: 500 }}>
                      {item.nombre_contacto || item.cargo ? (
                        <>
                          {item.nombre_contacto}
                          {item.nombre_contacto && item.cargo ? " · " : ""}
                          <span style={{ color: "var(--module-muted)", fontWeight: 400 }}>{item.cargo}</span>
                        </>
                      ) : <i style={{ opacity: 0.5 }}>Contacto no registrado</i>}
                    </span>
                  </div>

                  <div className="module-directory-section" style={{ gap: 6 }}>
                    {item.email ? (
                      <a className="module-contact-link" href={`mailto:${item.email}`} style={{ gap: 12 }}>
                        <Mail className="module-contact-link__icon" style={{ opacity: 0.5 }} />
                        <span style={{ color: "var(--module-text)" }}>{item.email}</span>
                      </a>
                    ) : (
                      <div className="module-directory-row" style={{ gap: 12 }}>
                        <Mail className="module-directory-row__icon" style={{ opacity: 0.5 }} />
                        <i className="module-directory-row__value" style={{ opacity: 0.5 }}>Sin correo</i>
                      </div>
                    )}
                  </div>

                  <div className="module-directory-section" style={{ gap: 6 }}>
                    {item.telefono ? (
                      <a className="module-contact-link" href={`tel:${item.telefono.replace(/\s+/g, "")}`} style={{ gap: 12 }}>
                        <Phone className="module-contact-link__icon" style={{ opacity: 0.5 }} />
                        <span style={{ color: "var(--module-text)" }}>{item.telefono}</span>
                      </a>
                    ) : (
                      <div className="module-directory-row" style={{ gap: 12 }}>
                        <Phone className="module-directory-row__icon" style={{ opacity: 0.5 }} />
                        <i className="module-directory-row__value" style={{ opacity: 0.5 }}>Sin teléfono</i>
                      </div>
                    )}
                  </div>
                </div>

                {item.observaciones && (
                  <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px dashed var(--module-border)" }}>
                    <div className="module-directory-row" style={{ gap: 12, alignItems: "flex-start" }}>
                      <FileText className="module-directory-row__icon" style={{ opacity: 0.5, marginTop: 2 }} />
                      <span className="module-notes" style={{ fontSize: "0.8rem", lineHeight: 1.5, color: "var(--module-muted)" }}>{item.observaciones}</span>
                    </div>
                  </div>
                )}
              </div>

              {canEdit && (
                <div style={{ display: "flex", borderTop: "1px solid var(--module-border)", background: "var(--module-surface-2)" }}>
                  <button 
                    type="button" 
                    onClick={() => openEditModal(item)}
                    style={{ flex: 1, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, color: "var(--module-text)", border: "none", background: "transparent", cursor: "pointer", borderRight: "1px solid var(--module-border)", transition: "background 0.2s" }}
                    onMouseOver={(e) => e.currentTarget.style.background = "var(--module-border)"}
                    onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <Pencil style={{ width: 14, height: 14, opacity: 0.6 }} /> Editar
                  </button>
                  <button 
                    type="button" 
                    onClick={() => void removeEmpresa(item.id)}
                    style={{ flex: 1, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, color: "#cc0000", border: "none", background: "transparent", cursor: "pointer", transition: "background 0.2s" }}
                    onMouseOver={(e) => e.currentTarget.style.background = "rgba(204,0,0,0.05)"}
                    onMouseOut={(e) => e.currentTarget.style.background = "transparent"}
                  >
                    <Trash2 style={{ width: 14, height: 14, opacity: 0.8 }} /> Eliminar
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <div
        className={`module-modal-backdrop ${showModal ? "open" : ""}`}
        onClick={(event) => {
          if (event.target === event.currentTarget && !saving) closeModal();
        }}
      >
        <div className="module-modal">
          <div className="module-modal-head">
            <div>
              <div className="module-kicker">{editingId ? "Edici\u00f3n de empresa cliente" : "Nuevo registro"}</div>
              <h3 className="module-section-title">
                {editingId ? `Editar ${form.razon_social || "empresa cliente"}` : `Nueva empresa cliente ${empresa}`}
              </h3>
            </div>
            <button type="button" className="module-secondary-btn" onClick={closeModal} disabled={saving}>
              Cerrar
            </button>
          </div>
          <div className="module-modal-body">
            <form onSubmit={saveEmpresa} className="module-form-grid">
              <div className="module-form-field full">
                <label htmlFor="empresa-razon-social" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Razón social</label>
                <div style={{ position: "relative" }}>
                  <Building style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="empresa-razon-social"
                    value={form.razon_social}
                    onChange={(event) => setForm((prev) => ({ ...prev, razon_social: event.target.value }))}
                    className="module-form-input"
                    style={{ paddingLeft: 36, background: "#fff", transition: "all 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                    required
                  />
                </div>
              </div>
              <div className="module-form-field">
                <label htmlFor="empresa-nit" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>NIT</label>
                <div style={{ position: "relative" }}>
                  <Hash style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="empresa-nit"
                    value={form.nit}
                    onChange={(event) => setForm((prev) => ({ ...prev, nit: event.target.value }))}
                    className="module-form-input"
                    style={{ paddingLeft: 36, background: "#fff", transition: "all 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field">
                <label htmlFor="empresa-telefono" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Teléfono</label>
                <div style={{ position: "relative" }}>
                  <Phone style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="empresa-telefono"
                    type="tel"
                    value={form.telefono}
                    onChange={(event) => setForm((prev) => ({ ...prev, telefono: event.target.value }))}
                    className="module-form-input"
                    style={{ paddingLeft: 36, background: "#fff", transition: "all 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field">
                <label htmlFor="empresa-nombre-contacto" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Nombre contacto</label>
                <div style={{ position: "relative" }}>
                  <User style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="empresa-nombre-contacto"
                    value={form.nombre_contacto}
                    onChange={(event) => setForm((prev) => ({ ...prev, nombre_contacto: event.target.value }))}
                    className="module-form-input"
                    style={{ paddingLeft: 36, background: "#fff", transition: "all 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field">
                <label htmlFor="empresa-cargo" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Cargo</label>
                <div style={{ position: "relative" }}>
                  <Briefcase style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="empresa-cargo"
                    value={form.cargo}
                    onChange={(event) => setForm((prev) => ({ ...prev, cargo: event.target.value }))}
                    className="module-form-input"
                    style={{ paddingLeft: 36, background: "#fff", transition: "all 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field full">
                <label htmlFor="empresa-email" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Email</label>
                <div style={{ position: "relative" }}>
                  <Mail style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="empresa-email"
                    type="email"
                    value={form.email}
                    onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                    className="module-form-input"
                    style={{ paddingLeft: 36, background: "#fff", transition: "all 0.2s" }}
                    onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field full">
                <label htmlFor="empresa-observaciones" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Observaciones</label>
                <textarea
                  id="empresa-observaciones"
                  value={form.observaciones}
                  onChange={(event) => setForm((prev) => ({ ...prev, observaciones: event.target.value }))}
                  className="module-form-textarea"
                  style={{ background: "#fff", transition: "all 0.2s", minHeight: 80 }}
                  onFocus={(e) => { e.target.style.borderColor = "var(--module-accent)"; e.target.style.boxShadow = "0 0 0 3px rgba(204,0,0,0.1)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--module-border)"; e.target.style.boxShadow = "none"; }}
                />
              </div>
              <div className="module-modal-actions full col-span-full">
                <button type="button" className="module-secondary-btn" onClick={closeModal} disabled={saving}>
                  Cancelar
                </button>
                <button type="submit" className="module-primary-btn" disabled={saving}>
                  {saving ? "Guardando..." : editingId ? "Guardar cambios" : "Guardar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
