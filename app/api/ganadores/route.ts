import { NextResponse } from "next/server";
import { obtenerGanadores } from "@/lib/ganadores";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

export async function GET() {
  try {
    const ganadores = await obtenerGanadores();
    return NextResponse.json(
      { ganadores },
      { headers: { ...CORS, "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30" } },
    );
  } catch {
    return NextResponse.json({ error: "No se pudieron cargar los ganadores" }, { status: 500, headers: CORS });
  }
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
