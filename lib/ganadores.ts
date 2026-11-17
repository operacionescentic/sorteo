import { createClient } from "@supabase/supabase-js";

export type GanadorPublico = {
  sorteo_fecha: string;
  premio: number;
  nombre: string;
  documento: string;
  created_at: string;
};

/** Lectura server-side (clave anon) de ganadores enmascarados. */
export async function obtenerGanadores(): Promise<GanadorPublico[]> {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
  });
  const { data, error } = await sb.rpc("sorteo_ganadores_publicos");
  if (error) throw new Error(error.message);
  return (data ?? []) as GanadorPublico[];
}
