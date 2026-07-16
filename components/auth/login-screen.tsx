"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { LoginForm } from "@/components/auth/login-form";

type ThemeName = "tema-claro" | "tema-medio" | "tema-oscuro";

type Particle = {
  x: number;
  y: number;
  r: number;
  a: number;
  s: number;
  gold: boolean;
};

const themeConfig: Record<
  ThemeName,
  {
    background: string;
    surface: string;
    border: string;
    text: string;
    muted: string;
    mutedStrong: string;
    gold: string;
    goldStrong: string;
    accent: string;
    green: string;
    darkPanel: string;
    darkPanelSoft: string;
    field: string;
    trust: string;
    footer: string;
  }
> = {
  "tema-claro": {
    background: "#f5f0e8",
    surface: "rgba(255,255,255,0.92)",
    border: "rgba(200,144,42,0.18)",
    text: "#1a1410",
    muted: "#666666",
    mutedStrong: "#4a4039",
    gold: "#c8902a",
    goldStrong: "#d4a040",
    accent: "#cc0000",
    green: "#16a34a",
    darkPanel: "#131313",
    darkPanelSoft: "#1d1d1d",
    field: "rgba(0,0,0,0.03)",
    trust: "rgba(200,144,42,0.04)",
    footer: "#6d6258"
  },
  "tema-oscuro": {
    background: "#080608",
    surface: "rgba(255,255,255,0.04)",
    border: "rgba(201,168,76,0.18)",
    text: "#f0ede8",
    muted: "#888888",
    mutedStrong: "#b5ada5",
    gold: "#c9a84c",
    goldStrong: "#e8c87a",
    accent: "#cc0000",
    green: "#00cc66",
    darkPanel: "#131313",
    darkPanelSoft: "#1d1d1d",
    field: "rgba(255,255,255,0.05)",
    trust: "rgba(255,255,255,0.03)",
    footer: "#9f988f"
  },
  "tema-medio": {
    background: "#1a0505",
    surface: "rgba(255,255,255,0.03)",
    border: "rgba(204,0,0,0.22)",
    text: "#f5e8e8",
    muted: "#9a6f6f",
    mutedStrong: "#d4b8b8",
    gold: "#cc0000",
    goldStrong: "#ff5a5a",
    accent: "#cc0000",
    green: "#cc4444",
    darkPanel: "#1a1010",
    darkPanelSoft: "#261717",
    field: "rgba(255,255,255,0.05)",
    trust: "rgba(204,0,0,0.06)",
    footer: "#c2a2a2"
  }
};

const dots: ThemeName[] = ["tema-claro", "tema-oscuro", "tema-medio"];

export function LoginScreen() {
  const [theme, setTheme] = useState<ThemeName>("tema-claro");
  const [clock, setClock] = useState("--:--:--");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const currentTheme = useMemo(() => themeConfig[theme], [theme]);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("cmm-tema");
    if (savedTheme === "tema-claro" || savedTheme === "tema-medio" || savedTheme === "tema-oscuro") {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.body.classList.remove("tema-claro", "tema-medio", "tema-oscuro");
    document.body.classList.add(theme);
    window.localStorage.setItem("cmm-tema", theme);
  }, [theme]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(
        2,
        "0"
      )}:${String(now.getSeconds()).padStart(2, "0")}`;
      setClock(time);
    };

    updateClock();
    const interval = window.setInterval(updateClock, 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    let animationFrame = 0;

    const createParticles = (width: number, height: number) =>
      Array.from({ length: 140 }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: Math.random() * 1.3 + 0.2,
        a: Math.random(),
        s: Math.random() * 0.004 + 0.001,
        gold: Math.random() < 0.2
      }));

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      particlesRef.current = createParticles(canvas.width, canvas.height);
    };

    const draw = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);

      for (const star of particlesRef.current) {
        star.a += star.s;
        if (star.a > 1 || star.a < 0) {
          star.s *= -1;
        }

        context.beginPath();
        context.arc(star.x, star.y, star.r, 0, Math.PI * 2);
        context.fillStyle = star.gold
          ? `rgba(200,144,42,${star.a * 0.45})`
          : `rgba(100,80,60,${star.a * 0.12})`;
        context.fill();
      }

      animationFrame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <main
      className="relative min-h-screen overflow-hidden transition-colors duration-300"
      style={{ backgroundColor: currentTheme.background, color: currentTheme.text }}
    >
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />

      <div
        className="absolute inset-0 z-0 opacity-80"
        style={{
          background:
            theme === "tema-claro"
              ? "radial-gradient(circle at 20% 20%, rgba(200,144,42,0.08), transparent 25%), radial-gradient(circle at 80% 10%, rgba(204,0,0,0.04), transparent 24%)"
              : "radial-gradient(circle at 18% 20%, rgba(201,168,76,0.12), transparent 23%), radial-gradient(circle at 82% 12%, rgba(204,0,0,0.08), transparent 24%)"
        }}
      />

      <header
        className="relative z-10 flex h-[60px] items-center justify-between border-b px-5 sm:px-8 lg:px-12"
        style={{ borderColor: currentTheme.border }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] border"
            style={{
              backgroundColor: "rgba(200,144,42,0.1)",
              borderColor: "rgba(200,144,42,0.25)"
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="6" rx="1.5" fill="rgba(200,144,42,0.8)" />
              <rect x="9" y="1" width="6" height="6" rx="1.5" fill="rgba(200,144,42,0.35)" />
              <rect x="1" y="9" width="6" height="6" rx="1.5" fill="rgba(200,144,42,0.35)" />
              <rect x="9" y="9" width="6" height="6" rx="1.5" fill="rgba(200,144,42,0.6)" />
            </svg>
          </div>
          <div className="font-mono text-sm font-bold tracking-[0.02em]">
            CM<span style={{ color: currentTheme.goldStrong }}>&amp;M</span>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className="hidden items-center gap-2 rounded-full border px-2.5 py-1 sm:flex"
            style={{
              backgroundColor: theme === "tema-claro" ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)",
              borderColor: theme === "tema-claro" ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.08)"
            }}
          >
            {dots.map((dot) => (
              <button
                key={dot}
                type="button"
                aria-label={`Cambiar a ${dot}`}
                onClick={() => setTheme(dot)}
                className="h-[13px] w-[13px] rounded-full border-[1.5px] transition hover:scale-110"
                style={{
                  backgroundColor: dot === "tema-claro" ? "#f0e8d8" : dot === "tema-oscuro" ? "#1a1a1a" : "#cc0000",
                  borderColor: theme === dot ? "rgba(255,255,255,0.65)" : "transparent",
                  boxShadow: theme === dot ? "0 0 8px currentColor" : "none"
                }}
              />
            ))}
          </div>

          <div
            className="hidden items-center gap-2 font-mono text-[11px] font-bold tracking-[0.05em] sm:flex"
            style={{ color: currentTheme.green }}
          >
            <span
              className="inline-block h-[6px] w-[6px] rounded-full"
              style={{ backgroundColor: "currentColor", boxShadow: "0 0 8px currentColor" }}
            />
            <span>SISTEMA ACTIVO</span>
            <span className="opacity-40">|</span>
            <span className="font-['Courier_New',monospace] text-[13px]">{clock}</span>
          </div>
        </div>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-120px)] flex-col justify-center gap-8 px-5 py-8 sm:px-8 lg:px-16 lg:py-0 xl:px-20">
        <div className="relative flex flex-col gap-10 lg:min-h-[calc(100vh-180px)] lg:flex-row lg:items-center lg:justify-between">
          <div className="relative z-10 flex-1 py-4 lg:max-w-[580px]">
            <div className="mb-4 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.1em]">
              <span className="inline-block h-px w-[22px]" style={{ backgroundColor: currentTheme.gold, opacity: 0.55 }} />
              <span style={{ color: currentTheme.gold }}>Portal de Gestión</span>
            </div>

            <h1 className="max-w-[580px] text-[2rem] font-bold leading-[1.1] sm:text-[2.375rem]">
              Control de comisiones, cartera <span style={{ color: currentTheme.gold }}>y facturación</span>
            </h1>

            <p className="mt-4 max-w-[480px] text-sm leading-7" style={{ color: currentTheme.muted }}>
              Centraliza el seguimiento operativo y financiero de CM&amp;M en un solo portal, con indicadores clave,
              trazabilidad histórica y acceso rápido a los módulos críticos.
            </p>

            <div className="mt-6 grid gap-3 lg:grid-cols-3">
              {[
                {
                  title: "Tablero unificado",
                  description: "KPIs de comisiones, cartera y facturación en una vista ejecutiva.",
                  icon: (
                    <path
                      d="M2 12L6 8l3 3 5-7"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )
                },
                {
                  title: "Seguimiento preciso",
                  description: "Consulta estados, proyecciones y movimientos con trazabilidad clara.",
                  icon: (
                    <>
                      <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M5 8h6M5 5h6M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </>
                  )
                },
                {
                  title: "Histórico activo",
                  description: "Acceso continuo a datos consolidados para decisión y control.",
                  icon: (
                    <>
                      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M8 5v3l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </>
                  )
                }
              ].map((feature) => (
                <article
                  key={feature.title}
                  className="rounded-[10px] border px-3 py-3.5 transition"
                  style={{
                    backgroundColor: "rgba(200,144,42,0.05)",
                    borderColor: currentTheme.border
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="flex h-[34px] w-[34px] items-center justify-center rounded-lg border"
                      style={{
                        backgroundColor: "rgba(200,144,42,0.12)",
                        borderColor: "rgba(200,144,42,0.2)",
                        color: currentTheme.gold
                      }}
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4 fill-none">
                        {feature.icon}
                      </svg>
                    </div>
                    <div>
                      <div className="text-[13px] font-bold" style={{ color: currentTheme.text }}>
                        {feature.title}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-[1.5]" style={{ color: currentTheme.muted }}>
                        {feature.description}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[248px] w-[420px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[18px] border shadow-[0_20px_56px_rgba(0,0,0,0.18),0_4px_16px_rgba(0,0,0,0.12)] lg:block"
            style={{
              opacity: 0.5,
              backgroundColor: "#111111",
              borderColor: "rgba(255,255,255,0.09)",
              transform: "translate(-50%, -50%) perspective(1200px) rotateY(-6deg) rotateX(2deg)"
            }}
          >
            <div
              className="flex h-[30px] items-center gap-1.5 border-b px-3.5"
              style={{
                background: "linear-gradient(180deg, rgba(36,36,36,0.96), rgba(24,24,24,0.96))",
                borderColor: "rgba(255,255,255,0.06)"
              }}
            >
              <span className="h-2 w-2 rounded-full bg-[#ff5f57]" />
              <span className="h-2 w-2 rounded-full bg-[#febc2e]" />
              <span className="h-2 w-2 rounded-full bg-[#28c840]" />
            </div>
            <div className="flex h-[calc(100%-30px)]">
              <div
                className="flex w-16 flex-col gap-[9px] border-r px-2.5 py-3.5"
                style={{
                  backgroundColor: "rgba(22,22,22,0.96)",
                  borderColor: "rgba(255,255,255,0.05)"
                }}
              >
                <div className="mb-1.5 h-[10px] w-[30px] rounded-full bg-white/15" />
                <div className="h-[7px] w-[72%] rounded-full bg-gradient-to-r from-[#d32f2f] to-[#c8902a]" />
                <div className="h-[7px] rounded-full bg-white/15" />
                <div className="h-[7px] rounded-full bg-white/15" />
                <div className="h-[7px] w-[58%] rounded-full bg-white/15" />
              </div>
              <div className="flex flex-1 flex-col gap-3 p-3.5">
                <div className="flex gap-2">
                  {[1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="flex h-[42px] flex-1 flex-col justify-between rounded-[10px] border p-2"
                      style={{
                        borderColor: "rgba(255,255,255,0.06)",
                        background: "linear-gradient(180deg, rgba(29,29,29,0.94), rgba(20,20,20,0.94))"
                      }}
                    >
                      <span className="h-[5px] w-1/2 rounded-full bg-white/15" />
                      <strong className="block h-2 w-[74%] rounded-full bg-cyan-400/70" />
                    </div>
                  ))}
                </div>
                <div className="flex min-h-0 flex-1 gap-3">
                  <div
                    className="relative flex flex-1 items-end gap-[5px] overflow-hidden rounded-xl border px-2.5 pb-2 pt-2.5"
                    style={{
                      borderColor: "rgba(255,255,255,0.05)",
                      background: "linear-gradient(180deg, rgba(26,26,26,0.98), rgba(18,18,18,0.96))"
                    }}
                  >
                    <div
                      className="absolute inset-x-2.5 bottom-2 top-2.5"
                      style={{
                        background:
                          "linear-gradient(to top, rgba(255,255,255,0.06) 1px, transparent 1px) 0 0 / 100% 24px"
                      }}
                    />
                    {[38, 54, 68, 50, 86, 62].map((height, index) => (
                      <div
                        key={height + index}
                        className="relative z-10 flex-1 rounded-t-[4px] bg-gradient-to-b from-emerald-400 to-cyan-400 opacity-80"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                  <div
                    className="flex w-[102px] shrink-0 flex-col items-center justify-center gap-2.5 rounded-xl border px-2 py-2.5"
                    style={{
                      borderColor: "rgba(255,255,255,0.05)",
                      background: "linear-gradient(180deg, rgba(24,24,24,0.96), rgba(18,18,18,0.96))"
                    }}
                  >
                    <div
                      className="relative h-[66px] w-[66px] rounded-full"
                      style={{
                        background:
                          "conic-gradient(#D32F2F 0% 42%, #22d3ee 42% 73%, #C8902A 73% 86%, #2a2a2a 87% 100%)"
                      }}
                    >
                      <span className="absolute left-1/2 top-1/2 h-[34px] w-[34px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#111]" />
                    </div>
                    <div className="flex w-full flex-col gap-1.5">
                      <span className="h-[5px] w-[78%] rounded-full bg-white/15" />
                      <span className="h-[5px] w-[62%] rounded-full bg-white/15" />
                      <span className="h-[5px] w-[48%] rounded-full bg-white/15" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-20 flex w-full justify-center lg:mr-10 lg:w-[340px] lg:shrink-0">
            <LoginForm theme={theme} />
          </div>
        </div>
      </section>

      <div
        className="relative z-10 flex flex-wrap items-center justify-center gap-3 border-y px-5 py-4 text-xs sm:gap-4 sm:px-8 lg:px-12"
        style={{
          backgroundColor: currentTheme.trust,
          borderColor: currentTheme.border,
          color: currentTheme.muted
        }}
      >
        {["Conexión segura HTTPS", "Autenticación JWT", "Datos cifrados en tránsito", "Acceso por roles"].map(
          (item, index) => (
            <div key={item} className="contents">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold"
                  style={{
                    backgroundColor: "rgba(39,174,96,0.12)",
                    color: theme === "tema-claro" ? "#27ae60" : currentTheme.green
                  }}
                >
                  ✓
                </span>
                <span>{item}</span>
              </div>
              {index < 3 ? <span className="hidden opacity-55 sm:inline">•</span> : null}
            </div>
          )
        )}
      </div>

      <footer className="relative z-10 flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] font-bold">
            CM<span style={{ color: currentTheme.goldStrong }}>&amp;M</span>
          </span>
          <span className="h-4 w-px" style={{ backgroundColor: currentTheme.border }} />
          <span className="text-xs font-semibold uppercase tracking-[0.1em]" style={{ color: currentTheme.footer }}>
            Portal de gestión interna
          </span>
        </div>
        <div className="text-xs" style={{ color: currentTheme.footer }}>
          © {new Date().getFullYear()}
        </div>
      </footer>
    </main>
  );
}
