import { NextResponse, type NextRequest } from "next/server";
import { capturar, type MotivoRecusa } from "@/lib/captura";
import { ErroIA } from "@/lib/ia";
import { iguais } from "@/lib/sessao";

// Captura em lote: a extensão manda os posts com email que estão na sua tela do LinkedIn.
// Até 8 por chamada (a extensão divide), lidos 3 de cada vez para caber no tempo e no limite da IA.

export const runtime = "nodejs";
export const maxDuration = 60;

type Post = { id?: unknown; texto?: unknown; url?: unknown };

export async function POST(req: NextRequest) {
  const esperado = process.env.CAPTURA_TOKEN ?? "";
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (esperado.length < 24 || !iguais(recebido, esperado)) {
    return NextResponse.json({ ok: false, erro: "Token inválido. Confira o CAPTURA_TOKEN nas opções da extensão." }, { status: 401 });
  }
  let posts: Post[];
  try {
    const corpo = await req.json();
    posts = Array.isArray(corpo?.posts) ? corpo.posts.slice(0, 8) : [];
  } catch {
    return NextResponse.json({ ok: false, erro: "Corpo da requisição inválido." }, { status: 400 });
  }

  const novas: { id: string; titulo: string; nota: number; email: string | null }[] = [];
  const recusadas: Partial<Record<MotivoRecusa | "erro", number>> = {};
  let limite = false;
  const fila = [...posts];

  async function trabalhar() {
    while (fila.length && !limite) {
      const p = fila.shift()!;
      const texto = typeof p.texto === "string" ? p.texto.slice(0, 12000) : "";
      const url = typeof p.url === "string" ? p.url.slice(0, 500) : null;
      const idPost = typeof p.id === "string" ? p.id : null;
      try {
        const r = await capturar(texto, url, { idPost, lote: true });
        if (r.ok) novas.push({ id: r.id, titulo: r.titulo, nota: r.nota, email: r.email });
        else recusadas[r.motivo] = (recusadas[r.motivo] ?? 0) + 1;
      } catch (e) {
        if (e instanceof ErroIA && e.tipo === "limite") limite = true;
        else recusadas.erro = (recusadas.erro ?? 0) + 1;
      }
    }
  }
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
  return NextResponse.json({ ok: true, novas, recusadas, limite, naoLidos: limite ? fila.length : 0 });
}
