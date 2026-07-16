"use client";

import "@/lib/modules/charts";

import { ArrowUpRight, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Bar } from "react-chartjs-2";

import { EmptyState } from "@/components/ui/dashboard-primitives";
import { formatCurrency } from "@/lib/modules/format";

const MONTHS_S = ["", "Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function formatMonthKeyLabel(key: string) {
  const [year, month] = key.split("-");
  const m = parseInt(month, 10);
  return MONTHS_S[m] ? `${MONTHS_S[m]} ${year?.slice(2) ?? ""}` : key;
}

type Tendencia = "subiendo" | "bajando" | "estable" | "nuevo";

type ClienteRow = {
  cliente: string;
  total: number;
  participacion: number;
  tendencia: Tendencia;
  por_mes: Record<string, number>;
};

export type AportesData = {
  cutoff_label: string | null;
  meses_disponibles: string[];
  total_general: number;
  total_clientes: number;
  top_10: ClienteRow[];
  todos_clientes: ClienteRow[];
};

type RecaudoLike = {
  compania?: string | null;
  pagado?: number | null;
  fecha_pago?: string | null;
  estado?: string | null;
  empresa?: string | null;
};

function monthKeyFromRaw(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const iso = raw.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.slice(0, 7);
  const slash = raw.split("/");
  if (slash.length === 3) {
    const [day, month, year] = slash;
    if (year && month && day) return `${year}-${String(month).padStart(2, "0")}`;
  }
  const dash = raw.split("-");
  if (dash.length === 3 && dash[0].length === 2) {
    const [, month, year] = dash;
    if (year && month) return `${year}-${String(month).padStart(2, "0")}`;
  }
  return null;
}

function calcularTendencia(porMes: Record<string, number>): Tendencia {
  const months = Object.keys(porMes).sort();
  if (months.length < 2) return "nuevo";
  const current = months.slice(-3);
  const previous = months.slice(-6, -3);
  if (current.length === 0 || previous.length === 0) return "nuevo";
  const curAvg = current.reduce((s, m) => s + (porMes[m] ?? 0), 0) / current.length;
  const prevAvg = previous.reduce((s, m) => s + (porMes[m] ?? 0), 0) / previous.length;
  if (prevAvg === 0) return curAvg > 0 ? "subiendo" : "nuevo";
  if (curAvg > prevAvg * 1.1) return "subiendo";
  if (curAvg < prevAvg * 0.9) return "bajando";
  return "estable";
}

// Calcula aportes por cliente (modo pago) en el cliente, a partir de los recaudos ya cargados.
export function computeAportesClientes(recaudos: RecaudoLike[], empresa: string): AportesData {
  const monthSet = new Set<string>();
  const grouped = new Map<string, Record<string, number>>();

  for (const r of recaudos) {
    if (String(r.estado ?? "").trim().toUpperCase() === "ANULADA") continue;
    if (empresa !== "TODAS" && String(r.empresa ?? "").trim().toUpperCase() !== empresa) continue;
    const cliente = String(r.compania ?? "").trim().replace(/\s+/g, " ");
    if (!cliente) continue;
    const mk = monthKeyFromRaw(r.fecha_pago);
    if (!mk) continue;
    const value = Math.max(0, Number(r.pagado ?? 0));
    if (value <= 0) continue;
    monthSet.add(mk);
    const cur = grouped.get(cliente) ?? {};
    cur[mk] = (cur[mk] ?? 0) + value;
    grouped.set(cliente, cur);
  }

  const totals = [...grouped.entries()].map(([cliente, por_mes]) => ({
    cliente,
    por_mes,
    total: Object.values(por_mes).reduce((s, v) => s + v, 0)
  }));
  const totalGeneral = totals.reduce((s, i) => s + i.total, 0);

  const todos: ClienteRow[] = totals
    .map((item) => ({
      cliente: item.cliente,
      total: Math.round(item.total),
      participacion: totalGeneral > 0 ? Number(((item.total / totalGeneral) * 100).toFixed(1)) : 0,
      tendencia: calcularTendencia(item.por_mes),
      por_mes: Object.fromEntries(
        Object.entries(item.por_mes).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => [m, Math.round(v)])
      )
    }))
    .sort((a, b) => b.total - a.total || a.cliente.localeCompare(b.cliente, "es"));

  return {
    cutoff_label: null,
    meses_disponibles: [...monthSet].sort(),
    total_general: Math.round(totalGeneral),
    total_clientes: todos.length,
    top_10: todos.slice(0, 10),
    todos_clientes: todos
  };
}

function getTendenciaMeta(tendencia: Tendencia) {
  if (tendencia === "subiendo") return { icon: <TrendingUp size={14} />, color: "#2e8b7a", bg: "rgba(46,139,122,.12)", label: "Subiendo" };
  if (tendencia === "bajando") return { icon: <TrendingDown size={14} />, color: "#cc0000", bg: "rgba(204,0,0,.1)", label: "Bajando" };
  if (tendencia === "nuevo") return { icon: <ArrowUpRight size={14} />, color: "#0077c8", bg: "rgba(0,119,200,.12)", label: "Nuevo" };
  return { icon: <Minus size={14} />, color: "#82827f", bg: "rgba(130,130,127,.12)", label: "Estable" };
}

export function CarteraAportesTab({ data }: { data: AportesData }) {
  const [verTodos, setVerTodos] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState("");

  useEffect(() => {
    setSelectedCliente((current) => {
      if (current && data.todos_clientes.some((c) => c.cliente === current)) return current;
      return data.top_10[0]?.cliente ?? "";
    });
  }, [data]);

  const top10Participacion = useMemo(() => {
    if (data.total_general <= 0) return "0.0";
    const sumTop = data.top_10.reduce((s, r) => s + r.total, 0);
    return (sumTop / data.total_general * 100).toFixed(1);
  }, [data]);

  const selectedChart = useMemo(() => {
    if (!selectedCliente) return null;
    const cliente = data.todos_clientes.find((c) => c.cliente === selectedCliente);
    if (!cliente) return null;
    const meses = data.meses_disponibles.length > 0 ? data.meses_disponibles : Object.keys(cliente.por_mes).sort();
    return {
      cliente: cliente.cliente,
      labels: meses.map(formatMonthKeyLabel),
      values: meses.map((m) => Math.round(cliente.por_mes[m] ?? 0))
    };
  }, [data, selectedCliente]);

  if (data.todos_clientes.length === 0) return <EmptyState message="No hay aportes por cliente para la empresa seleccionada." />;

  const filas = verTodos ? data.todos_clientes : data.top_10;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
      <p style={{ fontSize: ".8rem", color: "#82827f", fontFamily: "DM Sans,sans-serif", margin: 0 }}>
        Quién aporta más al recaudo y cómo viene su tendencia. Calculado sobre pagos registrados.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: "14px" }}>
        <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #2e8b7a" }}>
          <p className="module-kpi__label">Total Clientes</p>
          <p className="module-kpi__value">{data.total_clientes.toLocaleString("es-CO")}</p>
          <p className="module-kpi__sub">clientes activos en el período</p>
        </section>
        <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #0077c8" }}>
          <p className="module-kpi__label">Cliente Top</p>
          <p className="module-kpi__value" style={{ fontSize: "1.08rem", lineHeight: 1.25, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {data.top_10[0]?.cliente ?? "—"}
          </p>
          <p className="module-kpi__sub">{formatCurrency(data.top_10[0]?.total ?? 0)}</p>
        </section>
        <section className="module-card module-kpi module-card--plain" style={{ borderTop: "3px solid #d97706" }}>
          <p className="module-kpi__label">Concentración Top 10</p>
          <p className="module-kpi__value">{top10Participacion}%</p>
          <p className="module-kpi__sub">sobre {formatCurrency(data.total_general)}</p>
        </section>
      </div>

      <div style={{ background: "var(--module-surface)", border: "1px solid var(--module-border)", borderRadius: "14px", padding: "18px 20px", boxShadow: "0 1px 2px rgba(0,0,0,.03), 0 10px 28px rgba(0,0,0,.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px", gap: "12px", flexWrap: "wrap" }}>
          <span style={{ fontFamily: "Space Mono,monospace", fontSize: ".74rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
            {verTodos ? `Todos los clientes (${data.todos_clientes.length})` : "Top 10 clientes"}
          </span>
          {data.todos_clientes.length > 10 && (
            <button type="button" onClick={() => setVerTodos((v) => !v)} style={{ background: "var(--module-surface-2)", border: "1px solid var(--module-border)", borderRadius: "6px", padding: "5px 11px", color: "#82827f", fontFamily: "DM Sans,sans-serif", fontSize: ".74rem", cursor: "pointer" }}>
              {verTodos ? "Ver solo top 10" : "Ver todos"}
            </button>
          )}
        </div>
        <div className="module-table-wrap" style={{ overflowX: "auto" }}>
          <table className="module-table" style={{ width: "100%", minWidth: "540px" }}>
            <colgroup>
              <col style={{ width: "40px" }} />
              <col />
              <col style={{ width: "150px" }} />
              <col style={{ width: "90px" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead>
              <tr>
                <th style={{ textAlign: "center" }}>#</th>
                <th style={{ textAlign: "left" }}>Cliente</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th style={{ textAlign: "right" }}>% Part.</th>
                <th style={{ textAlign: "center" }}>Tendencia</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((row, i) => {
                const meta = getTendenciaMeta(row.tendencia);
                const isActive = selectedCliente === row.cliente;
                return (
                  <tr key={row.cliente} onClick={() => setSelectedCliente(row.cliente)} style={{ cursor: "pointer", background: isActive ? "var(--module-surface-2)" : undefined }}>
                    <td style={{ textAlign: "center", color: "#82827f", fontFamily: "Space Mono,monospace", fontSize: ".75rem" }}>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: isActive ? "#cc0000" : "var(--module-text)" }}>{row.cliente}</td>
                    <td style={{ textAlign: "right", fontFamily: "DM Sans,sans-serif", fontWeight: 600 }}>{formatCurrency(row.total)}</td>
                    <td style={{ textAlign: "right", color: "#82827f" }}>{row.participacion.toFixed(1)}%</td>
                    <td style={{ textAlign: "center" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: meta.bg, color: meta.color, borderRadius: "20px", padding: "3px 10px", fontSize: ".68rem", fontWeight: 700, fontFamily: "DM Sans,sans-serif" }}>
                        {meta.icon} {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {selectedChart && (
          <div style={{ marginTop: "18px", paddingTop: "18px", borderTop: "1px solid var(--module-border)" }}>
            <div style={{ fontFamily: "Space Mono,monospace", fontSize: ".72rem", fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", marginBottom: "12px" }}>
              Historial mensual · {selectedChart.cliente}
            </div>
            <div style={{ position: "relative", height: "220px" }}>
              <Bar
                data={{
                  labels: selectedChart.labels,
                  datasets: [{ label: selectedChart.cliente, data: selectedChart.values, backgroundColor: "rgba(0,119,200,.68)", borderColor: "#0077c8", borderWidth: 1, borderRadius: 4 }]
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: (context) => ` ${formatCurrency(context.raw as number)}` } }
                  },
                  scales: {
                    x: { grid: { display: false }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 } } },
                    y: { grid: { color: "rgba(224,217,208,.4)" }, ticks: { color: "#82827f", font: { family: "Space Mono", size: 9 }, callback: (value) => `$${(Number(value) / 1e6).toFixed(0)}M` } }
                  }
                }}
              />
            </div>
            <p style={{ fontSize: ".7rem", color: "#82827f", fontFamily: "DM Sans,sans-serif", marginTop: "8px", marginBottom: 0 }}>Clic en cualquier cliente de la tabla para ver su historial.</p>
          </div>
        )}
      </div>
    </div>
  );
}
