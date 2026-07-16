"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";

type LoginResponse = {
  usuario: string;
  rol: "admin" | "arl" | "cartera" | "seguros" | "directorio";
};

type LoginTheme = "tema-claro" | "tema-medio" | "tema-oscuro";

function resolveTargetByRole(role: LoginResponse["rol"]) {
  if (role === "cartera") return "/cartera";
  if (role === "seguros") return "/seguros";
  if (role === "directorio") return "/directorio";
  return "/arl";
}

export function LoginForm({ theme = "tema-claro" }: { theme?: LoginTheme }) {
  const router = useRouter();
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const palette = useMemo(() => {
    if (theme === "tema-oscuro") {
      return {
        surface: "rgba(255,255,255,0.04)",
        border: "rgba(201,168,76,0.18)",
        text: "#f0ede8",
        muted: "#888888",
        muted2: "#555555",
        field: "rgba(255,255,255,0.05)",
        accent: "#cc0000"
      };
    }

    if (theme === "tema-medio") {
      return {
        surface: "rgba(255,255,255,0.03)",
        border: "rgba(204,0,0,0.22)",
        text: "#f5e8e8",
        muted: "#9a6f6f",
        muted2: "#6f4a4a",
        field: "rgba(255,255,255,0.05)",
        accent: "#cc0000"
      };
    }

    return {
      surface: "#ffffff",
      border: "rgba(200,144,42,0.18)",
      text: "#1a1410",
      muted: "#666666",
      muted2: "#aaaaaa",
      field: "rgba(0,0,0,0.03)",
      accent: "#cc0000"
    };
  }, [theme]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ usuario, password })
      });

      const data = await response.json();
      if (!response.ok) {
        setError(data.detail ?? "No fue posible iniciar sesión");
        return;
      }

      const payload = data as LoginResponse;
      router.push(resolveTargetByRole(payload.rol));
      router.refresh();
    } catch {
      setError("Error de red al iniciar sesión");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border px-7 pb-7 pt-8"
      style={{
        backgroundColor: palette.surface,
        borderColor: palette.border,
        boxShadow:
          theme === "tema-claro"
            ? "0 8px 40px rgba(0,0,0,0.09), 0 1px 4px rgba(0,0,0,0.05)"
            : "0 8px 48px rgba(0,0,0,0.55), 0 1px 6px rgba(0,0,0,0.25)"
      }}
    >
      <span
        className="absolute inset-x-0 top-0 h-[3px]"
        style={{ background: "linear-gradient(90deg, #cc0000 0%, #c8902a 100%)" }}
      />

      <div className="text-xl font-bold" style={{ color: palette.text }}>
        Acceso al Portal
      </div>
      <p className="mb-6 mt-1 text-[13px]" style={{ color: palette.muted }}>
        Ingresa tus credenciales para continuar
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="usuario"
            className="mb-1.5 block font-mono text-[10px] tracking-[0.1em]"
            style={{ color: palette.muted }}
          >
            USUARIO
          </label>
          <input
            id="usuario"
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            className="w-full rounded-lg border px-[14px] py-[11px] text-[14px] outline-none transition"
            style={{
              backgroundColor: palette.field,
              borderColor: palette.border,
              color: palette.text
            }}
            placeholder="tu usuario"
            autoComplete="username"
            required
          />
        </div>

        <div>
          <label
            htmlFor="password"
            className="mb-1.5 block font-mono text-[10px] tracking-[0.1em]"
            style={{ color: palette.muted }}
          >
            CONTRASEÑA
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="w-full rounded-lg border px-[14px] py-[11px] text-[14px] outline-none transition"
            style={{
              backgroundColor: palette.field,
              borderColor: palette.border,
              color: palette.text
            }}
            placeholder="••••••••"
            autoComplete="current-password"
            required
          />
        </div>

        {error ? (
          <div
            className="rounded-md border px-3.5 py-2.5 font-mono text-xs"
            style={{
              backgroundColor: "rgba(204,0,0,0.08)",
              borderColor: "rgba(204,0,0,0.22)",
              color: palette.accent
            }}
          >
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg border-0 px-4 py-[13px] font-mono text-[11px] tracking-[0.1em] text-white transition disabled:cursor-not-allowed disabled:opacity-65"
          style={{
            background: "linear-gradient(135deg, #cc0000 0%, #a80000 100%)",
            boxShadow: "0 6px 24px rgba(204,0,0,0.28)"
          }}
        >
          {pending ? "VERIFICANDO..." : "INGRESAR AL PORTAL →"}
        </button>

        <p className="text-center text-[11px]" style={{ color: palette.muted }}>
          Sesión válida por 8 horas
        </p>
      </form>
    </div>
  );
}
