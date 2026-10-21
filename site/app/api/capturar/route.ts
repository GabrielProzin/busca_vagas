import { NextResponse, type NextRequest } from "next/server";
import { capturar } from "@/lib/captura";
import { ErroIA } from "@/lib/ia";
import { iguais } from "@/lib/sessao";

// Recebe posts da extensão "Enviar para o busca_vagas".
// Autenticação por token fixo (CAPTURA_TOKEN), porque a extensão não tem o cookie de login.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const esperado = process.env.CAPTURA_TOKEN ?? "";
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (esperado.length < 24 || !iguais(recebido, esperado)) {
    return NextResponse.json({ ok: false, erro: "Token inválido. Confira o CAPTURA_TOKEN nas opções da extensão." }, { status: 401 });
  }
  let dados: { texto?: unknown; url?: unknown };
  try {
    dados = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo da requisição inválido." }, { status: 400 });
  }
  const texto = typeof dados.texto === "string" ? dados.texto.slice(0, 20000) : "";
  const url = typeof dados.url === "string" ? dados.url.slice(0, 2000) : null;
  try {
    const r = await capturar(texto, url);
    return NextResponse.json(r, { status: r.ok ? 200 : 422 });
  } catch (e) {
    const msg = e instanceof ErroIA ? e.message : "Falha ao processar a vaga.";
    return NextResponse.json({ ok: false, erro: msg }, { status: e instanceof ErroIA && e.tipo === "limite" ? 429 : 500 });
  }
}
