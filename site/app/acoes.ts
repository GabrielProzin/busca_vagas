"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  buscarVaga, enfileirarVagas, enviadosHoje, excluirAnaliseCV, filaPronta, followupPronto, lerAnalise, mudarStatus,
  reservarEnvio, reservarFollowup, salvarAnaliseCV, salvarCandidatura, salvarMessageId, tirarVagaDaFila,
} from "@/lib/db";
import { dispararWorkflow } from "@/lib/github";
import { ErroIA, analisarParaVaga, avaliarCurriculo, emailModelo, followupModelo, gerarEmail, gerarFollowup, type AnaliseVagaIA, type AvaliacaoIA } from "@/lib/ia";
import { LIMITE_TEXTO, PESOS, ROTULOS, criteriosSemIA, habilidadesNoTexto, notaFinal, trechoReal } from "@/lib/cv";
import { enviarEmail, erroGmail } from "@/lib/email";
import { lerCurriculo, salvarCurriculo } from "@/lib/arquivos";
import { capturar, dominioExcluido } from "@/lib/captura";
import { PERFIL } from "@/lib/gerado/perfil";
import { COOKIE_SESSAO, DURACAO_S, criarSessao, senhaCorreta, sessaoValida } from "@/lib/sessao";
import type { CriterioCV, DadosAnaliseCV, Status } from "@/lib/tipos";

/** "Gabriel_Mendes_Cientista_de_Dados.pdf": nome e cargo do perfil, sem acentos nem espaços. */
function nomeDoPdf(): string {
  const base = [PERFIL.nomeCurto, PERFIL.cargo].filter(Boolean).join(" ");
  return `${base.normalize("NFD").replace(/\p{M}/gu, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "Curriculo"}.pdf`;
}

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
// Limite de emails por dia (site + fila): config/preferencias.yaml -> envio.limite_diario.
const LIMITE_DIARIO = PERFIL.envio.limiteDiario;

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
  if (dominioExcluido(para)) return { ...devolver, erro: "Esse domínio está na sua lista de excluídos (dominios_email_excluidos)." };
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
  // (e tira da fila, se estava nela: quem mandou agora foi você)
  await salvarCandidatura(id, { email_para: para, email_assunto: assunto, email_corpo: corpo, ...((await filaPronta()) ? { fila_em: null } : {}) });
  // Reserva o envio no banco (duas abas clicando juntas: só uma passa).
  const reserva = await reservarEnvio(id);
  if (!reserva.ok) return { ...devolver, erro: "Este email já foi enviado (ou está saindo agora em outra aba)." };
  let messageId: string;
  try {
    messageId = await enviarEmail({ para, assunto, corpo, anexo: cv, nomeAnexo: nomeDoPdf() });
  } catch (e) {
    const a = reserva.anterior;
    await salvarCandidatura(id, { status: a?.status && a.status !== "enviada" ? a.status : "nova", enviada_em: a?.enviada_em ?? null });
    return { ...devolver, erro: erroGmail(e) };
  }
  if (messageId) await salvarMessageId(id, messageId);
  revalidatePath("/", "layout");
  return { ...devolver, ok: `Email enviado para ${para}.` };
}

// ------------------------------------------------------------------ envio em lote (fila)

export type ItemLote = { id: string; para: string; assunto: string; corpo: string };
export type ResultadoLote = { ok?: string; erro?: string; aceitas?: string[] };

/** Coloca as vagas escolhidas na fila e pede ao GitHub para começar a enviar agora. */
export async function enfileirar(itens: ItemLote[]): Promise<ResultadoLote> {
  await exigirSessao();
  if (!Array.isArray(itens) || !itens.length) return { erro: "Escolha ao menos uma vaga." };
  if (itens.length > 100) return { erro: "No máximo 100 vagas por vez." };
  if (!(await filaPronta())) return { erro: "O banco ainda não tem as colunas da fila: rode de novo o supabase/schema.sql no Supabase." };
  const validos: { vagaId: string; para: string; assunto: string; corpo: string }[] = [];
  const recusadas: string[] = [];
  for (const it of itens) {
    const para = String(it.para ?? "").trim().toLowerCase();
    const assunto = String(it.assunto ?? "").trim().slice(0, 200);
    const corpo = String(it.corpo ?? "").trim().slice(0, 6000);
    if (!it.id || !EMAIL_RE.test(para) || dominioExcluido(para) || assunto.length < 5 || corpo.length < 80) recusadas.push(String(it.id));
    else validos.push({ vagaId: String(it.id), para, assunto, corpo });
  }
  const aceitas = await enfileirarVagas(validos);
  const falha = aceitas.length ? await dispararWorkflow("envio.yml") : null;
  revalidatePath("/", "layout");
  const n = aceitas.length;
  const fora = itens.length - n;
  return {
    aceitas,
    ok: n
      ? `${n} ${n === 1 ? "email entrou" : "emails entraram"} na fila.` +
        (falha ? " O envio sai na próxima rodada (de hora em hora)." : " O envio começa em 1 ou 2 minutos, com pausa entre eles.")
      : undefined,
    erro: fora ? `${fora} não ${fora === 1 ? "entrou" : "entraram"}: email inválido ou de domínio excluído, texto curto, ou a vaga já tinha decisão.` : undefined,
  };
}

export async function tirarDaFila(id: string): Promise<string | null> {
  await exigirSessao();
  const ok = await tirarVagaDaFila(String(id));
  revalidatePath("/", "layout");
  return ok ? null : "Esse email já saiu (ou não estava na fila).";
}

/** "Enviar agora": pede ao GitHub uma rodada de envio fora do horário de hora em hora. */
export async function enviarFilaAgora(): Promise<string | null> {
  await exigirSessao();
  return dispararWorkflow("envio.yml");
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

// ------------------------------------------------------------------ kanban e menus

/** Muda a etapa de uma candidatura (arrastar no kanban ou menu). Devolve erro em texto, ou null. */
export async function moverCandidatura(id: string, status: Status): Promise<string | null> {
  await exigirSessao();
  if (!id || !STATUS_VALIDOS.includes(status)) return "Etapa inválida.";
  try {
    await mudarStatus(id, status);
  } catch (e) {
    console.error("salvar candidatura:", e);
    return "Não consegui salvar agora. Tente de novo em instantes.";
  }
  revalidatePath("/", "layout");
  return null;
}

// ------------------------------------------------------------------ follow-up

const SEM_COLUNAS_FOLLOWUP =
  "Falta rodar no Supabase o SQL do follow-up (as 4 linhas de 21/10 no fim do supabase/schema.sql).";

/** Rascunho do follow-up (IA ou modelo pronto). Não salva nada: o texto só vale quando você envia. */
export async function gerarRascunhoFollowup(_: EstadoEmail, form: FormData): Promise<EstadoEmail> {
  await exigirSessao();
  const v = await buscarVaga(String(form.get("id") ?? ""));
  if (!v?.candidatura) return { erro: "Candidatura não encontrada." };
  if (form.get("modo") === "modelo") return followupModelo(v);
  try {
    return { ...(await gerarFollowup(v)), ok: "Rascunho pronto. Revise antes de enviar." };
  } catch (e) {
    return { ...followupModelo(v), erro: `${e instanceof ErroIA ? e.message : "A IA falhou."} Usei o modelo pronto no lugar.` };
  }
}

/** Envia o follow-up como resposta ao primeiro email (sem anexo: o currículo já está na conversa). */
export async function enviarFollowup(_: EstadoEmail, form: FormData): Promise<EstadoEmail> {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  const assunto = String(form.get("assunto") ?? "").trim();
  const corpo = String(form.get("corpo") ?? "").trim();
  const devolver = { assunto, corpo };
  if (form.get("revisado") !== "on") return { ...devolver, erro: "Marque que revisou o follow-up antes de enviar." };
  if (assunto.length < 5 || corpo.length < 60) return { ...devolver, erro: "Assunto ou mensagem muito curtos." };
  const v = await buscarVaga(id);
  const c = v?.candidatura;
  if (!v || !c || c.status !== "enviada") return { ...devolver, erro: "O follow-up por email vale para candidaturas em “Email enviado”." };
  const para = (c.email_para ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(para)) return { ...devolver, erro: "Esta candidatura não tem o email do destinatário salvo." };
  if (!(await followupPronto())) return { ...devolver, erro: SEM_COLUNAS_FOLLOWUP };
  const feitos = c.followups ?? 0;
  const reserva = await reservarFollowup(id, feitos);
  if (!reserva.ok) return { ...devolver, erro: "Este follow-up já foi enviado (ou está saindo agora em outra aba)." };
  try {
    await enviarEmail({ para, assunto, corpo, emResposta: c.email_message_id });
  } catch (e) {
    await salvarCandidatura(id, { followups: feitos, followup_em: reserva.anterior });
    return { ...devolver, erro: erroGmail(e) };
  }
  revalidatePath("/", "layout");
  return { ...devolver, ok: `Follow-up enviado para ${para}.` };
}

/** Você fez o follow-up por fora (LinkedIn, plataforma, telefone): só registra e reinicia a contagem. */
export async function marcarFollowup(id: string): Promise<string | null> {
  await exigirSessao();
  const v = await buscarVaga(id);
  const c = v?.candidatura;
  if (!c || (c.status !== "aplicada" && c.status !== "enviada")) return "Esta candidatura não está esperando resposta.";
  if (!(await followupPronto())) return SEM_COLUNAS_FOLLOWUP;
  try {
    await salvarCandidatura(id, { followup_em: new Date().toISOString(), followups: (c.followups ?? 0) + 1 });
  } catch (e) {
    console.error("salvar candidatura:", e);
    return "Não consegui salvar agora. Tente de novo em instantes.";
  }
  revalidatePath("/", "layout");
  return null;
}


// ------------------------------------------------------------------ análise do currículo
// Ver docs/spec.md, "Análise de CV". Valida tudo no servidor; a IA é opcional (sem ela, a nota usa 3 critérios).

export type EstadoAnalise = { erro: string } | null;

const MAX_PERGUNTAS = 10;
const MAX_PERGUNTA = 500;

export async function analisarCV(_: EstadoAnalise, form: FormData): Promise<EstadoAnalise> {
  await exigirSessao();
  const tipo = form.get("tipo") === "vaga" ? "vaga" : "geral";
  const colado = form.get("fonte") === "colado";
  const texto = colado ? String(form.get("texto") ?? "").trim() : PERFIL.curriculo;
  if (colado && texto.length < 300) return { erro: "Cole o currículo inteiro (o texto está curto demais para avaliar)." };
  if (texto.length > LIMITE_TEXTO) return { erro: `O currículo passou de ${LIMITE_TEXTO.toLocaleString("pt-BR")} caracteres. Cole só o texto, sem repetições.` };
  const versao = colado ? String(form.get("versao") ?? "").trim().slice(0, 60) || null : null;

  // Para vaga: da lista ou colada, mais as perguntas do formulário (uma por linha).
  let vaga: { id: string | null; titulo: string; empresa: string | null; texto: string; nota: number | null } | null = null;
  let perguntas: string[] = [];
  if (tipo === "vaga") {
    const vagaId = String(form.get("vaga_id") ?? "").trim();
    if (vagaId && vagaId !== "colar") {
      const v = await buscarVaga(vagaId);
      if (!v) return { erro: "Não achei essa vaga. Recarregue a página e escolha de novo." };
      vaga = { id: v.id, titulo: v.titulo, empresa: v.empresa, texto: `${v.titulo}${v.empresa ? ` (${v.empresa})` : ""}\n${v.descricao ?? ""}`, nota: v.nota };
    } else {
      const t = String(form.get("vaga_texto") ?? "").trim();
      if (t.length < 80) return { erro: "Escolha uma vaga da lista ou cole o texto da vaga (ele está curto demais)." };
      if (t.length > LIMITE_TEXTO) return { erro: "O texto da vaga está longo demais. Cole só a descrição." };
      const primeira = t.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "Vaga colada";
      vaga = { id: null, titulo: primeira.slice(0, 90), empresa: null, texto: t, nota: null };
    }
    perguntas = String(form.get("perguntas") ?? "").split(/\r?\n/).map((p) => p.trim()).filter(Boolean);
    if (perguntas.length > MAX_PERGUNTAS) return { erro: `Use até ${MAX_PERGUNTAS} perguntas por análise.` };
    if (perguntas.some((p) => p.length > MAX_PERGUNTA)) return { erro: `Cada pergunta pode ter até ${MAX_PERGUNTA} caracteres.` };
  }

  // Critérios calculados (sempre) + leitura da IA (quando houver chave e cota).
  const mercado = (await lerAnalise("estudar"))?.habilidades ?? null;
  const criterios: CriterioCV[] = criteriosSemIA(texto, mercado);
  let ia: AvaliacaoIA | null = null;
  let semIa: string | null = null;
  try {
    ia = await avaliarCurriculo(texto);
  } catch (e) {
    console.error("analisarCV: avaliação", e);
    semIa = e instanceof ErroIA ? e.message : "A IA não respondeu agora.";
  }
  criterios.push({
    chave: "escrita", rotulo: ROTULOS.escrita, peso: PESOS.escrita, nota: ia ? ia.escrita : null,
    motivo: ia ? ia.escrita_motivo || "Avaliado pela IA." : `Ficou de fora: ${semIa}`,
  });

  let paraVaga: AnaliseVagaIA | null = null;
  if (vaga) {
    try {
      paraVaga = await analisarParaVaga(texto, vaga.texto, perguntas);
    } catch (e) {
      console.error("analisarCV: vaga", e);
      semIa = semIa ?? (e instanceof ErroIA ? e.message : "A IA não respondeu agora.");
    }
  }
  // Sem IA na parte da vaga: o que destacar e as lacunas saem do catálogo de habilidades.
  const naVaga = vaga ? habilidadesNoTexto(vaga.texto) : new Set<string>();
  const noCv = habilidadesNoTexto(texto);
  const conexao = vaga ? (vaga.nota !== null ? Math.round(vaga.nota) : paraVaga?.conexao ?? Math.round((100 * [...naVaga].filter((h) => noCv.has(h)).length) / Math.max(1, naVaga.size))) : null;

  const dados: DadosAnaliseCV = {
    criterios,
    nivel: ia?.nivel ?? null,
    nivel_motivo: ia?.nivel_motivo || null,
    proximo_nivel: ia?.proximo_nivel ?? [],
    fortes: ia?.fortes ?? [],
    melhorias: (ia?.melhorias ?? []).map((m) => ({ trecho: trechoReal(texto, m.trecho), sugestao: m.sugestao })),
    resumo: ia?.resumo || null,
    sem_ia: semIa,
    texto,
    ...(vaga
      ? {
          vaga: { titulo: vaga.titulo, empresa: vaga.empresa },
          destacar: paraVaga?.destacar ?? [...naVaga].filter((h) => noCv.has(h)).slice(0, 4),
          lacunas: paraVaga?.lacunas ?? [...naVaga].filter((h) => !noCv.has(h)).slice(0, 4),
          respostas: paraVaga?.respostas ?? perguntas.map((p) => ({ pergunta: p, resposta: "", confirmar: "A IA não estava disponível para responder. Tente de novo mais tarde." })),
        }
      : {}),
  };
  const quando = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" }).format(new Date()).replace(".", "");
  const titulo = vaga
    ? `${vaga.titulo}${vaga.empresa ? ` – ${vaga.empresa}` : ""}`.slice(0, 140)
    : `CV · geral${versao ? ` · ${versao}` : ""} · ${quando}`;

  let id: number;
  try {
    id = await salvarAnaliseCV({ tipo, titulo, nota: notaFinal(criterios), conexao, vaga_id: vaga?.id ?? null, versao, dados });
  } catch (e) {
    console.error("analisarCV: salvar", e);
    return { erro: "Não consegui salvar a análise. Rode de novo o supabase/schema.sql no SQL Editor (tabela analises_cv)." };
  }
  revalidatePath("/perfil", "layout");
  redirect(`/perfil/cv/${id}`);
}

export async function apagarAnaliseCV(form: FormData) {
  await exigirSessao();
  const id = Number(form.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  await excluirAnaliseCV(id);
  revalidatePath("/perfil", "layout");
  redirect("/perfil/cv");
}
