"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { COMERCIALES, formatoFecha, mensajeError } from "@/lib/sorteo";

type Props = { sorteo: string; sorteoLabel: string };

export default function InscripcionForm({ sorteoLabel }: Props) {
  const [comercial, setComercial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inscritoEn, setInscritoEn] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const get = (k: string) => String(fd.get(k) ?? "").trim();

    setLoading(true);
    const { data, error } = await supabase().rpc("sorteo_inscribir", {
      p_nombre: get("nombre"),
      p_correo: get("correo"),
      p_documento: get("documento"),
      p_telefono: get("telefono"),
      p_comercial: get("comercial"),
      p_comercial_otro: get("comercial_otro"),
      p_referido_documento: get("referido_documento"),
    });
    setLoading(false);

    if (error) {
      setError(mensajeError(error.message));
      return;
    }
    setInscritoEn(String(data));
  }

  if (inscritoEn) {
    return (
      <div className="success">
        <div className="big">🎉</div>
        <h2>¡Inscripción registrada!</h2>
        <div className="highlight" style={{ textAlign: "left", marginTop: 16 }}>
          <p style={{ marginTop: 0 }}>
            Esta inscripción <strong>solo te permite participar en el sorteo de esta semana: el{" "}
            <span style={{ textTransform: "capitalize" }}>{formatoFecha(inscritoEn)}</span> a las 4:00 pm</strong>.
          </p>
          <p>
            Si quieres participar en la siguiente semana debes <strong>traer a un referido</strong>: al inscribirse debe
            escribir <strong>tu número de documento</strong> como referente y abonar <strong>al menos $200.000</strong>.
          </p>
          <p style={{ marginBottom: 0 }}>
            Tu referido participará con su inscripción y tú quedarás habilitado en su semana cuando el área comercial
            valide su abono.
          </p>
        </div>
        <a className="btn ghost" style={{ marginTop: 20 }} href="/ganadores">
          Ver ganadores
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="muted" style={{ marginTop: 0 }}>
        Te inscribes para el sorteo del <strong style={{ textTransform: "capitalize" }}>{sorteoLabel}</strong> a las 4:00 pm.
      </p>
      {error && <div className="alert error">{error}</div>}
      <div className="grid grid-2" style={{ gap: 0, columnGap: 16 }}>
        <div className="field">
          <label htmlFor="nombre">Nombre completo *</label>
          <input id="nombre" name="nombre" required minLength={3} maxLength={120} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="correo">Correo electrónico *</label>
          <input id="correo" name="correo" type="email" required autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="documento">Número de documento (cédula) *</label>
          <input id="documento" name="documento" required inputMode="numeric" pattern="[0-9A-Za-z.\-]{4,20}" title="Entre 4 y 20 caracteres" />
        </div>
        <div className="field">
          <label htmlFor="telefono">Teléfono / WhatsApp</label>
          <input id="telefono" name="telefono" type="tel" autoComplete="tel" maxLength={20} />
        </div>
        <div className="field">
          <label htmlFor="comercial">Comercial asignado *</label>
          <select id="comercial" name="comercial" required value={comercial} onChange={(e) => setComercial(e.target.value)}>
            <option value="" disabled>Selecciona…</option>
            {COMERCIALES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        {comercial === "Otro" && (
          <div className="field">
            <label htmlFor="comercial_otro">¿Quién o qué? *</label>
            <input id="comercial_otro" name="comercial_otro" required maxLength={120} placeholder="Ej: nombre del asesor, redes sociales…" />
          </div>
        )}
        <div className="field">
          <label htmlFor="referido_documento">N.º de documento de quien te refirió (opcional)</label>
          <input
            id="referido_documento"
            name="referido_documento"
            inputMode="numeric"
            pattern="[0-9A-Za-z.\-]{4,20}"
            title="Solo el número de documento de la persona que te refirió"
            placeholder="Debe estar inscrita en el sorteo"
          />
        </div>
      </div>
      <div className="field">
        <label className="check">
          <input type="checkbox" required />
          <span>
            Entiendo que esta inscripción es válida solo para el sorteo de esta semana y autorizo el tratamiento de mis datos personales para fines del sorteo.
          </span>
        </label>
      </div>
      <button className="btn block" disabled={loading}>
        {loading ? "Inscribiendo…" : "Inscribirme al sorteo"}
      </button>
    </form>
  );
}
