export const DIRECTORIO_ROLES = ["Cartera", "Operaciones"] as const;

export type DirectorioRol = (typeof DIRECTORIO_ROLES)[number];

export type DirectorioContacto = {
  id: string;
  directorio_id: number;
  rol: DirectorioRol;
  nombre: string;
  email: string;
  telefono: string;
  notas: string;
  created_at: string;
};

export type DirectorioContactosPorRol = {
  cartera: DirectorioContacto[];
  operaciones: DirectorioContacto[];
};

export type DirectorioAseguradora = {
  id: number;
  nombre: string;
  tipo: "ARL" | "Seguros" | "Salud" | string;
  notas_generales: string;
  link_pago: string;
  contactos: DirectorioContactosPorRol;
  legacy: {
    responsable: string;
    correos: string[];
    telefonos: string[];
    notas: string;
  };
};

export type DirectorioContactoInput = {
  id?: string;
  rol: DirectorioRol;
  nombre: string;
  email: string;
  telefono: string;
  notas: string;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

function normalizeTipo(value: unknown) {
  const tipo = cleanString(value).toLowerCase();
  if (tipo === "arl") return "ARL";
  if (tipo === "salud") return "Salud";
  if (tipo === "seguros" || !tipo) return "Seguros";
  return cleanString(value);
}

export function parseDirectorioRol(value: unknown): DirectorioRol {
  const normalized = cleanString(value).toLowerCase();
  if (normalized === "cartera") return "Cartera";
  if (normalized === "operaciones") return "Operaciones";
  throw new Error("Rol de contacto invalido");
}

export function emptyDirectorioContactosPorRol(): DirectorioContactosPorRol {
  return {
    cartera: [],
    operaciones: []
  };
}

export function normalizeDirectorioContactoRow(row: Record<string, unknown>): DirectorioContacto {
  return {
    id: cleanString(row.id),
    directorio_id: Number(row.directorio_id ?? 0),
    rol: parseDirectorioRol(row.rol),
    nombre: cleanString(row.nombre),
    email: cleanString(row.email),
    telefono: cleanString(row.telefono),
    notas: cleanString(row.notas),
    created_at: cleanString(row.created_at)
  };
}

export function buildContactosPorDirectorio(rows: Record<string, unknown>[]) {
  const grouped = new Map<number, DirectorioContactosPorRol>();

  rows
    .map(normalizeDirectorioContactoRow)
    .forEach((contacto) => {
      const entry = grouped.get(contacto.directorio_id) ?? emptyDirectorioContactosPorRol();
      if (contacto.rol === "Cartera") {
        entry.cartera.push(contacto);
      } else {
        entry.operaciones.push(contacto);
      }
      grouped.set(contacto.directorio_id, entry);
    });

  return grouped;
}

export function normalizeDirectorioRow(
  row: Record<string, unknown>,
  contactosMap: Map<number, DirectorioContactosPorRol>
): DirectorioAseguradora {
  const id = Number(row.id ?? 0);
  const tipo = normalizeTipo(row.tipo);

  return {
    id,
    nombre: cleanString(row.nombre),
    tipo,
    notas_generales: cleanString(row.notas),
    link_pago: cleanString(row.link_pago),
    contactos: contactosMap.get(id) ?? emptyDirectorioContactosPorRol(),
    legacy: {
      responsable: cleanString(row.responsable),
      correos: cleanList(row.correos),
      telefonos: cleanList(row.telefonos),
      notas: cleanString(row.notas)
    }
  };
}

export function normalizeDirectorioContactoInput(value: unknown): DirectorioContactoInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Contacto invalido");
  }

  const row = value as Record<string, unknown>;
  const nombre = cleanString(row.nombre);
  if (!nombre) {
    throw new Error("El nombre del contacto es obligatorio");
  }

  return {
    id: cleanString(row.id) || undefined,
    rol: parseDirectorioRol(row.rol),
    nombre,
    email: cleanString(row.email),
    telefono: cleanString(row.telefono),
    notas: cleanString(row.notas)
  };
}

export function normalizeDirectorioContactosInput(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => normalizeDirectorioContactoInput(item));
}
