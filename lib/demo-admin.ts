import type { AppAction, AppRole } from "@/lib/auth";
import type { DirectorioAseguradora, DirectorioContactoInput } from "@/lib/directorio";

type ActionPermissions = Record<string, AppAction[]>;

type DemoUser = {
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

type DemoAuditEvent = {
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

type DemoApprovalRequest = {
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

type DemoLinkPago = {
  id: number;
  aseguradora: string;
  url: string;
};

type DemoEmpresaContacto = {
  id: number;
  empresa: "SYSO" | "SANUM";
  nit: string;
  razon_social: string;
  nombre_contacto: string;
  cargo: string;
  telefono: string;
  email: string;
  observaciones: string;
  created_at: string;
};

const now = "2026-05-07T10:00:00.000Z";

let directorioData: DirectorioAseguradora[] = [
  {
    id: 1,
    nombre: "Arl Sura",
    tipo: "ARL",
    notas_generales: "Cuenta principal del demo con contacto de cartera y operaciones.",
    link_pago: "https://demo.portal/arl-sura",
    legacy: { responsable: "", correos: [], telefonos: [], notas: "" },
    contactos: {
      cartera: [
        { id: "dc-1", directorio_id: 1, rol: "Cartera", nombre: "Laura Perez", email: "cartera.arlsura@demo.com", telefono: "3001112233", notas: "", created_at: now }
      ],
      operaciones: [
        { id: "do-1", directorio_id: 1, rol: "Operaciones", nombre: "Santiago Ruiz", email: "ops.arlsura@demo.com", telefono: "3001112299", notas: "", created_at: now }
      ]
    }
  },
  {
    id: 2,
    nombre: "Colsanitas",
    tipo: "Salud",
    notas_generales: "Cliente salud del portafolio demo.",
    link_pago: "https://demo.portal/colsanitas",
    legacy: { responsable: "", correos: [], telefonos: [], notas: "" },
    contactos: {
      cartera: [
        { id: "dc-2", directorio_id: 2, rol: "Cartera", nombre: "Angela Soto", email: "pagos.colsanitas@demo.com", telefono: "3002223344", notas: "", created_at: now }
      ],
      operaciones: []
    }
  },
  {
    id: 3,
    nombre: "Seguros del Estado",
    tipo: "Seguros",
    notas_generales: "Incluye informacion de pagos y escalamiento.",
    link_pago: "https://demo.portal/seguros-estado",
    legacy: { responsable: "", correos: [], telefonos: [], notas: "" },
    contactos: {
      cartera: [
        { id: "dc-3", directorio_id: 3, rol: "Cartera", nombre: "Mateo Franco", email: "tesoreria@segurosestado.demo", telefono: "3003334455", notas: "", created_at: now }
      ],
      operaciones: [
        { id: "do-3", directorio_id: 3, rol: "Operaciones", nombre: "Sara Leon", email: "operaciones@segurosestado.demo", telefono: "3003334499", notas: "", created_at: now }
      ]
    }
  }
];

let linksPagoData: DemoLinkPago[] = [
  { id: 1, aseguradora: "Arl Sura", url: "https://demo.portal/arl-sura" },
  { id: 2, aseguradora: "Colsanitas", url: "https://demo.portal/colsanitas" },
  { id: 3, aseguradora: "Seguros del Estado", url: "https://demo.portal/seguros-estado" }
];

let empresasContactoData: DemoEmpresaContacto[] = [
  { id: 1, empresa: "SYSO", nit: "901555000", razon_social: "Transportes Andina", nombre_contacto: "Diana Castro", cargo: "Tesoreria", telefono: "3005556677", email: "tesoreria@transportesandina.demo", observaciones: "Cliente recurrente demo", created_at: now },
  { id: 2, empresa: "SYSO", nit: "900654321", razon_social: "Logistica del Norte", nombre_contacto: "Camilo Vega", cargo: "Coordinador SST", telefono: "3006547777", email: "sst@logisticanorte.demo", observaciones: "", created_at: now },
  { id: 3, empresa: "SANUM", nit: "890456789", razon_social: "Clinica Horizonte", nombre_contacto: "Paula Navas", cargo: "Compras", telefono: "3008882211", email: "compras@clinicahorizonte.demo", observaciones: "Cuenta estratégica demo", created_at: now },
  { id: 4, empresa: "SANUM", nit: "901009988", razon_social: "Fundacion Amanecer", nombre_contacto: "Julian Rojas", cargo: "Director Administrativo", telefono: "3007771122", email: "admin@fundacionamanecer.demo", observaciones: "", created_at: now }
];

let usersData: DemoUser[] = [
  {
    usuario: "demo.admin",
    nombre_completo: "Demo Portfolio",
    rol: "admin",
    modulos: ["resumen", "arl", "cartera", "seguros", "directorio", "analisis-cartera"],
    permisos_edicion: ["resumen", "arl", "cartera", "seguros", "directorio", "analisis-cartera"],
    action_permissions: {
      resumen: ["view", "create", "update", "delete", "export", "approve"],
      arl: ["view", "create", "update", "delete", "export", "approve"],
      cartera: ["view", "create", "update", "delete", "export", "approve"],
      seguros: ["view", "create", "update", "delete", "export", "approve"],
      directorio: ["view", "create", "update", "delete", "export", "approve"],
      "analisis-cartera": ["view", "create", "update", "delete", "export", "approve"]
    },
    activo: true,
    conectado_ahora: true,
    ultimo_login_at: now,
    ultima_actividad_at: now,
    ultimo_logout_at: null
  },
  {
    usuario: "gerencia.demo",
    nombre_completo: "Gerencia Demo",
    rol: "gerencia",
    modulos: ["resumen", "arl", "seguros", "cartera", "analisis-cartera"],
    permisos_edicion: ["cartera"],
    action_permissions: {
      resumen: ["view"],
      arl: ["view"],
      seguros: ["view"],
      cartera: ["view", "create", "update", "export", "approve"],
      "analisis-cartera": ["view"]
    },
    activo: true,
    conectado_ahora: false,
    ultimo_login_at: "2026-05-06T14:10:00.000Z",
    ultima_actividad_at: "2026-05-06T15:02:00.000Z",
    ultimo_logout_at: "2026-05-06T15:08:00.000Z"
  },
  {
    usuario: "operaciones.demo",
    nombre_completo: "Operaciones Demo",
    rol: "operativo",
    modulos: ["directorio", "cartera"],
    permisos_edicion: ["directorio"],
    action_permissions: {
      directorio: ["view", "create", "update", "delete"],
      cartera: ["view"]
    },
    activo: true,
    conectado_ahora: false,
    ultimo_login_at: "2026-05-05T09:10:00.000Z",
    ultima_actividad_at: "2026-05-05T11:42:00.000Z",
    ultimo_logout_at: "2026-05-05T11:50:00.000Z"
  }
];

let auditEventsData: DemoAuditEvent[] = [
  {
    id: "audit-1",
    created_at: "2026-05-07T09:42:00.000Z",
    actor_usuario: "demo.admin",
    actor_nombre: "Demo Portfolio",
    actor_rol: "admin",
    action: "update",
    entity_type: "factura",
    entity_id: "CMYM:FC-24039",
    module: "cartera",
    source: "web",
    status: "success",
    summary: "Actualizo la factura FC-24039 de CMYM"
  },
  {
    id: "audit-2",
    created_at: "2026-05-07T09:10:00.000Z",
    actor_usuario: "demo.admin",
    actor_nombre: "Demo Portfolio",
    actor_rol: "admin",
    action: "create",
    entity_type: "directorio",
    entity_id: "4",
    module: "directorio",
    source: "web",
    status: "success",
    summary: "Creo un registro demo en directorio"
  },
  {
    id: "audit-3",
    created_at: "2026-05-06T16:12:00.000Z",
    actor_usuario: "gerencia.demo",
    actor_nombre: "Gerencia Demo",
    actor_rol: "gerencia",
    action: "request_approval",
    entity_type: "approval_request",
    entity_id: "apr-1",
    module: "cartera",
    source: "web",
    status: "success",
    summary: "Solicito aprobacion para ajustar una factura de demo"
  }
];

let approvalRequestsData: DemoApprovalRequest[] = [
  {
    id: "apr-1",
    created_at: "2026-05-06T16:10:00.000Z",
    reviewed_at: null,
    requested_by_usuario: "gerencia.demo",
    requested_by_nombre: "Gerencia Demo",
    requested_by_rol: "gerencia",
    reviewed_by_usuario: null,
    module: "cartera",
    entity_type: "factura",
    entity_id: "CMYM:FC-24039",
    action: "update",
    status: "pending",
    summary: "Actualizar valor y observacion de factura demo",
    before_data: { empresa: "CMYM", numero_factura: "FC-24039", debito: 50120000 },
    after_data: { empresa: "CMYM", numero_factura: "FC-24039", debito: 50900000 }
  }
];

function buildContactRecord(directorioId: number, contact: DirectorioContactoInput, fallbackRole: "Cartera" | "Operaciones") {
  return {
    id: contact.id ?? `contact-${Math.random().toString(36).slice(2, 10)}`,
    directorio_id: directorioId,
    rol: contact.rol ?? fallbackRole,
    nombre: contact.nombre,
    email: contact.email,
    telefono: contact.telefono,
    notas: contact.notas,
    created_at: now
  };
}

export function listDemoDirectorio() {
  return directorioData.map((item) => ({
    ...item,
    contactos: {
      cartera: item.contactos.cartera.map((contacto) => ({ ...contacto })),
      operaciones: item.contactos.operaciones.map((contacto) => ({ ...contacto }))
    }
  }));
}

export function createDemoDirectorio(input: { nombre: string; tipo: string; notas: string; link_pago: string; contactos: DirectorioContactoInput[] }) {
  const nextId = directorioData.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const next: DirectorioAseguradora = {
    id: nextId,
    nombre: input.nombre,
    tipo: input.tipo,
    notas_generales: input.notas,
    link_pago: input.link_pago,
    legacy: { responsable: "", correos: [], telefonos: [], notas: input.notas },
    contactos: { cartera: [], operaciones: [] }
  };

  input.contactos.forEach((contact) => {
    if (contact.rol === "Cartera") next.contactos.cartera.push(buildContactRecord(nextId, contact, "Cartera"));
    else next.contactos.operaciones.push(buildContactRecord(nextId, contact, "Operaciones"));
  });

  directorioData = [...directorioData, next];
  return next;
}

export function updateDemoDirectorio(id: number, input: { nombre: string; tipo: string; notas: string; link_pago: string; contactos: DirectorioContactoInput[] }) {
  const current = directorioData.find((item) => item.id === id);
  if (!current) return null;

  const updated: DirectorioAseguradora = {
    ...current,
    nombre: input.nombre,
    tipo: input.tipo,
    notas_generales: input.notas,
    link_pago: input.link_pago,
    legacy: { ...current.legacy, notas: input.notas },
    contactos: { cartera: [], operaciones: [] }
  };

  input.contactos.forEach((contact) => {
    if (contact.rol === "Cartera") updated.contactos.cartera.push(buildContactRecord(id, contact, "Cartera"));
    else updated.contactos.operaciones.push(buildContactRecord(id, contact, "Operaciones"));
  });

  directorioData = directorioData.map((item) => (item.id === id ? updated : item));
  return updated;
}

export function deleteDemoDirectorio(id: number) {
  const before = directorioData.length;
  directorioData = directorioData.filter((item) => item.id !== id);
  return before !== directorioData.length;
}

export function listDemoLinksPago() {
  return linksPagoData.map((item) => ({ ...item }));
}

export function createDemoLinkPago(input: { aseguradora: string; url: string }) {
  const nextId = linksPagoData.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const created = { id: nextId, ...input };
  linksPagoData = [...linksPagoData, created];
  return created;
}

export function updateDemoLinkPago(id: number, input: { aseguradora: string; url: string }) {
  const current = linksPagoData.find((item) => item.id === id);
  if (!current) return null;
  const updated = { ...current, ...input };
  linksPagoData = linksPagoData.map((item) => (item.id === id ? updated : item));
  return updated;
}

export function deleteDemoLinkPago(id: number) {
  const before = linksPagoData.length;
  linksPagoData = linksPagoData.filter((item) => item.id !== id);
  return before !== linksPagoData.length;
}

export function listDemoEmpresasContacto(empresa: "SYSO" | "SANUM") {
  return empresasContactoData.filter((item) => item.empresa === empresa).map((item) => ({ ...item }));
}

export function createDemoEmpresaContacto(input: Omit<DemoEmpresaContacto, "id" | "created_at">) {
  const nextId = empresasContactoData.reduce((max, item) => Math.max(max, item.id), 0) + 1;
  const created: DemoEmpresaContacto = { id: nextId, created_at: now, ...input };
  empresasContactoData = [...empresasContactoData, created];
  return { ...created };
}

export function updateDemoEmpresaContacto(id: number, input: Omit<DemoEmpresaContacto, "id" | "created_at">) {
  const current = empresasContactoData.find((item) => item.id === id);
  if (!current) return null;
  const updated = { ...current, ...input };
  empresasContactoData = empresasContactoData.map((item) => (item.id === id ? updated : item));
  return { ...updated };
}

export function deleteDemoEmpresaContacto(id: number) {
  const before = empresasContactoData.length;
  empresasContactoData = empresasContactoData.filter((item) => item.id !== id);
  return before !== empresasContactoData.length;
}

export function listDemoUsers() {
  return usersData.map((item) => ({ ...item, modulos: [...item.modulos], permisos_edicion: [...item.permisos_edicion], action_permissions: { ...item.action_permissions } }));
}

export function createDemoUser(input: DemoUser) {
  if (usersData.some((item) => item.usuario === input.usuario)) return null;
  usersData = [...usersData, { ...input }];
  return { ...input };
}

export function updateDemoUser(currentUsuario: string, input: DemoUser) {
  const existing = usersData.find((item) => item.usuario === currentUsuario);
  if (!existing) return { type: "missing" as const };
  const duplicate = usersData.find((item) => item.usuario === input.usuario && item.usuario !== currentUsuario);
  if (duplicate) return { type: "duplicate" as const };
  usersData = usersData.map((item) => (item.usuario === currentUsuario ? { ...item, ...input } : item));
  return { type: "ok" as const, usuario: { ...usersData.find((item) => item.usuario === input.usuario)! } };
}

export function deactivateDemoUser(usuario: string) {
  const user = usersData.find((item) => item.usuario === usuario);
  if (!user) return false;
  user.activo = false;
  return true;
}

export function permanentlyDeleteDemoUser(usuario: string) {
  const before = usersData.length;
  usersData = usersData.filter((item) => item.usuario !== usuario);
  return before !== usersData.length;
}

export function resetDemoUserPassword(usuario: string) {
  return usersData.some((item) => item.usuario === usuario);
}

export function listDemoAuditEvents(limit: number) {
  return {
    eventos: auditEventsData.slice(0, limit).map((item) => ({ ...item })),
    retentionDays: 30
  };
}

export function listDemoApprovalRequests(limit: number) {
  return approvalRequestsData.slice(0, limit).map((item) => ({ ...item }));
}

export function reviewDemoApprovalRequest(id: string, decision: "approve" | "reject", reviewer: string) {
  const approval = approvalRequestsData.find((item) => item.id === id);
  if (!approval) return { type: "missing" as const };
  if (approval.status !== "pending") return { type: "conflict" as const };
  approval.status = decision === "approve" ? "approved" : "rejected";
  approval.reviewed_at = new Date().toISOString();
  approval.reviewed_by_usuario = reviewer;
  return { type: "ok" as const };
}
