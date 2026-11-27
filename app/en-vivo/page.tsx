"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { FECHAS_SORTEO, formatoFecha, instanteSorteo } from "@/lib/sorteo";
import { anguloFinal, animarGiro, dibujarRueda, TAU, type Segmento, type Transmision } from "@/lib/rueda";

/** Fecha (YYYY-MM-DD) de hoy en Colombia. */
function hoyBogota(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(now);
}

/** Sorteo a transmitir: el de hoy si hay; si no, el próximo; si ya pasaron todos, null. */
function fechaTransmision(now = new Date()): string | null {
  const hoy = hoyBogota(now);
  if ((FECHAS_SORTEO as readonly string[]).includes(hoy)) return hoy;
  return FECHAS_SORTEO.find((f) => now < instanteSorteo(f)) ?? null;
}

type Pendiente = { tx: Transmision; transcurrido: number };

export default function EnVivoPage() {
  // Depende de la hora del navegador: se renderiza solo en el cliente para no desincronizar la hidratación
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
  if (!montado) return <p className="muted" style={{ textAlign: "center", padding: 40 }}>Cargando…</p>;
  return <EnVivo />;
}

function EnVivo() {
  const [fecha] = useState(() => fechaTransmision());
  const [now, setNow] = useState(() => new Date());
  const [participantes, setParticipantes] = useState<Segmento[]>([]);
  const [reveladas, setReveladas] = useState<Transmision[]>([]);
  const [girando, setGirando] = useState<Transmision | null>(null);
  const [ultimo, setUltimo] = useState<Transmision | null>(null);
  const [congelada, setCongelada] = useState<{ lista: Segmento[]; ganadorIdx: number } | null>(null);
  const [conectado, setConectado] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef(0);
  const vistas = useRef(new Set<string>());
  const cola = useRef<Pendiente[]>([]);
  const procesando = useRef(false);

  const esHoy = fecha !== null && fecha === hoyBogota(now);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const dibujar = useCallback((rot: number, lista: readonly Segmento[], ganadorIdx = -1, t = 0) => {
    const c = canvasRef.current;
    if (c) dibujarRueda(c, rot, lista, ganadorIdx, t);
  }, []);

  useEffect(() => {
    if (girando) return; // la animación dibuja por su cuenta
    if (congelada) dibujar(rotRef.current, congelada.lista, congelada.ganadorIdx);
    else dibujar(rotRef.current, participantes);
  }, [participantes, congelada, girando, dibujar]);

  const revelar = useCallback((tx: Transmision) => {
    // Un re-giro reemplaza al ganador anterior del mismo premio
    setReveladas((prev) => [...prev.filter((r) => r.premio !== tx.premio), tx]);
    setCongelada({ lista: tx.participantes, ganadorIdx: tx.ganador_idx });
    setUltimo(tx);
  }, []);

  // Reproduce en orden los giros que llegan (normalmente uno a la vez)
  const procesarCola = useCallback(async () => {
    if (procesando.current) return;
    procesando.current = true;
    while (cola.current.length) {
      const { tx, transcurrido } = cola.current.shift()!;
      if (transcurrido < tx.duracion_ms) {
        setUltimo(null);
        setCongelada(null);
        setGirando(tx);
        const lista = tx.participantes;
        const desde = rotRef.current % TAU;
        const hasta = anguloFinal(desde, lista.length, tx.ganador_idx, tx.jitter);
        await animarGiro(
          desde,
          hasta,
          tx.duracion_ms,
          (rot, t) => {
            rotRef.current = rot;
            dibujar(rot, lista, -1, t);
          },
          transcurrido,
        );
        rotRef.current = rotRef.current % TAU;
        setGirando(null);
      }
      revelar(tx);
    }
    procesando.current = false;
  }, [dibujar, revelar]);

  const recibir = useCallback(
    (txs: Transmision[], enVivo: boolean) => {
      for (const tx of txs) {
        if (vistas.current.has(tx.id)) continue;
        vistas.current.add(tx.id);
        // Un evento en vivo arranca ya; uno cargado al abrir la página se une a mitad de giro si aún gira
        const transcurrido = enVivo ? 0 : Date.now() - new Date(tx.created_at).getTime();
        cola.current.push({ tx, transcurrido });
      }
      procesarCola();
    },
    [procesarCola],
  );

  // Giros ya realizados + suscripción en vivo + respaldo por consulta periódica
  useEffect(() => {
    if (!fecha) return;
    const sb = supabase();
    const cargar = async () => {
      const { data } = await sb
        .from("sorteo_transmision")
        .select("*")
        .eq("sorteo_fecha", fecha)
        .order("created_at")
        .returns<Transmision[]>();
      if (data) recibir(data, false);
    };
    cargar();
    const canal = sb
      .channel(`sorteo-en-vivo-${fecha}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sorteo_transmision", filter: `sorteo_fecha=eq.${fecha}` },
        (payload) => recibir([payload.new as Transmision], true),
      )
      .subscribe((status) => setConectado(status === "SUBSCRIBED"));
    const t = setInterval(cargar, 10000);
    return () => {
      clearInterval(t);
      sb.removeChannel(canal);
    };
  }, [fecha, recibir]);

  // Nombres en la ruleta (solo el día del sorteo)
  useEffect(() => {
    if (!fecha || !esHoy) return;
    const cargar = () =>
      supabase()
        .rpc("sorteo_participantes_publicos", { p_fecha: fecha })
        .then(({ data }) => data && setParticipantes(data as Segmento[]));
    cargar();
    const t = setInterval(cargar, 20000);
    return () => clearInterval(t);
  }, [fecha, esHoy]);

  if (!fecha) {
    return (
      <section className="hero">
        <span className="tag">EN VIVO</span>
        <h1>Los sorteos <em>finalizaron</em></h1>
        <p>Consulta los resultados en la página de <Link href="/ganadores">ganadores</Link>.</p>
      </section>
    );
  }

  const inicio = instanteSorteo(fecha);
  const faltan = inicio.getTime() - now.getTime();
  const lista = girando?.participantes ?? congelada?.lista ?? participantes;

  return (
    <>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <span className={`tag ${esHoy && conectado ? "live" : ""}`}>{esHoy && conectado ? "● EN VIVO" : "EN VIVO"}</span>
        <h1>
          Ruleta del <em style={{ textTransform: "capitalize" }}>{formatoFecha(fecha)}</em>
        </h1>
        <p>
          {!esHoy
            ? "La transmisión se activa el día del sorteo. Vuelve ese día a las 4:00 pm."
            : faltan > 0
              ? `El sorteo comienza a las 4:00 pm. Faltan ${formatoFaltan(faltan)}.`
              : girando
                ? `¡Girando por el ${girando.premio}%!`
                : reveladas.length >= 2
                  ? "Sorteo finalizado. ¡Felicitaciones a los ganadores!"
                  : "La ruleta girará en cualquier momento. No cierres esta página."}
        </p>
      </section>

      <div className="ruleta-grid">
        <div>
          <div className="wheel-box">
            <svg className="pointer" viewBox="0 -18 60 100" aria-hidden="true">
              <path d="M30 78 L6 22 A26 26 0 1 1 54 22 Z" fill="#e3121b" stroke="#fff" strokeWidth="4" strokeLinejoin="round" />
              <circle cx="30" cy="26" r="8" fill="#fff" />
            </svg>
            <canvas ref={canvasRef} width={1000} height={1000} />
          </div>
          {esHoy && (
            <p className="muted" style={{ textAlign: "center" }}>
              {lista.length} {lista.length === 1 ? "participante" : "participantes"} en la ruleta
            </p>
          )}
        </div>

        <div className="grid">
          {ultimo && (
            <div className="card winner-card" key={ultimo.id}>
              <div className="muted">¡Ganador del {ultimo.premio}%!</div>
              <div className="name">{ultimo.ganador_nombre}</div>
              <div className="muted">Doc. {ultimo.ganador_documento}</div>
            </div>
          )}
          {[50, 30].map((p) => {
            const g = reveladas.find((r) => r.premio === p);
            return (
              <div className="card prize" key={p}>
                <div className="pct">{p}%</div>
                {g ? (
                  <p>
                    <strong>{g.ganador_nombre}</strong>
                    <br />
                    <span className="muted">Doc. {g.ganador_documento}</span>
                  </p>
                ) : (
                  <p className="muted">{girando?.premio === p ? "Girando…" : "Por sortear"}</p>
                )}
              </div>
            );
          })}
          <Link className="btn ghost" href="/ganadores">Ver todos los ganadores</Link>
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
