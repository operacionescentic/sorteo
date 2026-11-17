"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const ADMIN_EMAIL = "gerenciacomercial@centicsas.com.co";

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) {
      setIsAdmin(null);
      return;
    }
    supabase()
      .rpc("sorteo_es_admin")
      .then(({ data }) => setIsAdmin(data === true));
  }, [session]);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: ADMIN_EMAIL, password });
    setLoading(false);
    if (error) setError("Credenciales inválidas.");
  }

  if (session === undefined) return <p className="muted">Cargando…</p>;

  if (!session) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
        <h2><span className="bar" />Acceso administrador</h2>
        <form onSubmit={login}>
          {error && <div className="alert error">{error}</div>}
          <div className="field">
            <label>Correo</label>
            <input value={ADMIN_EMAIL} disabled />
          </div>
          <div className="field">
            <label htmlFor="pw">Contraseña</label>
            <input id="pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          <button className="btn block" disabled={loading}>{loading ? "Ingresando…" : "Ingresar"}</button>
        </form>
      </div>
    );
  }

  if (isAdmin === null) return <p className="muted">Verificando permisos…</p>;
  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
        <div className="alert error">Esta cuenta no tiene permisos de administrador.</div>
        <button className="btn ghost" onClick={() => supabase().auth.signOut()}>Cerrar sesión</button>
      </div>
    );
  }
  return <>{children}</>;
}
