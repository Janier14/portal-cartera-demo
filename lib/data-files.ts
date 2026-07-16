import { promises as fs } from "fs";
import path from "path";

const STATIC_DIR = path.resolve(process.cwd(), "data");

async function readJsonFile<T>(filename: string): Promise<T> {
  const fullPath = path.join(STATIC_DIR, filename);
  const content = await fs.readFile(fullPath, "utf8");
  return JSON.parse(content) as T;
}

export function readArlData() {
  return readJsonFile("datos_arl.json");
}

export function readSegurosData() {
  return readJsonFile("datos_seguros.json");
}

export function readCarteraProjection() {
  return readJsonFile("proyeccion_cartera.json");
}
