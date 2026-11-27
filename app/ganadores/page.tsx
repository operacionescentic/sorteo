"use client";

import { useEffect, useState } from "react";
import { FECHAS_SORTEO, formatoFecha } from "@/lib/sorteo";
import type { GanadorPublico } from "@/lib/ganadores";

export default function GanadoresPage() {
  const [ganadores, setGanadores] = useState<GanadorPublico[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/ganadores", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => alive && (j.ganadores ? setGanadores(j.ganadores) : setError(true)))
        .catch(() => alive && setError(true));
    load();
    const t = setInterval(load, 20000); // refresco en vivo durante el sorteo
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <section className="hero">
        <span className="tag">RESULTADOS</span>
        <h1>
          <em>Ganadores</em> del sorteo
        </h1>
        <p>Los sorteos se realizan cada viernes a las 4:00 pm. Esta página se actualiza automáticamente.</p>
      </section>

      {error && <div className="alert error">No se pudieron cargar los ganadores.</div>}
      {!ganadores && !error && <p className="muted" style={{ textAlign: "center" }}>Cargando…</p>}

      {ganadores && (
        <div className="grid grid-2">
          {FECHAS_SORTEO.filter((f) => f !== "2026-11-20").map((f) => { // el sorteo del 20-nov no se realizó
            const deSemana = ganadores.filter((g) => g.sorteo_fecha === f);
            return (
              <div className="card" key={f}>
                <h2 style={{ textTransform: "capitalize" }}>
                  <span className="bar" />
                  {formatoFecha(f)}
                </h2>
                {[50, 30].map((p) => {
                  const g = deSemana.find((x) => x.premio === p);
                  return (
                    <div key={p} className="date-chip" style={{ marginBottom: 10, textAlign: "left", display: "flex", gap: 14, alignItems: "center" }}>
                      <div style={{ fontSize: "1.6rem", fontWeight: 900, color: "var(--red-hi)", minWidth: 70 }}>{p}%</div>
                      {g ? (
                        <div>
                          <strong>{g.nombre}</strong>
                          <small>Doc. {g.documento}</small>
                        </div>
                      ) : (
                        <span className="muted">Pendiente</span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
