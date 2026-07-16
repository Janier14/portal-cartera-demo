import { NextResponse } from "next/server";

import { isPortfolioDemoMode } from "@/lib/env";
import { requireSession, unauthorizedResponse } from "@/lib/auth";
import { createServerSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChatMessage = {
  role: string;
  parts: Array<{ text: string }>;
};

type ChatRequest = {
  contexto: string;
  systemInstruction?: string;
  pregunta: string;
  historial: ChatMessage[];
};

type ValidationResult =
  | { ok: true }
  | { ok: false; status: 400 | 413; usageStatus: "blocked" | "too_long"; message: string };

type RateLimitResult = {
  allowed: boolean;
  retryAfterMinutes: number;
};

type UsageStatus = "ok" | "rate_limited" | "too_long" | "timeout" | "error" | "blocked";

type UsageLogInput = {
  usuario: string;
  promptChars: number;
  responseChars: number | null;
  durationMs: number;
  status: UsageStatus;
  errorMessage?: string | null;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
};

const GEMINI_TIMEOUT_MS = 30_000;
const MAX_PREGUNTA_CHARS = 2_000;
const MAX_CONTEXTO_CHARS = 40_000;
const MAX_HISTORIAL_MESSAGES = 30;
const HOURLY_LIMIT = 20;
const DAILY_LIMIT = 100;
const BLOCKED_PATTERNS = [
  "ignore previous instructions",
  "ignora instrucciones anteriores",
  "system:",
  "act as",
  "actúa como",
  "you are now",
  "ahora eres",
  "disregard",
  "override"
] as const;

function getPromptChars(body: ChatRequest): number {
  const historialChars = Array.isArray(body.historial)
    ? body.historial.reduce((total, message) => {
      const firstText = Array.isArray(message.parts) ? message.parts[0]?.text : "";
      return total + (typeof firstText === "string" ? firstText.length : 0);
    }, 0)
    : 0;

  return body.pregunta.length + body.contexto.length + (body.systemInstruction?.length ?? 0) + historialChars;
}

function validateInput(body: ChatRequest): ValidationResult {
  if (typeof body.pregunta !== "string" || typeof body.contexto !== "string" || !Array.isArray(body.historial)) {
    return { ok: false, status: 400, usageStatus: "blocked", message: "Mensaje no válido" };
  }

  if (body.systemInstruction !== undefined && typeof body.systemInstruction !== "string") {
    return { ok: false, status: 400, usageStatus: "blocked", message: "Mensaje no válido" };
  }

  if (body.pregunta.length > MAX_PREGUNTA_CHARS) {
    return {
      ok: false,
      status: 413,
      usageStatus: "too_long",
      message: `La pregunta supera el límite de ${MAX_PREGUNTA_CHARS} caracteres.`
    };
  }

  if (body.contexto.length > MAX_CONTEXTO_CHARS) {
    return {
      ok: false,
      status: 413,
      usageStatus: "too_long",
      message: `El contexto supera el límite de ${MAX_CONTEXTO_CHARS} caracteres.`
    };
  }

  if (body.historial.length > MAX_HISTORIAL_MESSAGES) {
    return {
      ok: false,
      status: 413,
      usageStatus: "too_long",
      message: `El historial supera el límite de ${MAX_HISTORIAL_MESSAGES} mensajes.`
    };
  }

  const combinedText = [body.pregunta, body.contexto, body.systemInstruction ?? ""]
    .concat(
      body.historial.flatMap((message) =>
        Array.isArray(message.parts)
          ? message.parts.map((part) => (typeof part?.text === "string" ? part.text : ""))
          : []
      )
    )
    .join("\n")
    .toLowerCase();

  const hasBlockedPattern = BLOCKED_PATTERNS.some((pattern) => combinedText.includes(pattern.toLowerCase()));
  if (hasBlockedPattern) {
    return { ok: false, status: 400, usageStatus: "blocked", message: "Mensaje no válido" };
  }

  return { ok: true };
}

function minutesUntil(date: Date, durationMs: number): number {
  const diffMs = date.getTime() + durationMs - Date.now();
  if (diffMs <= 0) return 1;
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

async function checkRateLimit(usuario: string): Promise<RateLimitResult> {
  const supabase = createServerSupabase();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("chat_usage")
    .select("created_at")
    .eq("usuario", usuario)
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`RATE_LIMIT_CHECK_FAILED: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ created_at: string | null }>;
  const now = Date.now();
  const lastHourRows = rows.filter((row) => {
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    return now - createdAt < 60 * 60 * 1000;
  });

  const hourExceeded = lastHourRows.length >= HOURLY_LIMIT;
  const dayExceeded = rows.length >= DAILY_LIMIT;

  if (!hourExceeded && !dayExceeded) {
    return { allowed: true, retryAfterMinutes: 0 };
  }

  const hourlyRetry = hourExceeded && lastHourRows[0]?.created_at
    ? minutesUntil(new Date(lastHourRows[0].created_at), 60 * 60 * 1000)
    : 0;
  const dailyRetry = dayExceeded && rows[0]?.created_at
    ? minutesUntil(new Date(rows[0].created_at), 24 * 60 * 60 * 1000)
    : 0;

  return {
    allowed: false,
    retryAfterMinutes: Math.max(hourlyRetry, dailyRetry, 1)
  };
}

async function logUsage(input: UsageLogInput): Promise<void> {
  try {
    const supabase = createServerSupabase();
    const { error } = await supabase.from("chat_usage").insert({
      usuario: input.usuario,
      prompt_chars: input.promptChars,
      response_chars: input.responseChars,
      duration_ms: input.durationMs,
      status: input.status,
      error_message: input.errorMessage ?? null
    });

    if (error) {
      console.error("chat_usage insert failed", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        input
      });
    }
  } catch (error) {
    console.error("chat_usage insert threw", {
      error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error,
      input
    });
  }
}

function buildContents(body: ChatRequest) {
  return [
    ...body.historial
      .filter((message) => Array.isArray(message.parts) && typeof message.parts[0]?.text === "string" && message.parts[0].text.trim())
      .map((message) => ({
        role: message.role === "user" ? "user" : "model",
        parts: [{ text: message.parts[0].text }]
      })),
    {
      role: "user",
      parts: [{ text: body.pregunta }]
    }
  ];
}

function buildSystemInstruction(body: ChatRequest): string {
  const moduleInstruction = typeof body.systemInstruction === "string" && body.systemInstruction.trim()
    ? `${body.systemInstruction.trim()}\n\n`
    : "";

  return `Eres el asistente de una demo publica de analitica operativa y comercial.
Responde en español, con tono profesional, claro y conciso.
Usa formato colombiano para dinero.
Si algo no está en los datos, dilo claramente.

${moduleInstruction}

DATOS ACTUALES DEL DASHBOARD:
${body.contexto}

REGLAS DE FORMATO PARA EL ASISTENTE:
1. NUNCA uses Markdown. No uses asteriscos dobles, guiones bajos, almohadillas, ni ningun simbolo de formato para resaltar texto.
2. Para resaltar valores monetarios o datos importantes, escribelos directamente sin decoracion. Ejemplo correcto: "El total es 258.689 pesos". Ejemplo incorrecto: "El total es 258.689 pesos" con asteriscos alrededor.
3. Cuando listes varios items como facturas, clientes o contactos, usa una linea por item con un guion simple al inicio. Ejemplo:
   - Factura 1258 por 258.689
   - Factura 1268 por 358.678
   - Factura 1858 por 261.689
4. Usa SIEMPRE saltos de linea reales entre secciones. Cada item de una lista va en su propia linea (un solo \n entre items, dos \n entre secciones).
5. Cuando respondas comparativos por anios o por periodos, estructura asi: una linea de titulo en mayusculas (ejemplo: "ANIO 2024") seguida de las metricas con un guion al inicio cada una, y deja una linea en blanco antes del siguiente periodo. Ejemplo:
   ANIO 2024
   - Comision total: 1.000.000.000 pesos
   - Cotizacion total: 12.000.000.000 pesos
   - Empresas: 100

   ANIO 2025
   - Comision total: 1.100.000.000 pesos
   - Cotizacion total: 13.000.000.000 pesos
   - Empresas: 110
6. Se directo y conciso. Evita preambulos como "Claro, aqui tienes" o "Por supuesto".
7. Usa formato de moneda colombiano con puntos como separador de miles: 1.234.567
8. Si te preguntan algo que no esta en el contexto, di simplemente "No tengo esa informacion disponible".
9. Responde siempre en español.`;
}

async function openGeminiStream(body: ChatRequest, apiKey: string, signal: AbortSignal): Promise<Response> {
  return fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildSystemInstruction(body) }]
        },
        contents: buildContents(body),
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.7,
          topP: 0.95
        }
      }),
      signal
    }
  );
}

export async function POST(request: Request) {
  let usuario = "";
  let promptChars = 0;
  const startedAt = Date.now();

  try {
    const { user } = await requireSession();
    usuario = user.usuario;
  } catch (error) {
    console.error("/api/chat requireSession failed", error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
    return unauthorizedResponse();
  }

  if (isPortfolioDemoMode()) {
    let body: Partial<ChatRequest>;
    try {
      body = (await request.json()) as Partial<ChatRequest>;
    } catch {
      return NextResponse.json({ detail: "Mensaje no válido" }, { status: 400 });
    }

    const pregunta = String(body.pregunta ?? "").trim();
    const reply = [
      "Asistente demo activo.",
      pregunta ? `Consulta recibida: ${pregunta}` : "Consulta recibida.",
      "Esta respuesta es simulada para el portafolio y no consulta servicios externos ni datos reales.",
      "Usa los tableros visibles como referencia principal para la demo."
    ].join("\n");

    return new Response(reply, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no"
      }
    });
  }

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch (error) {
    console.error("/api/chat invalid json", error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
    await logUsage({
      usuario,
      promptChars: 0,
      responseChars: null,
      durationMs: Date.now() - startedAt,
      status: "blocked",
      errorMessage: "JSON inválido"
    });
    return NextResponse.json({ detail: "Mensaje no válido" }, { status: 400 });
  }

  if (typeof body?.pregunta === "string" && typeof body?.contexto === "string" && Array.isArray(body?.historial)) {
    promptChars = getPromptChars(body);
  }

  const validation = validateInput(body);
  if (!validation.ok) {
    await logUsage({
      usuario,
      promptChars,
      responseChars: null,
      durationMs: Date.now() - startedAt,
      status: validation.usageStatus,
      errorMessage: validation.message
    });
    return NextResponse.json({ detail: validation.message }, { status: validation.status });
  }

  try {
    const rateLimit = await checkRateLimit(usuario);
    if (!rateLimit.allowed) {
      const detail = `Has alcanzado el límite de consultas. Intenta de nuevo en ${rateLimit.retryAfterMinutes} minutos.`;
      await logUsage({
        usuario,
        promptChars,
        responseChars: null,
        durationMs: Date.now() - startedAt,
        status: "rate_limited",
        errorMessage: detail
      });
      return NextResponse.json(
        { detail },
        {
          status: 429,
          headers: {
            "Retry-After": String(rateLimit.retryAfterMinutes * 60)
          }
        }
      );
    }
  } catch (error) {
    console.error("/api/chat rate limit check failed", error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
    console.error("/api/chat request failed", error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : error);
    await logUsage({
      usuario,
      promptChars,
      responseChars: null,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: error instanceof Error ? error.message : "Error validando límites de uso"
    });
    return NextResponse.json({ detail: "Servicio no disponible" }, { status: 500 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await logUsage({
      usuario,
      promptChars,
      responseChars: null,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: "GEMINI_API_KEY no configurada"
    });
    return NextResponse.json({ detail: "Servicio no disponible" }, { status: 500 });
  }

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), GEMINI_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await openGeminiStream(body, apiKey, abortController.signal);
  } catch (error) {
    clearTimeout(timeoutId);
    const isAbort = error instanceof Error && error.name === "AbortError";
    await logUsage({
      usuario,
      promptChars,
      responseChars: null,
      durationMs: Date.now() - startedAt,
      status: isAbort ? "timeout" : "error",
      errorMessage: isAbort ? "Tiempo de espera agotado" : (error instanceof Error ? error.message : "Error desconocido")
    });
    if (isAbort) {
      return NextResponse.json({ detail: "El servicio tardó demasiado en responder" }, { status: 504 });
    }
    return NextResponse.json({ detail: "Servicio no disponible" }, { status: 500 });
  }

  if (!upstream.ok || !upstream.body) {
    clearTimeout(timeoutId);
    let upstreamMsg = "unknown";
    try {
      const data = await upstream.json();
      upstreamMsg = (data?.error?.message as string | undefined) ?? "unknown";
    } catch {
      // upstream sin JSON
    }
    await logUsage({
      usuario,
      promptChars,
      responseChars: null,
      durationMs: Date.now() - startedAt,
      status: "error",
      errorMessage: `UPSTREAM_UNAVAILABLE: status=${upstream.status} message=${upstreamMsg}`
    });
    return NextResponse.json({ detail: "Servicio no disponible" }, { status: 500 });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const usuarioFinal = usuario;
  const promptCharsFinal = promptChars;
  const startedAtFinal = startedAt;
  let totalText = "";

  const stream = new ReadableStream<Uint8Array>({
    async start(controllerInner) {
      let buffer = "";
      let logStatus: UsageStatus = "ok";
      let logError: string | null = null;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let lineEnd = buffer.indexOf("\n\n");
          while (lineEnd >= 0) {
            const event = buffer.slice(0, lineEnd);
            buffer = buffer.slice(lineEnd + 2);
            if (event.startsWith("data: ")) {
              const json = event.slice(6).trim();
              if (json) {
                try {
                  const data = JSON.parse(json) as GeminiResponse;
                  const chunk = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
                  if (chunk) {
                    totalText += chunk;
                    controllerInner.enqueue(encoder.encode(chunk));
                  }
                } catch {
                  // chunk con JSON parcial; ignorar
                }
              }
            }
            lineEnd = buffer.indexOf("\n\n");
          }
        }
        controllerInner.close();
      } catch (err) {
        logStatus = err instanceof Error && err.name === "AbortError" ? "timeout" : "error";
        logError = err instanceof Error ? err.message : "stream error";
        try { controllerInner.error(err); } catch { /* noop */ }
      } finally {
        clearTimeout(timeoutId);
        try { reader.releaseLock(); } catch { /* noop */ }
        await logUsage({
          usuario: usuarioFinal,
          promptChars: promptCharsFinal,
          responseChars: totalText.length || null,
          durationMs: Date.now() - startedAtFinal,
          status: logStatus,
          errorMessage: logError
        });
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no"
    }
  });
}


