"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buscarVaga, enviadosHoje, mudarStatus, salvarCandidatura } from "@/lib/db";
import { ErroIA, emailModelo, gerarEmail } from "@/lib/ia";
import { enviarEmail } from "@/lib/email";
import { lerCurriculo, salvarCurriculo } from "@/lib/arquivos";
import { capturar } from "@/lib/captura";
import { COOKIE_SESSAO, DURACAO_S, criarSessao, senhaCorreta, sessaoValida } from "@/lib/sessao";
import type { Status } from "@/lib/tipos";

const STATUS_VALIDOS: Status[] = ["nova", "descartada", "aplicada", "enviada", "respondeu", "entrevista", "recusada", "proposta"];

// Server Functions são endpoints públicos: cada uma confere a sessão por conta própria.
async function exigirSessao() {
  if (!(await sessaoValida((await cookies()).get(COOKIE_SESSAO)?.value))) redirect("/login");
}

export async function entrar(_: { erro: string } | null, form: FormData) {
  const senha = String(form.get("senha") ?? "");
  // Pausa curta em toda tentativa: deixa adivinhação por força bruta lenta.
  await new Promise((r) => setTimeout(r, 600));
  if (!(await senhaCorreta(senha))) return { erro: "Senha incorreta." };
  (await cookies()).set(COOKIE_SESSAO, await criarSessao(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: DURACAO_S, path: "/",
  });
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}

export async function alterarStatus(form: FormData) {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as Status;
  if (!id || !STATUS_VALIDOS.includes(status)) return;
  await mudarStatus(id, status);
  revalidatePath("/", "layout");
}

export async function salvarNotas(form: FormData) {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await salvarCandidatura(id, { notas: String(form.get("notas") ?? "").slice(0, 4000) });
  revalidatePath("/", "layout");
}

// ------------------------------------------------------------------ email da candidatura

export type EstadoEmail = { ok?: string; erro?: string; assunto?: string; corpo?: string; para?: string } | null;

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const LIMITE_DIARIO = Number(process.env.LIMITE_DIARIO_EMAILS ?? 40);

/** Gera o rascunho (IA ou modelo pronto) e salva no banco. */
export async function gerarRascunho(_: EstadoEmail, form: FormData): Promise<EstadoEmail> {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  const modo = String(form.get("modo") ?? "ia");
  const v = await buscarVaga(id);
  if (!v) return { erro: "Vaga não encontrada." };
  let email;
  let aviso: string | undefined;
  if (modo === "modelo") {
    email = emailModelo(v);
  } else {
    try {
      email = await gerarEmail(v);
    } catch (e) {
      // Sem IA (sem chave, limite do dia ou falha): cai no modelo pronto e avisa.
      email = emailModelo(v);
      aviso = e instanceof ErroIA ? e.message : "A IA falhou.";
    }
  }
  const para = String(form.get("para") ?? "") || v.email_contato || "";
  await salvarCandidatura(id, { email_assunto: email.assunto, email_corpo: email.corpo, email_para: para || null });
  revalidatePath(`/vaga/${encodeURIComponent(id)}`);
  return {
    ok: aviso ? undefined : "Rascunho pronto. Revise antes de enviar.",
    erro: aviso ? `${aviso} Usei o modelo pronto no lugar.` : undefined,
    ...email,
    para,
  };
}

/** Envia de verdade pelo Gmail, com o currículo em anexo. */
export async function enviarCandidatura(_: EstadoEmail, form: FormData): Promise<EstadoEmail> {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  const para = String(form.get("para") ?? "").trim().toLowerCase();
  const assunto = String(form.get("assunto") ?? "").trim();
  const corpo = String(form.get("corpo") ?? "").trim();
  const devolver = { para, assunto, corpo };

  if (form.get("revisado") !== "on") return { ...devolver, erro: "Marque que revisou o email antes de enviar." };
  if (!EMAIL_RE.test(para)) return { ...devolver, erro: "Email do destinatário inválido." };
  if (assunto.length < 5 || corpo.length < 80) return { ...devolver, erro: "Assunto ou corpo muito curtos." };

  const v = await buscarVaga(id);
  if (!v) return { ...devolver, erro: "Vaga não encontrada." };
  if (v.candidatura?.status === "enviada") return { ...devolver, erro: "Você já enviou email para esta vaga." };
  if ((await enviadosHoje()) >= LIMITE_DIARIO) {
    return { ...devolver, erro: `Limite de ${LIMITE_DIARIO} emails por dia atingido (protege seu Gmail de bloqueio).` };
  }
  const cv = await lerCurriculo();
  if (!cv) return { ...devolver, erro: "Envie seu currículo em PDF em Configurações antes." };

  // Salva o texto final antes de enviar: se o envio falhar, nada se perde.
  await salvarCandidatura(id, { email_para: para, email_assunto: assunto, email_corpo: corpo });
  try {
    await enviarEmail({ para, assunto, corpo, anexo: cv, nomeAnexo: "Gabriel_Mendes_Cientista_de_Dados.pdf" });
  } catch (e) {
    return { ...devolver, erro: `O Gmail recusou o envio: ${(e as Error).message}` };
  }
  await salvarCandidatura(id, { status: "enviada", enviada_em: new Date().toISOString() });
  revalidatePath("/", "layout");
  return { ...devolver, ok: `Email enviado para ${para}.` };
}

// ------------------------------------------------------------------ configurações e captura

export async function enviarCurriculoPdf(_: EstadoEmail, form: FormData): Promise<EstadoEmail> {
  await exigirSessao();
  const arq = form.get("pdf");
  if (!(arq instanceof File) || arq.size === 0) return { erro: "Escolha um arquivo PDF." };
  if (arq.type !== "application/pdf" && !arq.name.toLowerCase().endsWith(".pdf")) return { erro: "O arquivo precisa ser PDF." };
  if (arq.size > 3.8 * 1024 * 1024) return { erro: "PDF maior que 3,8 MB. Exporte uma versão mais leve." };
  const bytes = await arq.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return { erro: "Esse arquivo não é um PDF válido." };
  await salvarCurriculo(bytes);
  revalidatePath("/configuracoes");
  return { ok: "Currículo salvo. Ele vai anexado em cada email." };
}

export async function adicionarVaga(_: EstadoEmail, form: FormData): Promise<EstadoEmail & { id?: string }> {
  await exigirSessao();
  const texto = String(form.get("texto") ?? "");
  const url = String(form.get("url") ?? "").trim() || null;
  try {
    const r = await capturar(texto, url);
    if (!r.ok) return { erro: r.erro };
    revalidatePath("/", "layout");
    redirect(`/vaga/${encodeURIComponent(r.id)}`);
  } catch (e) {
    if (e instanceof ErroIA) return { erro: e.message };
    throw e; // inclui o redirect, que o Next.js trata como exceção
  }
}
