"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building, Check, Copy, ExternalLink, FileText, Mail, Pencil, Phone, Plus, Search, Tag, Trash2, X } from "lucide-react";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { DirectorioEmpresasDashboard } from "@/components/modules/directorio-empresas-dashboard";
import { CompanyFilter, KpiCardSkeleton, Skeleton } from "@/components/ui";
import { EmptyState } from "@/components/ui/dashboard-primitives";
import type { DirectorioAseguradora, DirectorioContactoInput, DirectorioRol } from "@/lib/directorio";

type LinkPago = {
  id: number;
  aseguradora: string;
  url: string;
};

type LinkPagoForm = {
  aseguradora: string;
  url: string;
};

type ContactDraft = DirectorioContactoInput & {
  localId: string;
};

type ContactRoleKey = "cartera" | "operaciones";

type DirectorioForm = {
  nombre: string;
  tipo: string;
  notas_generales: string;
  contactos: Record<ContactRoleKey, ContactDraft[]>;
};

const roleSections: Array<{ role: DirectorioRol; key: ContactRoleKey }> = [
  { role: "Cartera", key: "cartera" },
  { role: "Operaciones", key: "operaciones" }
];

const emptyForm: DirectorioForm = {
  nombre: "",
  tipo: "ARL",
  notas_generales: "",
  contactos: {
    cartera: [],
    operaciones: []
  }
};

function makeLocalId() {
  return `contact-${Math.random().toString(36).slice(2, 10)}`;
}

function roleToKey(role: DirectorioRol): ContactRoleKey {
  return role === "Cartera" ? "cartera" : "operaciones";
}

function buildDraft(role: DirectorioRol, source?: Partial<DirectorioContactoInput>): ContactDraft {
  return {
    localId: makeLocalId(),
    id: source?.id,
    rol: role,
    nombre: source?.nombre ?? "",
    email: source?.email ?? "",
    telefono: source?.telefono ?? "",
    notas: source?.notas ?? ""
  };
}

function buildForm(item?: DirectorioAseguradora): DirectorioForm {
  if (!item) return emptyForm;

  return {
    nombre: item.nombre,
    tipo: item.tipo,
    notas_generales: item.notas_generales,
    contactos: {
      cartera: item.contactos.cartera.map((contacto) => buildDraft("Cartera", contacto)),
      operaciones: item.contactos.operaciones.map((contacto) => buildDraft("Operaciones", contacto))
    }
  };
}

function flattenContacts(form: DirectorioForm): DirectorioContactoInput[] {
  return [...form.contactos.cartera, ...form.contactos.operaciones].map((contacto) => ({
    id: contacto.id,
    rol: contacto.rol,
    nombre: contacto.nombre.trim(),
    email: contacto.email.trim(),
    telefono: contacto.telefono.trim(),
    notas: contacto.notas.trim()
  }));
}

type DirectorioDashboardProps = {
  canEdit: boolean;
};

export function DirectorioDashboard({ canEdit }: DirectorioDashboardProps) {
  const [empresa, setEmpresa] = useState<"CMYM" | "SYSO" | "SANUM">("CMYM");
  const [aseguradoras, setAseguradoras] = useState<DirectorioAseguradora[]>([]);
  const [search, setSearch] = useState("");
  const [tipo, setTipo] = useState("Todos");
  const [form, setForm] = useState<DirectorioForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const [linksData, setLinksData] = useState<LinkPago[]>([]);
  const [showLinksPanel, setShowLinksPanel] = useState(false);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [editingLinkId, setEditingLinkId] = useState<number | null>(null);
  const [linkForm, setLinkForm] = useState<LinkPagoForm>({ aseguradora: "", url: "" });
  const [savingLink, setSavingLink] = useState(false);

  async function loadData() {
    const response = await fetch("/api/contactos");
    const data = (await response.json()) as { contactos?: DirectorioAseguradora[]; detail?: string };

    if (!response.ok) {
      throw new Error(data.detail ?? "No fue posible cargar el directorio.");
    }

    setAseguradoras(Array.isArray(data.contactos) ? data.contactos : []);
  }

  async function loadLinks() {
    const response = await fetch("/api/links-pago");
    if (!response.ok) return;
    const data = (await response.json()) as { links?: LinkPago[] };
    setLinksData(Array.isArray(data.links) ? data.links : []);
  }

  useEffect(() => {
    void (async () => {
      try {
        setError("");
        await Promise.all([loadData(), loadLinks()]);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "No fue posible cargar el directorio.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const moduleSkeleton = (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <KpiCardSkeleton key={`directorio-kpi-skeleton-${index}`} />)}
      </div>
      <section className="module-toolbar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 16 }}>
        <div style={{ display: "flex", width: "100%", gap: 16, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <Skeleton className="h-9 w-full max-w-[400px]" />
          <Skeleton className="h-9 w-[260px]" />
        </div>
      </section>
      <section className="module-directory-grid">
        {Array.from({ length: 6 }, (_, index) => (
          <article key={`directorio-card-skeleton-${index}`} className="module-directory-card" style={{ display: "flex", flexDirection: "column", padding: 20, gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </article>
        ))}
      </section>
    </>
  );

  const filtered = useMemo(
    () =>
      aseguradoras.filter(
        (item) =>
          item.nombre.toLowerCase().includes(search.toLowerCase()) &&
          (tipo === "Todos" || item.tipo === tipo)
      ),
    [aseguradoras, search, tipo]
  );

  function openCreateModal() {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEditModal(item: DirectorioAseguradora, roleToSeed?: DirectorioRol) {
    const nextForm = buildForm(item);
    if (roleToSeed) {
      const key = roleToKey(roleToSeed);
      nextForm.contactos[key] = [...nextForm.contactos[key], buildDraft(roleToSeed)];
    }
    setEditingId(item.id);
    setForm(nextForm);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function updateContact(role: DirectorioRol, localId: string, field: keyof DirectorioContactoInput, value: string) {
    const key = roleToKey(role);
    setForm((prev) => ({
      ...prev,
      contactos: {
        ...prev.contactos,
        [key]: prev.contactos[key].map((contacto) =>
          contacto.localId === localId ? { ...contacto, [field]: value } : contacto
        )
      }
    }));
  }

  function addRoleContact(role: DirectorioRol) {
    const key = roleToKey(role);
    setForm((prev) => ({
      ...prev,
      contactos: {
        ...prev.contactos,
        [key]: [...prev.contactos[key], buildDraft(role)]
      }
    }));
  }

  function removeRoleContact(role: DirectorioRol, localId: string) {
    const key = roleToKey(role);
    setForm((prev) => ({
      ...prev,
      contactos: {
        ...prev.contactos,
        [key]: prev.contactos[key].filter((contacto) => contacto.localId !== localId)
      }
    }));
  }

  async function saveAseguradora(event: FormEvent) {
    event.preventDefault();

    const payload = {
      nombre: form.nombre.trim(),
      tipo: form.tipo,
      notas_generales: form.notas_generales.trim(),
      contactos: flattenContacts(form)
    };

    if (!payload.nombre) {
      window.alert("El nombre de la aseguradora es obligatorio.");
      return;
    }

    const invalidContact = payload.contactos.find((contacto) => !contacto.nombre);
    if (invalidContact) {
      window.alert("Todos los contactos deben tener nombre.");
      return;
    }

    const path = editingId ? `/api/contactos/${editingId}` : "/api/contactos";
    const method = editingId ? "PUT" : "POST";

    setSaving(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { detail?: string };

      if (!response.ok) {
        throw new Error(data.detail ?? "No fue posible guardar la aseguradora.");
      }

      closeModal();
      setError("");
      await loadData();
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : "Error inesperado al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAseguradora(id: number) {
    const item = aseguradoras.find((aseguradora) => aseguradora.id === id);
    if (!item) return;

    if (!window.confirm(`Eliminar a ${item.nombre} del directorio? Esta acci\u00f3n borra el registro f\u00edsicamente.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/contactos/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { detail?: string };

      if (!response.ok) {
        throw new Error(data.detail ?? "No fue posible eliminar la aseguradora.");
      }

      setError("");
      await loadData();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : "No fue posible eliminar la aseguradora.");
    }
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      window.setTimeout(() => setCopiedEmail(null), 1800);
    } catch {
      window.alert("No fue posible copiar el correo.");
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(url);
      window.setTimeout(() => setCopiedLink(null), 1800);
    } catch {
      window.alert("No fue posible copiar el link.");
    }
  }

  function openCreateLinkModal() {
    setEditingLinkId(null);
    setLinkForm({ aseguradora: "", url: "" });
    setShowLinkModal(true);
  }

  function openEditLinkModal(link: LinkPago) {
    setEditingLinkId(link.id);
    setLinkForm({ aseguradora: link.aseguradora, url: link.url });
    setShowLinkModal(true);
  }

  function closeLinkModal() {
    setShowLinkModal(false);
    setEditingLinkId(null);
    setLinkForm({ aseguradora: "", url: "" });
  }

  async function saveLinkForm(event: FormEvent) {
    event.preventDefault();
    const aseguradora = linkForm.aseguradora.trim();
    const url = linkForm.url.trim();
    if (!aseguradora || !url) {
      window.alert("Aseguradora y URL son obligatorios.");
      return;
    }

    const path = editingLinkId ? `/api/links-pago/${editingLinkId}` : "/api/links-pago";
    const method = editingLinkId ? "PUT" : "POST";

    setSavingLink(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aseguradora, url })
      });
      const data = (await response.json()) as { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "No fue posible guardar el link.");
      closeLinkModal();
      await loadLinks();
    } catch (saveError) {
      window.alert(saveError instanceof Error ? saveError.message : "Error inesperado al guardar.");
    } finally {
      setSavingLink(false);
    }
  }

  async function removeLink(id: number) {
    if (!window.confirm("Eliminar este link de pago?")) return;
    try {
      const response = await fetch(`/api/links-pago/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { detail?: string };
      if (!response.ok) throw new Error(data.detail ?? "No fue posible eliminar el link.");
      if (showLinkModal) closeLinkModal();
      await loadLinks();
    } catch (deleteError) {
      window.alert(deleteError instanceof Error ? deleteError.message : "No fue posible eliminar el link.");
    }
  }

  return (
    <div className="module-page-standard">
      <AssistantShell
        title="Directorio"
        contextBuilder={() =>
          JSON.stringify({
            total: aseguradoras.length,
            tipos: {
              arl: aseguradoras.filter((item) => item.tipo === "ARL").length,
              seguros: aseguradoras.filter((item) => item.tipo === "Seguros").length,
              salud: aseguradoras.filter((item) => item.tipo === "Salud").length
            },
            resultados: filtered.slice(0, 20).map((item) => ({
              nombre: item.nombre,
              tipo: item.tipo,
              cartera: item.contactos.cartera.map((contacto) => contacto.email || contacto.nombre),
              operaciones: item.contactos.operaciones.map((contacto) => contacto.email || contacto.nombre)
            }))
          })
        }
      />

      <ModuleHeader
        titulo={`DIRECTORIO | ${empresa}`}
        subtitulo={empresa === "CMYM" ? "// ASEGURADORAS  CONTACTOS  GESTION" : "// EMPRESAS CLIENTES  CONTACTOS  GESTION"}
        actions={
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
            <CompanyFilter
              companies={["CMYM", "SYSO", "SANUM"]}
              value={empresa}
              includeAll={false}
              onChange={(next) => setEmpresa(next as "CMYM" | "SYSO" | "SANUM")}
            />
            {empresa === "CMYM" ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowLinksPanel(true)}
                  className="module-secondary-btn"
                  style={{ borderColor: "#2e8b7a", color: "#2e8b7a" }}
                >
                  Links de Pago
                </button>
                {canEdit ? (
                  <button type="button" onClick={openCreateModal} className="module-primary-btn">
                    Nueva aseguradora
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        }
      />

      {empresa === "CMYM" ? (
        loading ? moduleSkeleton : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="module-kpi-card">
              <p className="module-kpi__label">Total aseguradoras</p>
              <p className="module-kpi__value">{aseguradoras.length}</p>
              <p className="module-kpi__sub">Aseguradoras CMYM registradas</p>
            </div>
            <div className="module-kpi-card module-kpi-card--blue">
              <p className="module-kpi__label" style={{ color: "#0077c8" }}>ARL</p>
              <p className="module-kpi__value" style={{ color: "#0077c8" }}>{aseguradoras.filter((item) => item.tipo === "ARL").length}</p>
              <p className="module-kpi__sub">Aseguradoras ARL registradas</p>
            </div>
            <div className="module-kpi-card module-kpi-card--amber">
              <p className="module-kpi__label" style={{ color: "#d97706" }}>Seguros</p>
              <p className="module-kpi__value" style={{ color: "#d97706" }}>{aseguradoras.filter((item) => item.tipo === "Seguros").length}</p>
              <p className="module-kpi__sub">Aseguradoras de seguros</p>
            </div>
            <div className="module-kpi-card module-kpi-card--green">
              <p className="module-kpi__label" style={{ color: "#2e8b7a" }}>Salud</p>
              <p className="module-kpi__value" style={{ color: "#2e8b7a" }}>{aseguradoras.filter((item) => item.tipo === "Salud").length}</p>
              <p className="module-kpi__sub">Prestadores o contactos salud</p>
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
                  placeholder="Buscar por nombre de aseguradora"
                />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--module-surface-2)", padding: 4, borderRadius: 8, border: "1px solid var(--module-border)" }}>
                {["Todos", "ARL", "Seguros", "Salud"].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTipo(value)}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 6,
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      background: tipo === value ? "var(--module-surface)" : "transparent",
                      color: tipo === value ? "var(--module-text)" : "var(--module-muted)",
                      boxShadow: tipo === value ? "0 1px 2px rgba(0,0,0,0.05)" : "none",
                      transition: "all 0.2s"
                    }}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>
            <div className="module-results-label" style={{ margin: 0 }}>{filtered.length} aseguradoras encontradas</div>
          </section>

          {error ? (
            <EmptyState message={`Error de carga. ${error}`} />
          ) : filtered.length === 0 ? (
            <EmptyState message="Sin resultados. Ajusta la busqueda o crea una nueva aseguradora." />
          ) : (
            <section className="module-directory-grid">
              {filtered.map((item) => (
                <article key={item.id} className="module-directory-card" style={{ display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
                  <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16, flex: 1 }}>
                    <div className="module-directory-top" style={{ marginBottom: 0 }}>
                      <div
                        className="module-directory-title"
                        title={item.nombre}
                        style={{
                          fontSize: "1.05rem",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden"
                        }}
                      >{item.nombre}</div>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 20,
                          fontSize: "0.65rem",
                          fontFamily: "var(--font-space-mono), monospace",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                          background: item.tipo === "ARL" ? "rgba(0,119,200,0.1)" : item.tipo === "Seguros" ? "rgba(217,119,6,0.1)" : "rgba(46,139,122,0.1)",
                          color: item.tipo === "ARL" ? "#0077c8" : item.tipo === "Seguros" ? "#d97706" : "#2e8b7a"
                        }}
                      >
                        {item.tipo}
                      </span>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {roleSections.map(({ role, key }) => {
                        const contactos = item.contactos[key];
                        const roleLabel = role.toLowerCase();
                        return (
                          <div key={role} style={{ display: "flex", flexDirection: "column", gap: contactos.length ? 8 : 0 }}>
                            {!contactos.length && canEdit ? (
                              <button
                                type="button"
                                onClick={() => openEditModal(item, role)}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  padding: 0,
                                  border: "none",
                                  background: "transparent",
                                  color: "var(--module-muted)",
                                  fontSize: "0.76rem",
                                  lineHeight: 1.2,
                                  cursor: "pointer",
                                  opacity: 0.7,
                                  alignSelf: "flex-start"
                                }}
                              >
                                <Plus style={{ width: 12, height: 12 }} />
                                Agregar contacto de {roleLabel}
                              </button>
                            ) : null}

                            {contactos.length ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--module-muted)" }}>
                                    {role.toUpperCase()}
                                  </span>
                                </div>
                                {contactos.map((contacto) => (
                                  <div key={contacto.id} style={{ display: "flex", flexDirection: "column", gap: 4, paddingBottom: 8, borderBottom: "1px dashed rgba(0,0,0,0.08)" }}>
                                    <span className="module-directory-row__value" style={{ fontWeight: 600 }}>
                                      {contacto.nombre}
                                    </span>

                                    {contacto.email ? (
                                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                        <a className="module-contact-link" href={`mailto:${contacto.email}`} style={{ gap: 10, flex: 1, minWidth: 0 }}>
                                          <Mail className="module-contact-link__icon" style={{ opacity: 0.5 }} />
                                          <span style={{ color: "var(--module-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contacto.email}</span>
                                        </a>
                                        <button
                                          type="button"
                                          onClick={() => void copyEmail(contacto.email)}
                                          title="Copiar correo"
                                          style={{
                                            flexShrink: 0,
                                            padding: "3px 5px",
                                            background: copiedEmail === contacto.email ? "rgba(46,139,122,0.12)" : "var(--module-surface-2)",
                                            border: "1px solid var(--module-border)",
                                            borderRadius: 5,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            color: copiedEmail === contacto.email ? "#2e8b7a" : "var(--module-muted)"
                                          }}
                                        >
                                          {copiedEmail === contacto.email ? <Check style={{ width: 12, height: 12 }} /> : <Copy style={{ width: 12, height: 12 }} />}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="module-directory-row" style={{ gap: 10 }}>
                                        <Mail className="module-directory-row__icon" style={{ opacity: 0.5 }} />
                                        <i className="module-directory-row__value" style={{ opacity: 0.5 }}>(sin correo)</i>
                                      </div>
                                    )}

                                    {contacto.telefono ? (
                                      <a className="module-contact-link" href={`tel:${contacto.telefono.replace(/\s+/g, "")}`} style={{ gap: 10 }}>
                                        <Phone className="module-contact-link__icon" style={{ opacity: 0.5 }} />
                                        <span style={{ color: "var(--module-text)" }}>{contacto.telefono}</span>
                                      </a>
                                    ) : (
                                      <div className="module-directory-row" style={{ gap: 10 }}>
                                        <Phone className="module-directory-row__icon" style={{ opacity: 0.5 }} />
                                        <i className="module-directory-row__value" style={{ opacity: 0.5 }}>(sin teléfono)</i>
                                      </div>
                                    )}

                                    {contacto.notas ? (
                                      <div className="module-directory-row" style={{ gap: 10, alignItems: "flex-start" }}>
                                        <FileText className="module-directory-row__icon" style={{ opacity: 0.45, marginTop: 1 }} />
                                        <span className="module-notes" style={{ fontSize: "0.8rem", lineHeight: 1.45, color: "var(--module-muted)" }}>{contacto.notas}</span>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() => openEditModal(item, role)}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      gap: 6,
                                      padding: 0,
                                      border: "none",
                                      background: "transparent",
                                      color: "var(--module-muted)",
                                      fontSize: "0.76rem",
                                      fontWeight: 600,
                                      cursor: "pointer",
                                      alignSelf: "flex-start"
                                    }}
                                  >
                                    <Plus style={{ width: 12, height: 12 }} />
                                    Agregar otro
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {item.notas_generales ? (
                      <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px dashed var(--module-border)" }}>
                        <div className="module-directory-row" style={{ gap: 12, alignItems: "flex-start" }}>
                          <FileText className="module-directory-row__icon" style={{ opacity: 0.5, marginTop: 2 }} />
                          <span className="module-notes" style={{ fontSize: "0.8rem", lineHeight: 1.5, color: "var(--module-muted)" }}>
                            <strong style={{ color: "var(--module-text)" }}>Notas:</strong> {item.notas_generales}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {canEdit ? (
                    <div style={{ display: "flex", borderTop: "1px solid var(--module-border)", background: "var(--module-surface-2)" }}>
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        style={{ flex: 1, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, color: "var(--module-text)", border: "none", background: "transparent", cursor: "pointer", borderRight: "1px solid var(--module-border)" }}
                      >
                        <Pencil style={{ width: 14, height: 14, opacity: 0.6 }} /> Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeAseguradora(item.id)}
                        style={{ flex: 1, padding: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: "0.75rem", fontWeight: 600, color: "#cc0000", border: "none", background: "transparent", cursor: "pointer" }}
                      >
                        <Trash2 style={{ width: 14, height: 14, opacity: 0.8 }} /> Eliminar
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </section>
          )}

          <div
            className={`module-modal-backdrop ${showLinksPanel ? "open" : ""}`}
            onClick={(event) => {
              if (event.target === event.currentTarget) setShowLinksPanel(false);
            }}
          >
            <div className="module-modal" style={{ maxWidth: 560 }}>
              <div className="module-modal-head" style={{ borderTop: "4px solid #2e8b7a" }}>
                <div>
                  <div className="module-kicker">Directorio</div>
                  <h3 className="module-section-title">Links de Pago - Seguros y Vida</h3>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {canEdit ? (
                    <button type="button" className="module-primary-btn" onClick={openCreateLinkModal}>
                      + Añadir link
                    </button>
                  ) : null}
                  <button type="button" className="module-secondary-btn" onClick={() => setShowLinksPanel(false)}>
                    X
                  </button>
                </div>
              </div>
              <div className="module-modal-body">
                {linksData.length === 0 ? (
                  <p className="module-directory-row__value is-muted">Sin links de pago registrados.</p>
                ) : (
                  <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {linksData.map((link) => (
                      <li
                        key={link.id}
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: 8,
                          background: "var(--module-surface-2)",
                          border: "1px solid var(--module-border)",
                          borderRadius: 8,
                          padding: "6px 12px"
                        }}
                      >
                        <span style={{ minWidth: 140, fontWeight: 600, color: "var(--module-text)", fontSize: "0.8rem" }}>{link.aseguradora}</span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, fontSize: "0.75rem", color: "var(--module-muted, #82827f)" }}>
                          {link.url}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
                          <button
                            type="button"
                            className="module-pill-btn"
                            onClick={() => void copyLink(link.url)}
                            title="Copiar URL"
                            style={copiedLink === link.url ? { background: "rgba(46,139,122,0.12)", color: "#2e8b7a", borderColor: "#2e8b7a" } : undefined}
                          >
                            {copiedLink === link.url ? "¡Copiado!" : "Copiar"}
                          </button>
                          <a href={link.url} target="_blank" rel="noreferrer" className="module-pill-btn" style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title="Abrir enlace">
                            <ExternalLink style={{ width: 12, height: 12 }} />
                            Abrir
                          </a>
                          {canEdit ? (
                            <>
                              <button type="button" className="module-action-btn" onClick={() => openEditLinkModal(link)} title="Editar">
                                <Pencil style={{ width: 12, height: 12 }} />
                              </button>
                              <button type="button" className="module-action-btn module-action-btn--danger" onClick={() => void removeLink(link.id)} title="Eliminar">
                                <Trash2 style={{ width: 12, height: 12 }} />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>

          <div
            className={`module-modal-backdrop ${showModal ? "open" : ""}`}
            onClick={(event) => {
              if (event.target === event.currentTarget && !saving) closeModal();
            }}
          >
            <div className="module-modal" style={{ maxWidth: 920 }}>
              <button type="button" className="cartera-recordatorios-close" onClick={closeModal} disabled={saving} aria-label="Cerrar" title="Cerrar">
                <X size={18} strokeWidth={2.25} />
              </button>
              <div className="module-modal-head">
                <div>
                  <div className="module-kicker">{editingId ? "Edici\u00f3n de aseguradora" : "Nuevo registro"}</div>
                  <h3 className="module-section-title">{editingId ? `Editar ${form.nombre || "aseguradora"}` : "Nueva aseguradora"}</h3>
                </div>
              </div>
              <div className="module-modal-body">
                <form onSubmit={saveAseguradora} className="module-form-grid">
                  <div style={{ display: "grid", gap: 14, gridColumn: "1 / -1", width: "100%" }}>
                    <section style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--module-muted)" }}>
                        INFORMACION GENERAL
                      </div>

                      <div className="module-form-grid">
                        <div className="module-form-field">
                          <label htmlFor="nombre" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Nombre</label>
                          <div style={{ position: "relative" }}>
                            <Building style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                            <input
                              id="nombre"
                              value={form.nombre}
                              onChange={(event) => setForm((prev) => ({ ...prev, nombre: event.target.value }))}
                              className="module-form-input"
                              style={{ paddingLeft: 36, background: "#fff" }}
                              required
                            />
                          </div>
                        </div>

                        <div className="module-form-field">
                          <label htmlFor="tipo" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Tipo</label>
                          <div style={{ position: "relative" }}>
                            <Tag style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                            <select
                              id="tipo"
                              value={form.tipo}
                              onChange={(event) => setForm((prev) => ({ ...prev, tipo: event.target.value }))}
                              className="module-form-select"
                              style={{ paddingLeft: 36, background: "#fff" }}
                            >
                              <option>ARL</option>
                              <option>Seguros</option>
                              <option>Salud</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      <div className="module-form-field full">
                        <label htmlFor="notas-generales" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Notas generales</label>
                        <textarea
                          id="notas-generales"
                          value={form.notas_generales}
                          onChange={(event) => setForm((prev) => ({ ...prev, notas_generales: event.target.value }))}
                          className="module-form-textarea"
                          rows={3}
                          style={{ background: "#fff", minHeight: 56, height: "auto" }}
                        />
                      </div>
                    </section>

                    <section style={{ display: "grid", gap: 10 }}>
                      <div style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--module-muted)" }}>
                        CONTACTOS
                      </div>

                      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
                        {roleSections.map(({ role, key }) => (
                          <div key={role} style={{ display: "grid", gap: 8, padding: 12, border: "1px solid var(--module-border)", borderRadius: 12, background: "var(--module-surface-2)" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                              <span style={{ fontFamily: "var(--font-space-mono), monospace", fontSize: "0.74rem", fontWeight: 700, letterSpacing: "0.08em", color: "var(--module-text)" }}>
                                {role.toUpperCase()}
                              </span>
                              <button type="button" className="module-secondary-btn" onClick={() => addRoleContact(role)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                                <Plus style={{ width: 14, height: 14 }} />
                                Agregar contacto de {role}
                              </button>
                            </div>

                            {form.contactos[key].length ? (
                              form.contactos[key].map((contacto, index) => (
                                <div key={contacto.localId} style={{ display: "grid", gap: 8, padding: 10, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff" }}>
                                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                                    <strong style={{ fontSize: "0.84rem", color: "var(--module-text)" }}>{role} #{index + 1}</strong>
                                    <button type="button" className="module-action-btn module-action-btn--danger" onClick={() => removeRoleContact(role, contacto.localId)} title="Eliminar contacto">
                                      <Trash2 style={{ width: 14, height: 14 }} />
                                    </button>
                                  </div>

                                  <div className="module-form-grid">
                                    <div className="module-form-field">
                                      <label style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Nombre</label>
                                      <input
                                        value={contacto.nombre}
                                        onChange={(event) => updateContact(role, contacto.localId, "nombre", event.target.value)}
                                        className="module-form-input"
                                        style={{ background: "#fff" }}
                                        required
                                      />
                                    </div>
                                    <div className="module-form-field">
                                      <label style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Email</label>
                                      <input
                                        value={contacto.email}
                                        onChange={(event) => updateContact(role, contacto.localId, "email", event.target.value)}
                                        className="module-form-input"
                                        placeholder="correo@aseguradora.com"
                                        style={{ background: "#fff" }}
                                      />
                                    </div>
                                    <div className="module-form-field">
                                      <label style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Telefono</label>
                                      <input
                                        value={contacto.telefono}
                                        onChange={(event) => updateContact(role, contacto.localId, "telefono", event.target.value)}
                                        className="module-form-input"
                                        placeholder="+57 300 000 0000"
                                        style={{ background: "#fff" }}
                                      />
                                    </div>
                                    <div className="module-form-field full">
                                      <label style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-sans)", fontWeight: 600, fontSize: "0.85rem", color: "var(--module-text)" }}>Notas</label>
                                      <textarea
                                        value={contacto.notas}
                                        onChange={(event) => updateContact(role, contacto.localId, "notas", event.target.value)}
                                        className="module-form-textarea"
                                        rows={2}
                                        style={{ background: "#fff", minHeight: 52 }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div style={{ color: "var(--module-muted)", fontSize: "0.82rem" }}>(sin contactos registrados)</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
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

          <div
            className={`module-modal-backdrop ${showLinkModal ? "open" : ""}`}
            onClick={(event) => {
              if (event.target === event.currentTarget && !savingLink) closeLinkModal();
            }}
          >
            <div className="module-modal">
              <div className="module-modal-head">
                <div>
                  <div className="module-kicker">{editingLinkId ? "Editar link" : "Nuevo link"}</div>
                  <h3 className="module-section-title">Link de pago</h3>
                </div>
                <button type="button" className="module-secondary-btn" onClick={closeLinkModal} disabled={savingLink}>
                  Cerrar
                </button>
              </div>
              <div className="module-modal-body">
                <form onSubmit={saveLinkForm} className="module-form-grid">
                  <div className="module-form-field full">
                    <label htmlFor="lp-aseguradora">Aseguradora</label>
                    <input
                      id="lp-aseguradora"
                      value={linkForm.aseguradora}
                      onChange={(event) => setLinkForm((prev) => ({ ...prev, aseguradora: event.target.value }))}
                      className="module-form-input"
                      placeholder="Nombre de la aseguradora"
                      required
                    />
                  </div>
                  <div className="module-form-field full">
                    <label htmlFor="lp-url">URL</label>
                    <input
                      id="lp-url"
                      value={linkForm.url}
                      onChange={(event) => setLinkForm((prev) => ({ ...prev, url: event.target.value }))}
                      className="module-form-input"
                      placeholder="https://..."
                      required
                    />
                  </div>
                  <div className="module-modal-actions full col-span-full">
                    {editingLinkId ? (
                      <button
                        type="button"
                        className="module-action-btn module-action-btn--danger"
                        onClick={() => void removeLink(editingLinkId)}
                        disabled={savingLink}
                      >
                        Eliminar
                      </button>
                    ) : null}
                    <button type="button" className="module-secondary-btn" onClick={closeLinkModal} disabled={savingLink}>
                      Cancelar
                    </button>
                    <button type="submit" className="module-primary-btn" disabled={savingLink}>
                      {savingLink ? "Guardando..." : editingLinkId ? "Guardar cambios" : "Guardar"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </>
        )
      ) : (
        <DirectorioEmpresasDashboard empresa={empresa} canEdit={canEdit} />
      )}
    </div>
  );
}
