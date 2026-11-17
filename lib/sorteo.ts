// Mantener sincronizado con supabase/migrations (sorteo_fecha_actual / sorteo_realizar)
export const FECHAS_SORTEO = ["2026-11-20", "2026-11-27", "2026-12-04", "2026-12-11"] as const;

export const COMERCIALES = [
  "Carolina Diaz",
  "Sebastian Barbosa",
  "Luna Torres",
  "Ximena Valencia",
  "Diego Barbosa",
  "Otro",
] as const;

export const ABONO_MINIMO = 200000;

/** Instante del sorteo: viernes 4:00 pm hora Colombia (UTC-5, sin horario de verano). */
export function instanteSorteo(fecha: string): Date {
  return new Date(`${fecha}T16:00:00-05:00`);
}

/** Sorteo al que se asigna una inscripción hecha en `now`; null si ya terminaron. */
export function sorteoActual(now = new Date()): string | null {
  return FECHAS_SORTEO.find((f) => now < instanteSorteo(f)) ?? null;
}

export function formatoFecha(fecha: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Bogota",
  }).format(instanteSorteo(fecha));
}

export function formatoPesos(n: number): string {
  return new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
}

const ERRORES: Record<string, string> = {
  SORTEO_CERRADO: "Las inscripciones están cerradas: ya se realizaron todos los sorteos.",
  YA_INSCRITO: "Este número de documento ya está inscrito. Cada documento solo puede inscribirse una vez; para participar otra semana trae un referido.",
  REFERIDO_NO_EXISTE: "El documento de quien te refirió no está inscrito en el sorteo. Verifica el número.",
  REFERIDO_PROPIO: "No puedes referirte a ti mismo.",
  NO_AUTORIZADO: "No tienes permisos de administrador.",
  AUN_NO_ES_HORA: "Aún no es hora: el sorteo se habilita el viernes a las 4:00 pm.",
  PREMIO_YA_SORTEADO: "Ese premio ya fue sorteado esta semana.",
  SIN_PARTICIPANTES: "No hay participantes con abono validado disponibles para este sorteo.",
  FECHA_INVALIDA: "Fecha de sorteo inválida.",
};

export function mensajeError(msg: string | undefined): string {
  if (!msg) return "Ocurrió un error. Intenta de nuevo.";
  const key = Object.keys(ERRORES).find((k) => msg.includes(k));
  if (key) return ERRORES[key];
  if (msg.includes("check constraint")) return "Revisa los datos ingresados.";
  return msg;
}
