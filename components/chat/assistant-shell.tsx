"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, Copy, MessageCircle, RotateCcw, Sparkles, X } from "lucide-react";

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[a-z]*\n?|```/g, "").trim())
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1$2")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

type Message = {
  role: "user" | "model";
  text: string;
};

type AssistantShellProps = {
  title: string;
  contextBuilder: (question: string) => string;
  executiveReportPrompt?: () => string;
  executiveReportTitle?: string;
  suggestedQuestions?: string[];
  systemInstruction?: string;
};

export function AssistantShell({
  title,
  contextBuilder,
  executiveReportPrompt,
  executiveReportTitle = "REPORTE EJECUTIVO · IA",
  suggestedQuestions,
  systemInstruction
}: AssistantShellProps) {
  const initialGreeting = `Soy el asistente de ${title}. Puedo ayudarte a resumir y analizar la informacion visible del modulo.`;
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([{ role: "model", text: initialGreeting }]);
  const [loading, setLoading] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportText, setReportText] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const hasUserMessages = messages.some((message) => message.role === "user");

  const resolvedSuggestedQuestions = useMemo(() => {
    if (suggestedQuestions?.length) {
      return suggestedQuestions;
    }

    const moduleName = title.trim().toLowerCase();

    if (moduleName.includes("arl")) {
      return [
        "Resumeme los KPIs principales de ARL.",
        "Que empresas lideran en comisiones este ano?",
        "Que aseguradoras muestran mejor desempeno?",
        "Dame una lectura rapida del P&G de ARL."
      ];
    }

    if (moduleName.includes("seguros")) {
      return [
        "Resumeme el comportamiento general de seguros.",
        "Que clientes lideran en comisiones?",
        "Que aseguradoras tienen mejor resultado?",
        "Dame un resumen ejecutivo del modulo de seguros."
      ];
    }

    if (moduleName.includes("cartera")) {
      return [
        "Resumeme el estado actual de la cartera.",
        "Que facturas pendientes requieren atencion?",
        "Que dice la proyeccion del proximo mes?",
        "Que hallazgos importantes ves en planillas?"
      ];
    }

    return [
      "Resumeme lo mas importante del modulo.",
      "Que indicadores llaman la atencion?",
      "Que riesgos o alertas ves aqui?",
      "Dame un resumen ejecutivo breve."
    ];
  }, [suggestedQuestions, title]);

  async function askAssistant(question: string, history: Message[], onChunk?: (partial: string) => void) {
    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contexto: contextBuilder(question),
          systemInstruction,
          pregunta: question,
          historial: history
            .filter((message) => message.role !== "model" || !message.text.startsWith("Soy el asistente"))
            .map((message) => ({ role: message.role, parts: [{ text: message.text }] }))
        })
      });
    } catch {
      throw new Error("Sin conexion con el servicio. Verifica tu conexion a internet.");
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!response.ok || contentType.includes("application/json")) {
      let data: { detail?: string } = {};
      try {
        data = await response.json();
      } catch {
        // respuesta sin JSON
      }
      throw new Error(data?.detail || "El asistente no esta disponible en este momento.");
    }

    if (!response.body) {
      throw new Error("Respuesta vacia del asistente.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          full += chunk;
          if (onChunk) onChunk(full);
        }
      }
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
    return full || "No se recibio respuesta.";
  }

  async function runAssistantWithStream(question: string, baseMessages: Message[]) {
    let modelAdded = false;
    const onChunk = (partial: string) => {
      setLoading(false);
      if (!modelAdded) {
        modelAdded = true;
        setMessages((current) => [...current, { role: "model", text: partial }]);
      } else {
        setMessages((current) => {
          const next = [...current];
          const lastIndex = next.length - 1;
          if (lastIndex >= 0 && next[lastIndex].role === "model") {
            next[lastIndex] = { role: "model", text: partial };
          }
          return next;
        });
      }
    };

    try {
      const final = await askAssistant(question, baseMessages, onChunk);
      if (!modelAdded) {
        modelAdded = true;
        setMessages((current) => [...current, { role: "model", text: final }]);
      }
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : "No fue posible conectar con el asistente.";
      if (modelAdded) {
        setMessages((current) => {
          const next = [...current];
          const lastIndex = next.length - 1;
          if (lastIndex >= 0 && next[lastIndex].role === "model") {
            next[lastIndex] = { role: "model", text: detail };
          }
          return next;
        });
      } else {
        setMessages((current) => [...current, { role: "model", text: detail }]);
      }
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    const nextMessages = [...messages, { role: "user" as const, text: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    await runAssistantWithStream(question, nextMessages);
  }

  async function onSuggestedQuestionClick(question: string) {
    if (loading) return;

    const nextMessages = [...messages, { role: "user" as const, text: question }];
    setMessages(nextMessages);
    setLoading(true);

    await runAssistantWithStream(question, nextMessages);
  }

  async function copyMessage(index: number, text: string) {
    try {
      await navigator.clipboard.writeText(stripMarkdown(text));
      setCopiedIndex(index);
      window.setTimeout(() => setCopiedIndex((current) => (current === index ? null : current)), 1800);
    } catch {
      // clipboard sin permisos: no-op
    }
  }

  function clearConversation() {
    setMessages([{ role: "model", text: initialGreeting }]);
    setInput("");
    setCopiedIndex(null);
  }

  async function generateExecutiveReport() {
    if (!executiveReportPrompt || reportLoading) return;

    setReportOpen(true);
    setReportLoading(true);
    setReportText("");

    try {
      const answer = await askAssistant(executiveReportPrompt(), [], (partial) => {
        setReportLoading(false);
        setReportText(stripMarkdown(partial));
      });
      setReportText(stripMarkdown(answer));
    } catch (error) {
      const detail = error instanceof Error && error.message ? error.message : "Error de conexion con el asistente IA.";
      setReportText(detail);
    } finally {
      setReportLoading(false);
    }
  }

  async function copyReport() {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
  }

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (!open || !isMobile) {
      document.body.classList.remove("assistant-shell-mobile-open");
      return;
    }

    document.body.classList.add("assistant-shell-mobile-open");
    return () => {
      document.body.classList.remove("assistant-shell-mobile-open");
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`assistant-shell__trigger ${open ? "is-open" : ""}`}
        title="CM&M Asistente"
        aria-label={open ? "Cerrar asistente" : "Abrir asistente"}
      >
        <MessageCircle size={22} />
      </button>

      {open ? (
        <section className="assistant-shell">
          <header className="assistant-shell__header">
            <div className="assistant-shell__header-main">
              <span className="assistant-shell__status-dot" aria-hidden="true" />
              <h3 className="assistant-shell__title">CM&amp;M Asistente</h3>
            </div>
            <div className="assistant-shell__header-actions">
              {executiveReportPrompt ? (
                <button type="button" onClick={generateExecutiveReport} className="assistant-shell__icon-btn" title="Generar reporte ejecutivo">
                  <Sparkles size={15} />
                </button>
              ) : null}
              {hasUserMessages ? (
                <button
                  type="button"
                  onClick={clearConversation}
                  className="assistant-shell__icon-btn"
                  title="Limpiar conversacion"
                  aria-label="Limpiar conversacion"
                >
                  <RotateCcw size={14} />
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="assistant-shell__icon-btn" title="Cerrar" aria-label="Cerrar asistente">
                <X size={15} />
              </button>
            </div>
          </header>

          <div className="assistant-shell__messages">
            {messages.map((message, index) => {
              const isUser = message.role === "user";
              const isGreeting = index === 0 && message.role === "model" && message.text === initialGreeting;
              const displayText = isUser ? message.text : stripMarkdown(message.text);
              return (
                <div
                  key={`${message.role}-${index}`}
                  className={`assistant-shell__bubble ${isUser ? "assistant-shell__bubble--user" : "assistant-shell__bubble--model"}`}
                >
                  {displayText}
                  {!isUser && !isGreeting ? (
                    <button
                      type="button"
                      onClick={() => void copyMessage(index, message.text)}
                      className="assistant-shell__copy-btn"
                      title="Copiar respuesta"
                      aria-label="Copiar respuesta"
                    >
                      {copiedIndex === index ? <Check size={11} /> : <Copy size={11} />}
                      {copiedIndex === index ? "Copiado" : "Copiar"}
                    </button>
                  ) : null}
                </div>
              );
            })}
            {!hasUserMessages ? (
              <div className="assistant-shell__suggestions">
                {resolvedSuggestedQuestions.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => void onSuggestedQuestionClick(question)}
                    className="assistant-shell__suggestion-pill"
                  >
                    {question}
                  </button>
                ))}
              </div>
            ) : null}
            {loading ? (
              <div className="assistant-shell__bubble assistant-shell__bubble--model">
                <span className="assistant-shell__typing" aria-label="Analizando">
                  <span className="assistant-shell__typing-dot" />
                  <span className="assistant-shell__typing-dot" />
                  <span className="assistant-shell__typing-dot" />
                </span>
              </div>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="assistant-shell__form">
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Escribe tu pregunta..."
              className="assistant-shell__input"
            />
            <button type="submit" disabled={loading} className="assistant-shell__submit">
              <ArrowRight size={16} />
            </button>
          </form>
        </section>
      ) : null}

      <div className={`assistant-report ${reportOpen ? "is-open" : ""}`}>
        <div className="assistant-report__panel">
          <div className="assistant-report__head">
            <div>
              <div className="assistant-report__kicker">{executiveReportTitle}</div>
              <h3 className="assistant-report__title">Informe gerencial</h3>
            </div>
            <button type="button" onClick={() => setReportOpen(false)} className="assistant-shell__icon-btn" title="Cerrar">
              <X size={15} />
            </button>
          </div>
          <div className="assistant-report__body">
            {reportLoading ? "Conectando con el asistente..." : reportText}
          </div>
          <div className="assistant-report__actions">
            <button type="button" onClick={copyReport} className="assistant-report__copy" disabled={!reportText || reportLoading}>
              <Copy size={15} />
              Copiar informe
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
