"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import AdminGate from "@/components/AdminGate";
import { supabase } from "@/lib/supabase";
import { ABONO_MINIMO, COMERCIALES, FECHAS_SORTEO, formatoFecha, formatoPesos } from "@/lib/sorteo";

type Inscripcion = {
  id: string;
  nombre: string;
  correo: string;
  documento: string;
  telefono: string | null;
  comercial: string;
  comercial_otro: string | null;
  referido_documento: string | null;
  sorteo_fecha: string;
  abono_validado: boolean;
  monto_abono: number | null;
  abono_validado_at: string | null;
  created_at: string;
};

const fmtFechaHora = (iso: string) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" }).format(new Date(iso));

export default function AdminPage() {
  return (
    <AdminGate>
      <Panel />
    </AdminGate>
  );
}

function Panel() {
  const [rows, setRows] = useState<Inscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comercial, setComercial] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [semana, setSemana] = useState("");
  const [estado, setEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    let q = supabase().from("sorteo_inscripciones").select("*").order("created_at", { ascending: false }).limit(5000);
    if (comercial) q = q.eq("comercial", comercial);
    // Fechas de inscripción interpretadas en hora Colombia
    if (desde) q = q.gte("created_at", new Date(`${desde}T00:00:00-05:00`).toISOString());
    if (hasta) q = q.lte("created_at", new Date(`${hasta}T23:59:59.999-05:00`).toISOString());
    if (semana) q = q.eq("sorteo_fecha", semana);
    if (estado) q = q.eq("abono_validado", estado === "validado");
    const { data, error } = await q;
    setLoading(false);
    if (error) return setError(error.message);
    setError(null);
    setRows((data ?? []) as Inscripcion[]);
  }, [comercial, desde, hasta, semana, estado]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const visibles = useMemo(() => {
    const b = busqueda.trim().toLowerCase();
    if (!b) return rows;
    return rows.filter((r) => [r.nombre, r.correo, r.documento, r.referido_documento ?? ""].some((v) => v.toLowerCase().includes(b)));
  }, [rows, busqueda]);

  async function validar(r: Inscripcion) {
    const raw = prompt(`Monto abonado por ${r.nombre} (mínimo ${formatoPesos(ABONO_MINIMO)}):`, String(r.monto_abono ?? ABONO_MINIMO));
    if (raw === null) return;
    const monto = Number(raw.replace(/[^\d]/g, ""));
    if (!monto || monto < ABONO_MINIMO) {
      alert(`El abono debe ser de al menos ${formatoPesos(ABONO_MINIMO)}.`);
      return;
    }
    await actualizar(r.id, { abono_validado: true, monto_abono: monto, abono_validado_at: new Date().toISOString() });
  }

  async function quitar(r: Inscripcion) {
    if (!confirm(`¿Quitar la validación del abono de ${r.nombre}?`)) return;
    await actualizar(r.id, { abono_validado: false, monto_abono: null, abono_validado_at: null });
  }

  async function actualizar(id: string, patch: Partial<Inscripcion>) {
    const { data, error } = await supabase().from("sorteo_inscripciones").update(patch).eq("id", id).select().single();
    if (error) return alert(error.message);
    setRows((prev) => prev.map((x) => (x.id === id ? (data as Inscripcion) : x)));
  }

  function exportarCSV() {
    const cols: (keyof Inscripcion)[] = ["created_at", "sorteo_fecha", "nombre", "correo", "documento", "telefono", "comercial", "comercial_otro", "referido_documento", "abono_validado", "monto_abono"];
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...visibles.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "inscripciones-sorteo.csv" });
    a.click();
    URL.revokeObjectURL(url);
  }

  const validados = visibles.filter((r) => r.abono_validado).length;

  return (
    <>
      <div className="toolbar">
        <div>
          <h1 style={{ margin: 0 }}>Panel de inscripciones</h1>
          <span className="muted">Valida abonos y filtra por comercial o fecha de inscripción.</span>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href="/admin/ruleta">Ir a la ruleta</Link>
          <button className="btn ghost" onClick={exportarCSV}>Exportar CSV</button>
          <button className="btn ghost" onClick={() => supabase().auth.signOut()}>Salir</button>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{visibles.length}</b><span>Inscripciones</span></div>
        <div className="stat"><b>{validados}</b><span>Abonos validados</span></div>
        <div className="stat"><b>{visibles.length - validados}</b><span>Pendientes</span></div>
      </div>

      <div className="card filters">
        <div className="field">
          <label>Comercial</label>
          <select value={comercial} onChange={(e) => setComercial(e.target.value)}>
            <option value="">Todos</option>
            {COMERCIALES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Inscrito desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="field">
          <label>Inscrito hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        <div className="field">
          <label>Sorteo</label>
          <select value={semana} onChange={(e) => setSemana(e.target.value)}>
            <option value="">Todos</option>
            {FECHAS_SORTEO.map((f) => <option key={f} value={f}>{formatoFecha(f)}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Abono</label>
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos</option>
            <option value="validado">Validado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>
        <div className="field">
          <label>Buscar</label>
          <input placeholder="Nombre, correo, documento o referente" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <button className="btn ghost" onClick={() => { setComercial(""); setDesde(""); setHasta(""); setSemana(""); setEstado(""); setBusqueda(""); }}>
          Limpiar
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Inscripción</th><th>Sorteo</th><th>Nombre</th><th>Documento</th><th>Correo</th><th>Teléfono</th>
              <th>Comercial</th><th>Referido por (doc.)</th><th>Abono</th><th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="muted">Cargando…</td></tr>}
            {!loading && visibles.length === 0 && <tr><td colSpan={10} className="muted">Sin resultados</td></tr>}
            {!loading && visibles.map((r) => (
              <tr key={r.id}>
                <td>{fmtFechaHora(r.created_at)}</td>
                <td>{r.sorteo_fecha}</td>
                <td>{r.nombre}</td>
                <td>{r.documento}</td>
                <td>{r.correo}</td>
                <td>{r.telefono ?? "—"}</td>
                <td>{r.comercial === "Otro" ? `Otro: ${r.comercial_otro}` : r.comercial}</td>
                <td>{r.referido_documento ?? "—"}</td>
                <td>
                  {r.abono_validado
                    ? <span className="badge ok">✔ {formatoPesos(r.monto_abono ?? 0)}</span>
                    : <span className="badge pend">Pendiente</span>}
                </td>
                <td>
                  {r.abono_validado
                    ? <button className="btn ghost sm" onClick={() => quitar(r)}>Quitar</button>
                    : <button className="btn sm" onClick={() => validar(r)}>Validar abono</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
