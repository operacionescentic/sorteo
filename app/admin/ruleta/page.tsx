"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { supabase } from "@/lib/supabase";
import { FECHAS_SORTEO, formatoFecha, instanteSorteo, mensajeError } from "@/lib/sorteo";
import { anguloFinal, animarGiro, dibujarRueda, TAU, type Segmento, type Transmision } from "@/lib/rueda";

type Participante = { id: string; nombre: string; documento: string; motivo: "inscripcion" | "referido" };
type Ganador = { inscripcion_id: string; premio: number; nombre: string; documento: string };

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
  const [congelada, setCongelada] = useState<{ lista: Segmento[]; ganadorIdx: number } | null>(null);
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

  const dibujar = useCallback((rot: number, lista: readonly Segmento[], ganadorIdx = -1, t = 0) => {
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

    // Misma foto de la ruleta que ve el público en /en-vivo (lista, ganador y desplazamiento)
    const { data: tx } = await supabase()
      .from("sorteo_transmision")
      .select("*")
      .eq("sorteo_fecha", fecha)
      .eq("premio", premio)
      .maybeSingle<Transmision>();

    let lista: Segmento[];
    let idx: number;
    let jitter: number;
    let dur = 8000;
    if (tx) {
      lista = tx.participantes;
      idx = tx.ganador_idx;
      jitter = tx.jitter;
      dur = tx.duracion_ms;
    } else {
      lista = participantes;
      idx = Math.max(0, lista.findIndex((p) => (p as Participante).id === ganador.inscripcion_id));
      jitter = Math.random() - 0.5;
    }

    const desde = rotRef.current;
    const hasta = anguloFinal(desde, lista.length, idx, jitter);
    await animarGiro(desde, hasta, dur, (rot, t) => {
      rotRef.current = rot;
      dibujar(rot, lista, -1, t);
    });

    rotRef.current = rotRef.current % TAU;
    setCongelada({ lista, ganadorIdx: idx });
    setUltimo(ganador);
    setGirando(false);
    await cargar();
  }

  // TEMPORAL (prueba 27-nov): ruleta habilitada antes de las 4:00 pm. Restaurar: now >= instanteSorteo(fecha)
  const habilitado = true;
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
            {!congelada && participantes.some((p) => p.motivo === "referido") &&
              ` (${participantes.filter((p) => p.motivo === "referido").length} por referido)`}
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
          <Link className="btn ghost" href="/en-vivo" target="_blank">Ver transmisión pública en vivo ↗</Link>
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
