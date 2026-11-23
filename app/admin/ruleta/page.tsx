"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { supabase } from "@/lib/supabase";
import { FECHAS_SORTEO, formatoFecha, instanteSorteo, mensajeError } from "@/lib/sorteo";

type Participante = { id: string; nombre: string; documento: string; motivo: "inscripcion" | "referido" };
type Ganador = { inscripcion_id: string; premio: number; nombre: string; documento: string };

const TAU = Math.PI * 2;

function fechaPorDefecto(now = new Date()): string {
  // El sorteo de hoy (si ya pasó la hora y es el más reciente) o el próximo
  const pasados = FECHAS_SORTEO.filter((f) => now >= instanteSorteo(f));
  const proximo = FECHAS_SORTEO.find((f) => now < instanteSorteo(f));
  return pasados.at(-1) && (!proximo || now.getTime() - instanteSorteo(pasados.at(-1)!).getTime() < 3 * 864e5)
    ? pasados.at(-1)!
    : proximo ?? FECHAS_SORTEO.at(-1)!;
}

export default function RuletaPage() {
  return (
    <AdminGate>
      <Ruleta />
    </AdminGate>
  );
}

function Ruleta() {
  const [fecha, setFecha] = useState(fechaPorDefecto);
  const [participantes, setParticipantes] = useState<Participante[]>([]);
  const [ganadores, setGanadores] = useState<Ganador[]>([]);
  const [girando, setGirando] = useState(false);
  const [ultimo, setUltimo] = useState<Ganador | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Rueda mostrada: se congela tras un giro para que el ganador siga visible y resaltado
  const [congelada, setCongelada] = useState<{ lista: Participante[]; ganadorIdx: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef(0);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const cargar = useCallback(async () => {
    const sb = supabase();
    const [ins, gan] = await Promise.all([
      // Elegibles: inscritos esta semana, o quienes tienen un referido con abono validado inscrito esta semana
      sb.rpc("sorteo_participantes", { p_fecha: fecha }),
      sb.from("sorteo_ganadores").select("inscripcion_id,premio,sorteo_inscripciones(nombre,documento)").eq("sorteo_fecha", fecha),
    ]);
    if (ins.error || gan.error) return setError((ins.error ?? gan.error)!.message);
    setError(null);
    const gs: Ganador[] = (gan.data ?? []).map((g: any) => ({
      inscripcion_id: g.inscripcion_id,
      premio: g.premio,
      nombre: g.sorteo_inscripciones?.nombre ?? "",
      documento: g.sorteo_inscripciones?.documento ?? "",
    }));
    setGanadores(gs);
    setParticipantes((ins.data ?? []) as Participante[]);
  }, [fecha]);

  useEffect(() => {
    setUltimo(null);
    setCongelada(null);
    cargar();
  }, [cargar]);

  const dibujar = useCallback((rot: number, lista: Participante[], ganadorIdx = -1, t = 0) => {
    const c = canvasRef.current;
    if (c) dibujarRueda(c, rot, lista, ganadorIdx, t);
  }, []);

  useEffect(() => {
    if (congelada) dibujar(rotRef.current, congelada.lista, congelada.ganadorIdx);
    else dibujar(rotRef.current, participantes);
  }, [participantes, congelada, dibujar]);

  async function sortear(premio: 50 | 30) {
    if (girando) return;
    setError(null);
    setUltimo(null);
    setCongelada(null);
    setGirando(true);
    const { data, error } = await supabase().rpc("sorteo_realizar", { p_fecha: fecha, p_premio: premio });
    if (error || !data?.[0]) {
      setGirando(false);
      setError(mensajeError(error?.message));
      return;
    }
    const ganador = data[0] as Ganador;
    const lista = participantes;
    let idx = lista.findIndex((p) => p.id === ganador.inscripcion_id);
    if (idx < 0) idx = 0; // por si la lista estaba desactualizada

    const n = lista.length || 1;
    const a = TAU / n;
    const jitter = (Math.random() - 0.5) * a * 0.6;
    const objetivo = -((idx + 0.5) * a) + jitter; // ángulo final módulo 2π
    const desde = rotRef.current;
    const base = desde + TAU * 8;
    const delta = (((objetivo - base) % TAU) + TAU) % TAU;
    const hasta = base + delta;
    const dur = 8000;
    const t0 = performance.now();

    await new Promise<void>((resolve) => {
      const step = (t: number) => {
        const p = Math.min((t - t0) / dur, 1);
        const e = 1 - Math.pow(1 - p, 4);
        rotRef.current = desde + (hasta - desde) * e;
        dibujar(rotRef.current, lista, -1, t);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });

    rotRef.current = rotRef.current % TAU;
    setCongelada({ lista, ganadorIdx: idx });
    setUltimo(ganador);
    setGirando(false);
    await cargar();
  }

  const habilitado = now >= instanteSorteo(fecha);
  const faltan = instanteSorteo(fecha).getTime() - now.getTime();
  const gan50 = ganadores.find((g) => g.premio === 50);
  const gan30 = ganadores.find((g) => g.premio === 30);

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>Ruleta del sorteo</h1>
          <span className="muted">Participan todos los inscritos de la semana y quienes trajeron un referido con abono validado esta semana.</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={girando} style={{ width: "auto" }}>
            {FECHAS_SORTEO.map((f) => <option key={f} value={f}>{formatoFecha(f)} · 4:00 pm</option>)}
          </select>
          <Link className="btn ghost" href="/admin">← Panel</Link>
        </div>
      </div>

      {!habilitado && (
        <div className="alert error">
          La ruleta se habilita el <strong>{formatoFecha(fecha)} a las 4:00 pm</strong>. Faltan {formatoFaltan(faltan)}.
        </div>
      )}
      {error && <div className="alert error">{error}</div>}

      <div className="ruleta-grid">
        <div>
          <div className="wheel-box">
            <svg className="pointer" viewBox="0 -18 60 100" aria-hidden="true">
              <path d="M30 78 L6 22 A26 26 0 1 1 54 22 Z" fill="#e3121b" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
              <circle cx="30" cy="26" r="8" fill="#fff" />
            </svg>
            <canvas ref={canvasRef} width={1000} height={1000} />
          </div>
          <p className="muted" style={{ textAlign: "center" }}>
            {(congelada?.lista ?? participantes).length} {(congelada?.lista ?? participantes).length === 1 ? "participante" : "participantes"} en la ruleta
            {(congelada?.lista ?? participantes).some((p) => p.motivo === "referido") &&
              ` (${(congelada?.lista ?? participantes).filter((p) => p.motivo === "referido").length} por referido)`}
          </p>
        </div>

        <div className="grid">
          {ultimo && (
            <div className="card winner-card">
              <div className="muted">¡Ganador del {ultimo.premio}%!</div>
              <div className="name">{ultimo.nombre}</div>
              <div className="muted">Doc. {ultimo.documento}</div>
            </div>
          )}
          {([50, 30] as const).map((p) => {
            const g = p === 50 ? gan50 : gan30;
            return (
              <div className="card prize" key={p}>
                <div className="pct">{p}%</div>
                {g ? (
                  <p><strong>{g.nombre}</strong><br /><span className="muted">Doc. {g.documento}</span></p>
                ) : (
                  <button
                    className="btn block"
                    style={{ marginTop: 12 }}
                    disabled={!habilitado || girando || participantes.length === 0 || (p === 30 && !gan50)}
                    onClick={() => sortear(p)}
                  >
                    {girando ? "Girando…" : `Girar por el ${p}%`}
                  </button>
                )}
              </div>
            );
          })}
          <Link className="btn ghost" href="/ganadores" target="_blank">Ver página pública de ganadores ↗</Link>
        </div>
      </div>
    </>
  );
}

function formatoFaltan(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${d ? d + "d " : ""}${h}h ${m}m ${ss}s`;
}

const TAU_ = Math.PI * 2;

/** Dibuja la ruleta completa (aro con luces, segmentos, nombres legibles y centro) en un canvas cuadrado. */
function dibujarRueda(c: HTMLCanvasElement, rot: number, lista: Participante[], ganadorIdx: number, t: number) {
  const ctx = c.getContext("2d")!;
  const S = c.width;
  const cx = S / 2;
  const R_OUT = S / 2 - 6; // aro
  const R = R_OUT - 44; // segmentos
  const R_HUB = S * 0.085;
  ctx.clearRect(0, 0, S, S);

  // Aro exterior
  ctx.beginPath();
  ctx.arc(cx, cx, R_OUT, 0, TAU_);
  ctx.fillStyle = "#0d0d0d";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#c00000";
  ctx.stroke();

  // Luces del aro (parpadean mientras gira)
  const BULBS = 28;
  const fase = Math.floor(t / 120) % 2;
  for (let i = 0; i < BULBS; i++) {
    const ang = (i / BULBS) * TAU_;
    const on = (i + fase) % 2 === 0;
    const x = cx + Math.cos(ang) * (R_OUT - 22);
    const y = cx + Math.sin(ang) * (R_OUT - 22);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU_);
    ctx.fillStyle = on ? "#fff4e0" : "#7a0000";
    ctx.shadowColor = on ? "rgba(255,220,180,.9)" : "transparent";
    ctx.shadowBlur = on ? 14 : 0;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const n = lista.length;
  if (!n) {
    ctx.beginPath();
    ctx.arc(cx, cx, R, 0, TAU_);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sin participantes", cx, cx - R * 0.45);
  } else {
    const a = TAU_ / n;
    // Tamaño base según el ancho del segmento; cada nombre se reduce hasta 70% antes de recortarse con "…"
    const fs = Math.round(Math.max(12, Math.min(32, a * R * 0.3)));
    const maxW = R - R_HUB - 44;
    for (let i = 0; i < n; i++) {
      const start = -Math.PI / 2 + i * a + rot;
      ctx.beginPath();
      ctx.moveTo(cx, cx);
      ctx.arc(cx, cx, R, start, start + a);
      ctx.closePath();
      // Rojo / negro alternados; si n es impar, el último usa un rojo oscuro para no juntar dos iguales
      ctx.fillStyle = n > 1 && n % 2 === 1 && i === n - 1 ? "#6e0000" : i % 2 === 0 ? "#c00000" : "#141414";
      ctx.fill();
      if (n > 1) {
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,255,255,.18)";
        ctx.stroke();
      }

      // Nombre en sentido radial, siempre legible (se voltea en la mitad izquierda)
      const mid = start + a / 2;
      const izquierda = Math.cos(mid) < 0;
      ctx.save();
      ctx.translate(cx, cx);
      ctx.rotate(izquierda ? mid + Math.PI : mid);
      ctx.textBaseline = "middle";
      ctx.textAlign = izquierda ? "left" : "right";
      const font = (px: number) => `700 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      let label = lista[i].nombre;
      let px = fs;
      ctx.font = font(px);
      while (px > fs * 0.7 && ctx.measureText(label).width > maxW) ctx.font = font(--px);
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0,0,0,.6)";
      ctx.shadowBlur = 4;
      while (label.length > 3 && ctx.measureText(label).width > maxW) label = label.slice(0, -2).trimEnd() + "…";
      ctx.fillText(label, izquierda ? -(R - 26) : R - 26, 0);
      ctx.restore();
    }

    // Resaltar ganador
    if (ganadorIdx >= 0 && ganadorIdx < n) {
      for (let i = 0; i < n; i++) {
        if (i === ganadorIdx) continue;
        const st = -Math.PI / 2 + i * a + rot;
        ctx.beginPath();
        ctx.moveTo(cx, cx);
        ctx.arc(cx, cx, R, st, st + a);
        ctx.closePath();
        ctx.fillStyle = "rgba(0,0,0,.6)";
        ctx.fill();
      }
      const st = -Math.PI / 2 + ganadorIdx * a + rot;
      ctx.beginPath();
      ctx.moveTo(cx, cx);
      ctx.arc(cx, cx, R, st, st + a);
      ctx.closePath();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#ffd166";
      ctx.shadowColor = "rgba(255,209,102,.9)";
      ctx.shadowBlur = 24;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  // Centro
  ctx.beginPath();
  ctx.arc(cx, cx, R_HUB, 0, TAU_);
  ctx.fillStyle = "#0a0a0a";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#e3121b";
  ctx.stroke();
  ctx.fillStyle = "#e3121b";
  ctx.font = `900 ${Math.round(R_HUB * 0.4)}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("CENTIC", cx, cx + 2);
}
