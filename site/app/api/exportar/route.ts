import { NextResponse, type NextRequest } from "next/server";
import { exportarDados } from "@/lib/db";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";

// Baixa um JSON com todas as suas candidaturas e as vagas delas (cópia de segurança manual / LGPD).
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await sessaoValida(req.cookies.get(COOKIE_SESSAO)?.value))) {
    return NextResponse.json({ ok: false, erro: "Entre no site para exportar." }, { status: 401 });
  }
  try {
    const dados = await exportarDados();
    const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    return new NextResponse(JSON.stringify({ exportado_em: new Date().toISOString(), ...dados }, null, 1), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="busca_vagas-${hoje}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("exportar:", e);
    return NextResponse.json({ ok: false, erro: "Não consegui exportar agora. Tente de novo em instantes." }, { status: 500 });
  }
}
