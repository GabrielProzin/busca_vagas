import { NextResponse } from "next/server";
import { listarExecucoes } from "@/lib/db";

// Endereço de saúde para um monitor externo grátis (ex.: UptimeRobot) checar a cada poucos minutos.
// Público e sem dados: só diz se o site e o banco respondem, e há quantas horas foi a última coleta.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [ultima] = await listarExecucoes(1);
    const horas = ultima ? Math.round((Date.now() - Date.parse(ultima.iniciada_em)) / 36e5) : null;
    return NextResponse.json({ ok: true, banco: "ok", ultima_coleta_horas: horas }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, banco: "fora" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
