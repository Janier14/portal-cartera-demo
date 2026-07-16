"use client";

import { AlertTriangle, Check, Pencil, Search, Shield, Trash2, User, UserCheck, UserX, AtSign, Lock, X } from "lucide-react";
import { Fragment, FormEvent, useEffect, useMemo, useState } from "react";

import { AssistantShell } from "@/components/chat/assistant-shell";
import { ModuleHeader } from "@/components/layout/module-header";
import { KpiCardSkeleton, Skeleton } from "@/components/ui";
import { EmptyState, KpiCard } from "@/components/ui/dashboard-primitives";
import type { AppAction, AppRole } from "@/lib/auth";

type ActionPermissions = Record<string, AppAction[]>;

type Usuario = {
  usuario: string;
  nombre_completo: string;
  rol: AppRole;
  modulos: string[];
  permisos_edicion: string[];
  action_permissions: ActionPermissions;
  activo: boolean;
  conectado_ahora?: boolean;
  ultimo_login_at?: string | null;
  ultima_actividad_at?: string | null;
  ultimo_logout_at?: string | null;
};

type AuditEvent = {
  id: string;
  created_at: string;
  actor_usuario: string | null;
  actor_nombre: string | null;
  actor_rol: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  module: string | null;
  source: string;
  status: string;
  summary: string;
};

type UsuariosDashboardProps = {
  currentUserRol: AppRole;
};

type ApprovalRequest = {
  id: string;
  created_at: string;
  reviewed_at: string | null;
  requested_by_usuario: string;
  requested_by_nombre: string | null;
  requested_by_rol: string | null;
  reviewed_by_usuario: string | null;
  module: string;
  entity_type: string;
  entity_id: string;
  action: string;
  status: "pending" | "approved" | "rejected";
  summary: string;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

const APPROVAL_ENABLED_MODULES = new Set(["cartera"]);

const emptyUser = {
  usuario: "",
  nombre_completo: "",
  rol: "operativo" as AppRole,
  modulos: ["arl"],
  permisos_edicion: [] as string[],
  action_permissions: { arl: ["view"] } as ActionPermissions,
  password: "",
  activo: true
};

const MODULOS_CONFIG = [
  { key: "resumen", label: "Resumen General", desc: "Acceso a la vista ejecutiva consolidada del holding." },
  { key: "arl", label: "Analitica ARL", desc: "Acceso al tablero demo de comisiones ARL." },
  { key: "seguros", label: "Analitica Seguros", desc: "Acceso al tablero demo de comisiones de seguros." },
  { key: "cartera", label: "Cartera", desc: "Acceso al módulo de facturación y cartera." },
  { key: "directorio", label: "Directorio", desc: "Acceso al directorio de aseguradoras." },
  { key: "analisis-cartera", label: "Análisis Cartera", desc: "Acceso al módulo de análisis de cartera." }
] as const;

export function UsuariosDashboard({ currentUserRol }: UsuariosDashboardProps) {
  const [users, setUsers] = useState<Usuario[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [auditRetentionDays, setAuditRetentionDays] = useState(30);
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [form, setForm] = useState(emptyUser);
  const [showModal, setShowModal] = useState(false);
  const [currentUser, setCurrentUser] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [reviewingApprovalId, setReviewingApprovalId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditLimit, setAuditLimit] = useState(10);
  const [auditLoadingMore, setAuditLoadingMore] = useState(false);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  async function loadUsers() {
    const response = await fetch("/api/usuarios");
    const data = await response.json();
    if (response.ok) setUsers(data.usuarios ?? []);
  }

  async function loadAuditEvents(limit = 10) {
    const response = await fetch(`/api/auditoria?limit=${limit}`);
    const data = await response.json();
    if (response.ok) {
      setAuditEvents(data.eventos ?? []);
      setAuditRetentionDays(Number(data.retentionDays) > 0 ? Number(data.retentionDays) : 30);
    }
  }

  async function loadApprovalRequests() {
    const response = await fetch("/api/aprobaciones?limit=30");
    const data = await response.json();
    if (response.ok) {
      setApprovalRequests(data.approvals ?? []);
    }
  }

  useEffect(() => {
    void (async () => {
      try {
        await Promise.all([
          loadUsers(),
          loadAuditEvents(auditLimit),
          loadApprovalRequests(),
          fetch("/api/auth/me").then((r) => r.json()).then((d) => { if (d.usuario) setCurrentUser(String(d.usuario)); })
        ]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function getInitials(name: string) {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatTimestamp(value?: string | null) {
    if (!value) return "Sin registro";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "Sin registro";
    return parsed.toLocaleString("es-CO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function parseSummaryStats(summary: string) {
    const listas = summary.match(/(\d+) listas/)?.[1];
    const rechazadas = summary.match(/(\d+) rechazadas/)?.[1];
    const creadas = summary.match(/(\d+) creadas/)?.[1];
    const actualizadas = summary.match(/(\d+) actualizadas/)?.[1];
    if (listas === undefined && creadas === undefined) return null;
    return {
      listas: listas !== undefined ? Number(listas) : undefined,
      rechazadas: rechazadas !== undefined ? Number(rechazadas) : undefined,
      creadas: creadas !== undefined ? Number(creadas) : undefined,
      actualizadas: actualizadas !== undefined ? Number(actualizadas) : undefined,
    };
  }

  const auditEventsWithFlags = useMemo(() =>
    auditEvents.map((event, i) => {
      if (i === 0) return { ...event, isRepeat: false };
      const prev = auditEvents[i - 1];
      const timeDiff = Math.abs(new Date(event.created_at).getTime() - new Date(prev.created_at).getTime());
      const isRepeat =
        event.action === prev.action &&
        event.entity_id === prev.entity_id &&
        timeDiff < 2 * 60 * 1000;
      return { ...event, isRepeat };
    }),
    [auditEvents]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return users
      .filter(
        (item) =>
          item.usuario.toLowerCase().includes(q) ||
          item.nombre_completo.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (a.activo === b.activo) return 0;
        return a.activo ? -1 : 1;
      });
  }, [users, search]);

  function openCreateModal() {
    setEditingUser(null);
    setForm(emptyUser);
    setShowModal(true);
  }

  function openEditModal(item: Usuario) {
    setEditingUser(item.usuario);
      setForm({
        usuario: item.usuario,
        nombre_completo: item.nombre_completo,
        rol: item.rol,
        modulos: item.modulos,
        permisos_edicion: item.permisos_edicion,
        action_permissions: item.action_permissions ?? {},
        password: "",
        activo: item.activo
      });
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingUser(null);
    setForm(emptyUser);
  }

  function toggleModulo(modulo: string, checked: boolean) {
    setForm((prev) => {
      const modulos = checked
        ? Array.from(new Set([...prev.modulos, modulo]))
        : prev.modulos.filter((item) => item !== modulo);
      const permisos_edicion = prev.permisos_edicion.filter((item) => modulos.includes(item));
      const action_permissions = { ...prev.action_permissions };
      if (checked) {
        action_permissions[modulo] = Array.from(new Set([...(action_permissions[modulo] ?? []), "view"]));
      } else {
        delete action_permissions[modulo];
      }
      return { ...prev, modulos, permisos_edicion, action_permissions };
    });
  }

  function toggleEdicion(modulo: string, canEdit: boolean) {
    setForm((prev) => {
      const nextActions = new Set(prev.action_permissions[modulo] ?? ["view"]);
      if (canEdit) {
        nextActions.add("create");
        nextActions.add("update");
        nextActions.add("delete");
      } else {
        nextActions.delete("create");
        nextActions.delete("update");
        nextActions.delete("delete");
      }

      const nextPermissions = {
        ...prev.action_permissions,
        [modulo]: Array.from(nextActions)
      };

      return {
        ...prev,
        permisos_edicion: canEdit
          ? Array.from(new Set([...prev.permisos_edicion, modulo]))
          : prev.permisos_edicion.filter((item) => item !== modulo),
        action_permissions: nextPermissions
      };
    });
  }

  function toggleAction(modulo: string, action: AppAction, checked: boolean) {
    setForm((prev) => {
      const current = new Set(prev.action_permissions[modulo] ?? ["view"]);
      if (checked) {
        current.add(action);
        current.add("view");
      } else if (action !== "view") {
        current.delete(action);
      }

      const nextPermissions = { ...prev.action_permissions, [modulo]: Array.from(current) };
      const permisos_edicion = Object.entries(nextPermissions)
        .filter(([, actions]) => actions.includes("create") || actions.includes("update") || actions.includes("delete"))
        .map(([moduleKey]) => moduleKey);

      return {
        ...prev,
        action_permissions: nextPermissions,
        permisos_edicion
      };
    });
  }

  function toggleApprove(modulo: string, canApprove: boolean) {
    toggleAction(modulo, "approve", canApprove);
  }

  async function saveUser(event: FormEvent) {
    event.preventDefault();

    const normalizedActionPermissions = Object.fromEntries(
      Object.entries(form.action_permissions).map(([modulo, actions]) => [
        modulo,
        APPROVAL_ENABLED_MODULES.has(modulo)
          ? actions
          : actions.filter((action) => action !== "approve")
      ])
    );

    const payload = {
      usuario: form.usuario,
      nombre_completo: form.nombre_completo,
      rol: form.rol,
      modulos: form.modulos,
      permisos_edicion: form.rol === "admin" ? [] : form.permisos_edicion,
      action_permissions: form.rol === "admin"
        ? Object.fromEntries(
            form.modulos.map((modulo) => [modulo, ["view", "create", "update", "delete", "export", "approve"]])
          )
        : normalizedActionPermissions,
      activo: form.activo,
      ...(editingUser ? {} : { password: form.password })
    };

    const path = editingUser ? `/api/usuarios/${encodeURIComponent(editingUser)}` : "/api/usuarios";
    const method = editingUser ? "PUT" : "POST";

    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const data = await response.json();
      window.alert(data.detail ?? "No fue posible guardar el usuario.");
      return;
    }

    if (editingUser && form.password) {
      await fetch(`/api/usuarios/${encodeURIComponent(form.usuario)}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.password })
      });
    }

    closeModal();
    void Promise.all([loadUsers(), loadAuditEvents(auditLimit), loadApprovalRequests()]);
  }

  async function deactivateUser(usuario: string) {
    const response = await fetch(`/api/usuarios/${encodeURIComponent(usuario)}`, { method: "DELETE" });
    if (!response.ok) {
      const data = await response.json();
      window.alert(data.detail ?? "No fue posible desactivar el usuario.");
      return;
    }
    void Promise.all([loadUsers(), loadAuditEvents(auditLimit), loadApprovalRequests()]);
  }

  async function reactivateUser(usuario: string) {
    const target = users.find((u) => u.usuario === usuario);
    if (!target) return;
    await fetch(`/api/usuarios/${encodeURIComponent(usuario)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usuario: target.usuario,
        nombre_completo: target.nombre_completo,
        rol: target.rol,
        modulos: target.modulos,
        permisos_edicion: target.permisos_edicion,
        action_permissions: target.action_permissions,
        activo: true
      })
    });
    void Promise.all([loadUsers(), loadAuditEvents(auditLimit), loadApprovalRequests()]);
  }

  async function confirmPermanentDelete() {
    if (!deleteTarget) return;
    const response = await fetch(`/api/usuarios/${encodeURIComponent(deleteTarget)}/permanent`, { method: "DELETE" });
    setDeleteTarget(null);
    if (!response.ok) {
      const data = await response.json();
      window.alert(data.detail ?? "No fue posible eliminar el usuario.");
      return;
    }
    void Promise.all([loadUsers(), loadAuditEvents(auditLimit), loadApprovalRequests()]);
  }

  async function reviewApproval(id: string, decision: "approve" | "reject") {
    setReviewingApprovalId(id);
    const response = await fetch(`/api/aprobaciones/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision })
    });
    setReviewingApprovalId(null);

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      window.alert(data.detail ?? "No fue posible revisar la solicitud.");
      return;
    }

    void Promise.all([loadUsers(), loadAuditEvents(auditLimit), loadApprovalRequests()]);
  }

  async function showMoreAudit() {
    if (auditLoadingMore || auditLimit >= 100) return;
    const next = Math.min(100, auditLimit + 10);
    setAuditLoadingMore(true);
    try {
      await loadAuditEvents(next);
      setAuditLimit(next);
    } finally {
      setAuditLoadingMore(false);
    }
  }

  if (loading) {
    return (
      <div className="module-page-standard">
        <ModuleHeader titulo="USUARIOS" subtitulo="// GESTION DE ACCESOS · PORTAL INTERNO" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => <KpiCardSkeleton key={`usuarios-kpi-skeleton-${index}`} />)}
        </div>
        <section className="module-toolbar module-toolbar--wide" style={{ alignItems: "center" }}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-9 flex-1" style={{ maxWidth: 320 }} />
          <Skeleton className="h-9 w-32" />
        </section>
        <section className="module-panel">
          <div className="module-panel-head">
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="p-5" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={`usuarios-row-skeleton-${index}`} className="h-10 w-full" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="module-page-standard">
      <AssistantShell
        title="Usuarios"
        contextBuilder={() =>
          JSON.stringify({
            total: users.length,
            por_rol: {
              admin: users.filter((item) => item.rol === "admin").length,
              gerencia: users.filter((item) => item.rol === "gerencia").length,
              directivo: users.filter((item) => item.rol === "directivo").length,
              operativo: users.filter((item) => item.rol === "operativo").length
            }
          })
        }
      />

      <ModuleHeader titulo="USUARIOS" subtitulo="// GESTION DE ACCESOS · PORTAL INTERNO" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {/* Usuarios totales — barra roja por defecto del sistema */}
        <div className="module-kpi-card">
          <p className="module-kpi__label">Usuarios totales</p>
          <p className="module-kpi__value">{users.length}</p>
          <p className="module-kpi__sub">Usuarios registrados</p>
        </div>
        {/* Activos — barra verde */}
        <div className="module-kpi-card module-kpi-card--green">
          <p className="module-kpi__label" style={{ color: "#2e8b7a" }}>Activos</p>
          <p className="module-kpi__value" style={{ color: "#2e8b7a" }}>{users.filter((item) => item.activo).length}</p>
          <p className="module-kpi__sub">Con acceso</p>
        </div>
        {/* Admins — barra roja del acento global (ya es la default) */}
        <div className="module-kpi-card">
          <p className="module-kpi__label">Admins</p>
          <p className="module-kpi__value" style={{ color: "#cc0000" }}>{users.filter((item) => item.rol === "admin").length}</p>
          <p className="module-kpi__sub">Administradores</p>
        </div>
        {/* Con acceso cartera — barra ámbar */}
        <div className="module-kpi-card module-kpi-card--amber">
          <p className="module-kpi__label" style={{ color: "#0077c8" }}>Con acceso cartera</p>
          <p className="module-kpi__value" style={{ color: "#0077c8" }}>{users.filter((item) => item.modulos.includes("cartera")).length}</p>
          <p className="module-kpi__sub">Módulo cartera</p>
        </div>
        <div className="module-kpi-card">
          <p className="module-kpi__label">Conectados ahora</p>
          <p className="module-kpi__value">{users.filter((item) => item.conectado_ahora).length}</p>
          <p className="module-kpi__sub">Sesiones activas</p>
        </div>
      </div>

      <section className="module-toolbar module-toolbar--wide">
        <div className="module-toolbar-label">Directorio operativo</div>
        <div className="module-search-wrap">
          <Search className="module-search-icon" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="module-search"
            placeholder="Buscar por nombre o usuario"
          />
        </div>
        <button type="button" onClick={openCreateModal} className="module-primary-btn">
          Nuevo usuario
        </button>
      </section>

      <section className="module-panel">
        <div className="module-panel-head">
          <div>
            <h3 className="module-section-title">Solicitudes de aprobacion</h3>
            <p className="module-panel-subtitle">
              Cambios sensibles enviados por usuarios para que administracion los apruebe o rechace.
            </p>
          </div>
        </div>
        <div className="p-5">
          {approvalRequests.length === 0 ? (
            <EmptyState message="Todavia no hay solicitudes de aprobacion." />
          ) : (
            <div className="module-table-wrap">
              <table className="module-table min-w-full">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Solicitante</th>
                    <th>Cambio</th>
                    <th>Estado</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {approvalRequests.map((item) => (
                    <tr key={item.id}>
                      <td style={{ whiteSpace: "nowrap" }}>{formatTimestamp(item.created_at)}</td>
                      <td>
                        <div className="font-medium">{item.requested_by_nombre || item.requested_by_usuario}</div>
                        <div className="text-xs text-[var(--module-muted)]">
                          @{item.requested_by_usuario}{item.requested_by_rol ? ` · ${item.requested_by_rol}` : ""}
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{item.summary}</div>
                        <div className="text-xs text-[var(--module-muted)]">
                          {item.module} · {item.entity_type} · {item.entity_id}
                        </div>
                      </td>
                      <td>
                        <span style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          padding: "3px 10px",
                          borderRadius: "20px",
                          fontSize: "0.65rem",
                          fontFamily: "var(--font-space-mono), monospace",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          ...(item.status === "approved"
                            ? { background: "rgba(46,139,122,0.12)", color: "#2e8b7a" }
                            : item.status === "rejected"
                            ? { background: "rgba(204,0,0,0.12)", color: "#cc0000" }
                            : { background: "rgba(245,158,11,0.12)", color: "#f59e0b" })
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td>
                        {item.status === "pending" ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            <button
                              type="button"
                              className="module-action-btn"
                              disabled={reviewingApprovalId === item.id}
                              onClick={() => void reviewApproval(item.id, "approve")}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                              <Check style={{ width: 13, height: 13 }} />
                              Aprobar
                            </button>
                            <button
                              type="button"
                              className="module-action-btn module-action-btn--danger"
                              disabled={reviewingApprovalId === item.id}
                              onClick={() => void reviewApproval(item.id, "reject")}
                              style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
                            >
                              <X style={{ width: 13, height: 13 }} />
                              Rechazar
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--module-muted)]">
                            {item.reviewed_by_usuario ? `Revisado por @${item.reviewed_by_usuario}` : "Revisado"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="module-panel">
        <div className="module-panel-head">
          <div>
            <h3 className="module-section-title">Directorio de accesos</h3>
            <p className="module-panel-subtitle">
              Listado operativo de usuarios del portal. El borrado es logico y se refleja como usuario inactivo.
            </p>
          </div>
        </div>
        <div className="p-5">
          {filtered.length === 0 ? (
            <EmptyState message="No hay usuarios que coincidan con la busqueda." />
          ) : (
            <div className="module-table-wrap">
              <table className="module-table min-w-full">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Rol</th>
                    <th>Modulos</th>
                    <th>Puede editar</th>
                    <th>Estado</th>
                    <th>Conexion</th>
                    <th>Ult. actividad</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const firstInactiveIndex = filtered.findIndex(u => !u.activo);
                    return filtered.map((item, index) => {
                    const isMe = item.usuario === currentUser;
                    const rolColors: Record<string, { bg: string; color: string }> = {
                      admin:     { bg: "rgba(204,0,0,0.1)",     color: "#cc0000" },
                      directivo: { bg: "rgba(0,119,200,0.1)",   color: "#0077c8" },
                      gerencia:  { bg: "rgba(100,60,180,0.1)",  color: "#6433b0" },
                      operativo: { bg: "rgba(130,130,127,0.1)", color: "#82827f" },
                    };
                    const rc = rolColors[item.rol] ?? rolColors.operativo;
                    const isHovered = hoveredRow === item.usuario;
                    return (
                      <Fragment key={item.usuario}>
                        {index === firstInactiveIndex && firstInactiveIndex > 0 && (
                          <tr>
                            <td colSpan={8} style={{ padding: "6px 8px 2px", borderTop: "1px solid var(--module-border)", background: "transparent" }}>
                              <span style={{ fontSize: "0.58rem", fontFamily: "var(--font-space-mono), monospace", fontWeight: 700, color: "var(--module-muted)", letterSpacing: "0.1em" }}>
                                INACTIVOS
                              </span>
                            </td>
                          </tr>
                        )}
                      <tr
                        onMouseEnter={() => setHoveredRow(item.usuario)}
                        onMouseLeave={() => setHoveredRow(null)}
                        style={{
                          transition: "background 0.15s",
                          ...(!item.activo
                            ? { opacity: 0.5 }
                            : isMe
                            ? { background: isHovered ? "rgba(46,139,122,0.08)" : "rgba(46,139,122,0.04)" }
                            : { background: isHovered ? "rgba(0,0,0,0.025)" : undefined })
                        }}
                      >
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
                              background: rc.bg,
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: "0.62rem", fontFamily: "var(--font-space-mono), monospace",
                              fontWeight: 700, color: rc.color
                            }}>
                              {getInitials(item.nombre_completo)}
                            </div>
                            <div>
                              <div className="font-medium" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                {item.nombre_completo}
                                {isMe && (
                                  <span style={{
                                    fontSize: "0.58rem", fontFamily: "var(--font-space-mono), monospace",
                                    fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                                    background: "rgba(46,139,122,0.12)", color: "#2e8b7a",
                                    letterSpacing: "0.06em", lineHeight: 1.6
                                  }}>
                                    TÚ
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-[var(--module-muted)]">@{item.usuario}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span style={{
                            display: "inline-block",
                            padding: "2px 9px",
                            borderRadius: "20px",
                            fontSize: "0.65rem",
                            fontFamily: "var(--font-space-mono), monospace",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            ...(item.rol === "admin"
                              ? { background: "rgba(204,0,0,0.1)", color: "#cc0000" }
                              : item.rol === "directivo"
                              ? { background: "rgba(0,119,200,0.1)", color: "#0077c8" }
                              : item.rol === "gerencia"
                              ? { background: "rgba(100,60,180,0.1)", color: "#6433b0" }
                              : { background: "rgba(130,130,127,0.1)", color: "#82827f" })
                          }}>
                            {item.rol}
                          </span>
                        </td>
                        <td style={{ maxWidth: "220px" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {item.modulos.slice(0, 3).map(m => (
                              <span key={m} style={{
                                background: "var(--module-surface-2)",
                                border: "1px solid var(--module-border)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "0.65rem",
                                fontFamily: "var(--font-space-mono), monospace",
                                color: "var(--module-text)",
                                whiteSpace: "nowrap"
                              }}>
                                {m}
                              </span>
                            ))}
                            {item.modulos.length > 3 && (
                              <span title={item.modulos.slice(3).join(", ")} style={{
                                background: "var(--module-surface-2)",
                                border: "1px solid var(--module-border)",
                                borderRadius: "4px",
                                padding: "2px 6px",
                                fontSize: "0.65rem",
                                fontFamily: "var(--font-space-mono), monospace",
                                color: "var(--module-muted)",
                                whiteSpace: "nowrap",
                                cursor: "default"
                              }}>
                                +{item.modulos.length - 3}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          {item.rol === "admin"
                            ? <span style={{ display: "inline-flex", background: "rgba(46,139,122,0.08)", border: "1px solid rgba(46,139,122,0.2)", borderRadius: "4px", padding: "2px 6px", color: "#2e8b7a", fontSize: "0.65rem", fontFamily: "var(--font-space-mono), monospace", fontWeight: 700 }}>todos</span>
                            : item.permisos_edicion.length
                              ? <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {item.permisos_edicion.map(m => (
                                    <span key={m} style={{
                                      background: "rgba(46,139,122,0.06)",
                                      border: "1px solid rgba(46,139,122,0.2)",
                                      borderRadius: "4px",
                                      padding: "2px 6px",
                                      fontSize: "0.65rem",
                                      fontFamily: "var(--font-space-mono), monospace",
                                      color: "#2e8b7a",
                                      whiteSpace: "nowrap"
                                    }}>
                                      {m}
                                    </span>
                                  ))}
                                </div>
                              : <span style={{ color: "var(--module-muted)", fontSize: "0.75rem" }}>solo lectura</span>
                          }
                        </td>
                        <td>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "0.65rem",
                            fontFamily: "var(--font-space-mono), monospace",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            ...(item.activo
                              ? { background: "rgba(46,139,122,0.12)", color: "#2e8b7a" }
                              : { background: "rgba(130,130,127,0.1)", color: "#82827f" })
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "999px", flexShrink: 0,
                              background: item.activo ? "#2e8b7a" : "#82827f"
                            }} />
                            {item.activo ? "Activo" : "Inactivo"}
                          </span>
                        </td>
                        <td>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "0.65rem",
                            fontFamily: "var(--font-space-mono), monospace",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            ...(item.conectado_ahora
                              ? { background: "rgba(0,119,200,0.12)", color: "#0077c8" }
                              : { background: "rgba(130,130,127,0.1)", color: "#82827f" })
                          }}>
                            <span style={{
                              width: 6, height: 6, borderRadius: "999px", flexShrink: 0,
                              background: item.conectado_ahora ? "#0077c8" : "#82827f"
                            }} />
                            {item.conectado_ahora ? "En linea" : "Sin sesion"}
                          </span>
                        </td>
                        <td style={{ minWidth: 145 }}>
                          {(() => {
                            const ts = item.ultima_actividad_at ?? item.ultimo_login_at ?? item.ultimo_logout_at;
                            const label = formatTimestamp(ts);
                            return (
                              <>
                                <div style={{ fontSize: "0.76rem", color: "var(--module-text)" }}>{label}</div>
                                {ts && (
                                  <div style={{ fontSize: "0.67rem", color: "var(--module-muted)" }}>
                                    {item.conectado_ahora ? "Ultima actividad" : "Ultimo movimiento"}
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <button
                              type="button"
                              className="module-action-btn"
                              onClick={() => openEditModal(item)}
                              title="Editar usuario"
                              style={{ padding: "5px 8px", display: "inline-flex", alignItems: "center" }}
                            >
                              <Pencil style={{ width: 13, height: 13 }} />
                            </button>
                            <span style={{ width: 1, height: 16, background: "var(--module-border)", flexShrink: 0 }} />
                            {item.activo ? (
                              <button
                                type="button"
                                className="module-action-btn module-action-btn--danger"
                                onClick={() => void deactivateUser(item.usuario)}
                                disabled={isMe}
                                title={isMe ? "No puedes desactivar tu propia cuenta" : "Desactivar"}
                                style={{ padding: "5px 8px", display: "inline-flex", alignItems: "center" }}
                              >
                                <UserX style={{ width: 13, height: 13 }} />
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="module-action-btn"
                                  onClick={() => void reactivateUser(item.usuario)}
                                  title="Reactivar"
                                  style={{ padding: "5px 8px", display: "inline-flex", alignItems: "center" }}
                                >
                                  <UserCheck style={{ width: 13, height: 13 }} />
                                </button>
                                <span style={{ width: 1, height: 16, background: "var(--module-border)", flexShrink: 0 }} />
                                <button
                                  type="button"
                                  className="module-action-btn module-action-btn--danger"
                                  onClick={() => setDeleteTarget(item.usuario)}
                                  title="Eliminar permanentemente"
                                  style={{ padding: "5px 8px", display: "inline-flex", alignItems: "center" }}
                                >
                                  <Trash2 style={{ width: 13, height: 13 }} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                      </Fragment>
                    );
                  });
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      <section className="module-panel">
        <div className="module-panel-head">
          <div>
            <h3 className="module-section-title">Auditoria reciente</h3>
            <p className="module-panel-subtitle">
              Historial de accesos y cambios operativos capturados por el sistema. Los registros se eliminan automaticamente despues de {auditRetentionDays} dias.
            </p>
          </div>
        </div>
        <div className="p-5">
          {auditEvents.length === 0 ? (
            <EmptyState message="Todavia no hay eventos de auditoria visibles." />
          ) : (
            <div className="module-table-wrap">
              <table className="module-table min-w-full">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Actor</th>
                    <th>Resumen</th>
                    <th>Fuente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEventsWithFlags.map((event) => {
                    const stats = parseSummaryStats(event.summary);
                    const summaryTitle = event.summary.replace(/,\s*\d+ listas.*$/, "").trim();
                    return (
                      <tr key={event.id} style={event.isRepeat ? { opacity: 0.5 } : undefined}>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <div>{formatTimestamp(event.created_at)}</div>
                          {event.isRepeat && (
                            <span style={{
                              display: "inline-block",
                              marginTop: 3,
                              padding: "1px 6px",
                              borderRadius: 4,
                              fontSize: "0.58rem",
                              fontFamily: "var(--font-space-mono), monospace",
                              fontWeight: 700,
                              background: "rgba(245,158,11,0.12)",
                              color: "#b45309",
                              letterSpacing: "0.04em"
                            }}>
                              REPETIDA
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="font-medium">{event.actor_nombre || event.actor_usuario || "Sistema"}</div>
                          <div className="text-xs text-[var(--module-muted)]">
                            @{event.actor_usuario || "system"}{event.actor_rol ? ` · ${event.actor_rol}` : ""}
                          </div>
                        </td>
                        <td>
                          <div className="font-medium">{summaryTitle}</div>
                          {stats ? (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {stats.listas !== undefined && (
                                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontFamily: "var(--font-space-mono), monospace", background: "var(--module-surface-2)", border: "1px solid var(--module-border)", color: "var(--module-muted)" }}>
                                  {stats.listas} listas
                                </span>
                              )}
                              {stats.rechazadas !== undefined && stats.rechazadas > 0 && (
                                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontFamily: "var(--font-space-mono), monospace", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.2)", color: "#b45309" }}>
                                  {stats.rechazadas} rechazadas
                                </span>
                              )}
                              {stats.creadas !== undefined && (
                                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontFamily: "var(--font-space-mono), monospace", ...(stats.creadas > 0 ? { background: "rgba(46,139,122,0.1)", border: "1px solid rgba(46,139,122,0.2)", color: "#2e8b7a" } : { background: "var(--module-surface-2)", border: "1px solid var(--module-border)", color: "var(--module-muted)" }) }}>
                                  {stats.creadas} nuevas
                                </span>
                              )}
                              {stats.actualizadas !== undefined && (
                                <span style={{ padding: "1px 6px", borderRadius: 4, fontSize: "0.62rem", fontFamily: "var(--font-space-mono), monospace", ...(stats.actualizadas > 0 ? { background: "rgba(0,119,200,0.1)", border: "1px solid rgba(0,119,200,0.2)", color: "#0077c8" } : { background: "var(--module-surface-2)", border: "1px solid var(--module-border)", color: "var(--module-muted)" }) }}>
                                  {stats.actualizadas} actualizadas
                                </span>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-[var(--module-muted)]">
                              {event.entity_type}{event.entity_id ? ` · ${event.entity_id}` : ""}{event.module ? ` · ${event.module}` : ""}
                            </div>
                          )}
                        </td>
                        <td style={{ textTransform: "uppercase", fontSize: "0.72rem" }}>{event.source}</td>
                        <td>
                          <span style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "3px 10px",
                            borderRadius: "20px",
                            fontSize: "0.65rem",
                            fontFamily: "var(--font-space-mono), monospace",
                            fontWeight: 700,
                            letterSpacing: "0.04em",
                            ...(event.status === "success"
                              ? { background: "rgba(46,139,122,0.12)", color: "#2e8b7a" }
                              : { background: "rgba(204,0,0,0.12)", color: "#cc0000" })
                          }}>
                            {event.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {auditLimit < 100 ? (
                <div style={{ display: "flex", justifyContent: "center", padding: "12px 0 4px" }}>
                  <button
                    type="button"
                    onClick={() => void showMoreAudit()}
                    disabled={auditLoadingMore}
                    className="module-secondary-btn"
                    style={{ fontSize: "0.72rem" }}
                  >
                    {auditLoadingMore ? "Cargando..." : `Ver mas antiguos (mostrando ${auditEvents.length})`}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      {/* Modal crear/editar usuario */}
      <div className={`module-modal-backdrop ${showModal ? "open" : ""}`}>
        <div className="module-modal">
          <div className="module-modal-head">
            <div>
              <div className="module-kicker">{editingUser ? "Editar acceso" : "Nuevo acceso"}</div>
              <h3 className="module-section-title">{editingUser ? "Editar usuario" : "Crear usuario"}</h3>
            </div>
            <button type="button" className="module-secondary-btn" onClick={closeModal}>
              Cerrar
            </button>
          </div>
          <div className="module-modal-body">
            <form onSubmit={saveUser} className="module-form-grid">
              <div className="module-form-field full">
                <label htmlFor="nombre_completo" style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600, fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "0.8rem", color: "var(--module-text)", display: "block", marginBottom: 6 }}>Nombre completo</label>
                <div style={{ position: "relative" }}>
                  <User style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="nombre_completo"
                    value={form.nombre_completo}
                    onChange={(event) => setForm((prev) => ({ ...prev, nombre_completo: event.target.value }))}
                    required
                    style={{ 
                      width: "100%", 
                      height: 42, 
                      padding: "8px 12px 8px 38px", 
                      borderRadius: 8, 
                      border: "1px solid var(--module-border)", 
                      background: "var(--module-surface)",
                      fontSize: "0.85rem",
                      color: "var(--module-text)",
                      outline: "none",
                      transition: "all 0.2s"
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--module-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(229,31,47,0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--module-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field">
                <label htmlFor="usuario" style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600, fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "0.8rem", color: "var(--module-text)", display: "block", marginBottom: 6 }}>Usuario</label>
                <div style={{ position: "relative" }}>
                  <AtSign style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="usuario"
                    value={form.usuario}
                    onChange={(event) => setForm((prev) => ({ ...prev, usuario: event.target.value }))}
                    required
                    style={{ 
                      width: "100%", 
                      height: 42, 
                      padding: "8px 12px 8px 38px", 
                      borderRadius: 8, 
                      border: "1px solid var(--module-border)", 
                      background: "var(--module-surface)",
                      fontSize: "0.85rem",
                      color: "var(--module-text)",
                      outline: "none",
                      transition: "all 0.2s"
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--module-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(229,31,47,0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--module-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>
              </div>
              <div className="module-form-field">
                <label htmlFor="rol" style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600, fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "0.8rem", color: "var(--module-text)", display: "block", marginBottom: 6 }}>Tipo de cuenta</label>
                <div style={{ position: "relative" }}>
                  <Shield style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)", pointerEvents: "none" }} />
                  <select
                    id="rol"
                    value={form.rol}
                    onChange={(event) => setForm((prev) => ({ ...prev, rol: event.target.value as AppRole }))}
                    style={{ 
                      width: "100%", 
                      height: 42, 
                      padding: "8px 12px 8px 38px", 
                      borderRadius: 8, 
                      border: "1px solid var(--module-border)", 
                      background: "var(--module-surface)",
                      fontSize: "0.85rem",
                      color: "var(--module-text)",
                      outline: "none",
                      transition: "all 0.2s",
                      appearance: "none"
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--module-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(229,31,47,0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--module-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  >
                    <option value="operativo">Operativo</option>
                    <option value="directivo">Directivo</option>
                    <option value="gerencia">Gerencia</option>
                    {currentUserRol === "admin" && (
                      <option value="admin">Admin</option>
                    )}
                  </select>
                  <div style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--module-muted)" }}><path d="m6 9 6 6 6-6"/></svg>
                  </div>
                </div>
              </div>
              <div className="module-form-field full">
                <label htmlFor="password" style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600, fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "0.8rem", color: "var(--module-text)", display: "block", marginBottom: 6 }}>Contraseña</label>
                <div style={{ position: "relative" }}>
                  <Lock style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 16, height: 16, color: "var(--module-muted)" }} />
                  <input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                    placeholder={editingUser ? "Opcional para resetearla" : "Obligatoria al crear"}
                    style={{ 
                      width: "100%", 
                      height: 42, 
                      padding: "8px 12px 8px 38px", 
                      borderRadius: 8, 
                      border: "1px solid var(--module-border)", 
                      background: "var(--module-surface)",
                      fontSize: "0.85rem",
                      color: "var(--module-text)",
                      outline: "none",
                      transition: "all 0.2s"
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "var(--module-accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(229,31,47,0.1)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "var(--module-border)"; e.currentTarget.style.boxShadow = "none"; }}
                  />
                </div>
                <div className="module-helper" style={{ marginTop: 6, textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-dm-sans), sans-serif" }}>
                  Si editas un usuario y escribes una nueva contraseña, se enviara un reset dedicado.
                </div>
              </div>

              {/* Módulos y permisos */}
              <div className="module-form-field full">
                <label style={{ textTransform: "none", letterSpacing: "normal", fontWeight: 600, fontFamily: "var(--font-dm-sans), sans-serif", fontSize: "0.8rem", color: "var(--module-text)", display: "block", marginBottom: 8 }}>Módulos y permisos</label>
                <div className="module-checkbox-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
                  {MODULOS_CONFIG.map(({ key, label, desc }) => {
                    const enabled = form.modulos.includes(key);
                    const canEdit = form.permisos_edicion.includes(key);
                    const actionPermissions = form.action_permissions[key] ?? ["view"];
                    const canApprove = actionPermissions.includes("approve");
                    const supportsApproval = APPROVAL_ENABLED_MODULES.has(key);
                    return (
                      <div key={key} className="module-checkbox-card" style={{ 
                        flexDirection: "column", 
                        alignItems: "flex-start", 
                        gap: 8,
                        borderColor: enabled ? "#2e8b7a" : "var(--module-border)",
                        background: enabled ? "rgba(46,139,122,0.03)" : "var(--module-surface-2)",
                        transition: "all 0.2s"
                      }}>
                        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", width: "100%", textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-dm-sans), sans-serif", color: "var(--module-text)" }}>
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(event) => toggleModulo(key, event.target.checked)}
                            style={{ marginTop: 2 }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <strong>{label}</strong>
                              {enabled && form.rol === "admin" && (
                                <span style={{ background: "rgba(46,139,122,0.1)", color: "#2e8b7a", padding: "2px 6px", borderRadius: 4, fontSize: "0.6rem", fontWeight: 700, fontFamily: "var(--font-space-mono), monospace" }}>
                                  ADMIN
                                </span>
                              )}
                            </div>
                            <div className="module-helper" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-dm-sans), sans-serif", marginTop: 2 }}>{desc}</div>
                          </div>
                        </label>
                        {enabled && form.rol !== "admin" && (
                          <div style={{ display: "grid", gap: 8, paddingLeft: 26, width: "100%" }}>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: supportsApproval ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
                                gap: 6,
                                width: "100%"
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleEdicion(key, false)}
                                style={{
                                  height: 38,
                                  padding: "0 10px",
                                  fontSize: "0.72rem",
                                  borderRadius: 10,
                                  background: !canEdit && !canApprove ? "rgba(46,139,122,0.1)" : "var(--module-surface)",
                                  color: !canEdit && !canApprove ? "#2e8b7a" : "var(--module-text)",
                                  fontWeight: !canEdit && !canApprove ? 700 : 500,
                                  border: !canEdit && !canApprove ? "1px solid rgba(46,139,122,0.28)" : "1px solid var(--module-border)",
                                  cursor: "pointer",
                                  transition: "all 0.2s"
                                }}
                              >
                                Solo ver
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleEdicion(key, true)}
                                style={{
                                  height: 38,
                                  padding: "0 10px",
                                  fontSize: "0.72rem",
                                  borderRadius: 10,
                                  background: canEdit ? "rgba(46,139,122,0.1)" : "var(--module-surface)",
                                  color: canEdit ? "#2e8b7a" : "var(--module-muted)",
                                  fontWeight: canEdit ? 700 : 500,
                                  border: canEdit ? "1px solid rgba(46,139,122,0.28)" : "1px solid var(--module-border)",
                                  cursor: "pointer",
                                  transition: "all 0.2s"
                                }}
                              >
                                Editar
                              </button>
                              {supportsApproval && (
                                <button
                                  type="button"
                                  onClick={() => toggleApprove(key, !canApprove)}
                                  style={{
                                    height: 38,
                                    padding: "0 10px",
                                    fontSize: "0.72rem",
                                    borderRadius: 10,
                                    background: canApprove ? "rgba(46,139,122,0.1)" : "var(--module-surface)",
                                    color: canApprove ? "#2e8b7a" : "var(--module-muted)",
                                    fontWeight: canApprove ? 700 : 500,
                                    border: canApprove ? "1px solid rgba(46,139,122,0.28)" : "1px solid var(--module-border)",
                                    cursor: "pointer",
                                    transition: "all 0.2s"
                                  }}
                                >
                                  Aprobar
                                </button>
                              )}
                            </div>
                            <div className="module-helper" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-dm-sans), sans-serif" }}>
                              {supportsApproval
                                ? "Editar agrupa cargar, modificar, eliminar y exportar. Aprobar habilita revisar solicitudes pendientes."
                                : "Editar agrupa cargar, modificar, eliminar y exportar."}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="module-form-field full">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 16, background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: 10 }}>
                  <div>
                    <strong style={{ color: "var(--module-text)", fontSize: "0.95rem" }}>Usuario activo</strong>
                    <div className="module-helper" style={{ textTransform: "none", letterSpacing: "normal", fontFamily: "var(--font-dm-sans), sans-serif", marginTop: 4 }}>
                      Si se desmarca, el usuario quedara bloqueado para iniciar sesion.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, activo: !prev.activo }))}
                    style={{
                      position: "relative",
                      width: 44,
                      height: 24,
                      borderRadius: 999,
                      background: form.activo ? "#2e8b7a" : "#ccc",
                      border: "none",
                      cursor: "pointer",
                      transition: "background 0.2s",
                      flexShrink: 0
                    }}
                  >
                    <span style={{
                      position: "absolute",
                      top: 2,
                      left: form.activo ? 22 : 2,
                      width: 20,
                      height: 20,
                      background: "#fff",
                      borderRadius: "50%",
                      transition: "left 0.2s",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.2)"
                    }} />
                  </button>
                </div>
              </div>
              <div className="module-modal-actions full col-span-full">
                <button type="button" className="module-secondary-btn" onClick={closeModal}>
                  Cancelar
                </button>
                <button type="submit" className="module-primary-btn">
                  Guardar usuario
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Modal confirmación eliminación permanente */}
      <div
        className={`module-modal-backdrop ${deleteTarget ? "open" : ""}`}
        onClick={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}
      >
        <div className="module-modal" style={{ maxWidth: 420 }}>
          <div className="module-modal-head">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <AlertTriangle style={{ width: 20, height: 20, color: "#cc0000", flexShrink: 0 }} />
              <div>
                <div className="module-kicker">Acción irreversible</div>
                <h3 className="module-section-title">Eliminar usuario permanentemente</h3>
              </div>
            </div>
          </div>
          <div className="module-modal-body">
            <p style={{ color: "var(--module-text)", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: 20 }}>
              ¿Estás seguro de que quieres eliminar a{" "}
              <strong>@{deleteTarget}</strong>?{" "}
              Esta acción <strong>NO se puede deshacer</strong>.
            </p>
            <div className="module-modal-actions full col-span-full">
              <button type="button" className="module-secondary-btn" onClick={() => setDeleteTarget(null)}>
                Cancelar
              </button>
              <button type="button" className="module-danger-btn" onClick={() => void confirmPermanentDelete()}>
                Eliminar definitivamente
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
