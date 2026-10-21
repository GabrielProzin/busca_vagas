import { NextResponse, type NextRequest } from "next/server";
import { listarExecucoes } from "@/lib/db";
import { enviarEmail } from "@/lib/email";
import { iguais } from "@/lib/sessao";

// Vigia da coleta (cron da Vercel, ~12h e ~19h). O agendamento do GitHub às vezes pula horários:
// - última coleta com mais de 3h -> dispara a coleta no GitHub (precisa do GITHUB_DISPATCH_TOKEN);
// - mais de 26h sem coleta, ou disparo que falhou -> email de alerta para você.
// A Vercel manda "Authorization: Bearer <CRON_SECRET>" nas chamadas do cron.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// O repositório vem das variáveis de sistema da Vercel (projeto ligado ao GitHub); GITHUB_REPO sobrescreve.
const REPO =
  process.env.GITHUB_REPO ??
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "");

async function disparar(): Promise<string | null> {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return "GITHUB_DISPATCH_TOKEN não configurado na Vercel";
  if (!REPO) return "não sei qual é o repositório: defina GITHUB_REPO (dono/nome) na Vercel";
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/coleta.yml/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
    cache: "no-store",
  });
  return r.status === 204 ? null : `GitHub respondeu ${r.status}`;
}

export async function GET(req: NextRequest) {
  const segredo = process.env.CRON_SECRET ?? "";
  const recebido = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (segredo.length < 16 || !iguais(recebido, segredo)) return NextResponse.json({ ok: false }, { status: 401 });

  const [ultima] = await listarExecucoes(1).catch(() => []);
  const horas = ultima ? (Date.now() - Date.parse(ultima.iniciada_em)) / 36e5 : Infinity;
  let acao = "nada a fazer";
  let falha: string | null = null;
  if (horas > 3) {
    falha = await disparar().catch((e) => `erro ao chamar o GitHub: ${(e as Error).message}`);
    acao = falha ? `disparo falhou: ${falha}` : "coleta disparada no GitHub";
  }
  if (falha || horas > 26) {
    const quando = Number.isFinite(horas) ? `há ${Math.round(horas)} horas` : "nunca";
    const linhas = [
      `A última coleta de vagas foi ${quando}.`,
      falha ? `Tentei disparar a coleta pelo GitHub e não consegui: ${falha}.` : "Disparei a coleta pelo GitHub; confira em Actions se ela terminou.",
      `Repositório: https://github.com/${REPO}/actions`,
    ];
    await enviarEmail({
      para: process.env.ALERTA_PARA || process.env.GMAIL_USER || "",
      assunto: "busca_vagas: a coleta de vagas está atrasada",
      corpo: linhas.join("\n\n"),
    }).catch((e) => console.error("vigia: alerta não enviado:", e));
  }
  console.log(`vigia: última coleta há ${horas.toFixed(1)}h; ${acao}`);
  return NextResponse.json({ ok: true, horas: Number.isFinite(horas) ? Math.round(horas * 10) / 10 : null, acao });
}
