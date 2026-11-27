// Ruleta compartida entre el panel admin (/admin/ruleta) y la transmisión pública (/en-vivo).

export type Segmento = { nombre: string };

/** Giro guardado en public.sorteo_transmision: ambos lados lo animan igual. */
export type Transmision = {
  id: string;
  sorteo_fecha: string;
  premio: number;
  participantes: Segmento[];
  ganador_idx: number;
  ganador_nombre: string;
  ganador_documento: string;
  jitter: number;
  duracion_ms: number;
  created_at: string;
};

export const TAU = Math.PI * 2;

/** Ángulo final del giro: 8 vueltas completas y se detiene con el ganador bajo el puntero. */
export function anguloFinal(desde: number, n: number, idx: number, jitter: number): number {
  const a = TAU / Math.max(n, 1);
  const objetivo = -((idx + 0.5) * a) + jitter * a * 0.6; // ángulo final módulo 2π
  const base = desde + TAU * 8;
  const delta = (((objetivo - base) % TAU) + TAU) % TAU;
  return base + delta;
}

/**
 * Anima un giro de `desde` a `hasta` en `dur` ms. `yaTranscurrido` permite unirse a mitad de un giro
 * (p. ej. alguien que abre la página en vivo cuando la ruleta ya está girando).
 */
export function animarGiro(
  desde: number,
  hasta: number,
  dur: number,
  frame: (rot: number, t: number) => void,
  yaTranscurrido = 0,
): Promise<void> {
  const t0 = performance.now() - Math.max(0, yaTranscurrido);
  return new Promise((resolve) => {
    const step = (t: number) => {
      const p = Math.min((t - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 4);
      frame(desde + (hasta - desde) * e, t);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}


/** Dibuja la ruleta completa (aro con luces, segmentos, nombres legibles y centro) en un canvas cuadrado. */
export function dibujarRueda(c: HTMLCanvasElement, rot: number, lista: readonly Segmento[], ganadorIdx = -1, t = 0) {
  const ctx = c.getContext("2d")!;
  const S = c.width;
  const cx = S / 2;
  const R_OUT = S / 2 - 6; // aro
  const R = R_OUT - 44; // segmentos
  const R_HUB = S * 0.085;
  ctx.clearRect(0, 0, S, S);

  // Aro exterior
  ctx.beginPath();
  ctx.arc(cx, cx, R_OUT, 0, TAU);
  ctx.fillStyle = "#0d0d0d";
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#c00000";
  ctx.stroke();

  // Luces del aro (parpadean mientras gira)
  const BULBS = 28;
  const fase = Math.floor(t / 120) % 2;
  for (let i = 0; i < BULBS; i++) {
    const ang = (i / BULBS) * TAU;
    const on = (i + fase) % 2 === 0;
    const x = cx + Math.cos(ang) * (R_OUT - 22);
    const y = cx + Math.sin(ang) * (R_OUT - 22);
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, TAU);
    ctx.fillStyle = on ? "#fff4e0" : "#7a0000";
    ctx.shadowColor = on ? "rgba(255,220,180,.9)" : "transparent";
    ctx.shadowBlur = on ? 14 : 0;
    ctx.fill();
  }
  ctx.shadowBlur = 0;

  const n = lista.length;
  if (!n) {
    ctx.beginPath();
    ctx.arc(cx, cx, R, 0, TAU);
    ctx.fillStyle = "#1a1a1a";
    ctx.fill();
    ctx.fillStyle = "#8a8a8a";
    ctx.font = "600 34px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Sin participantes", cx, cx - R * 0.45);
  } else {
    const a = TAU / n;
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
  ctx.arc(cx, cx, R_HUB, 0, TAU);
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
