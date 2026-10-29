"use server";

import { revalidatePath } from "next/cache";
import { exigirSessao } from "@/lib/exigirSessao";
import { criarTabelas, marcar, sincronizarGitHub } from "@/lib/instalacao";
import { lerSegredosAgora, naVercel, salvarSegredos } from "@/lib/segredos";
import { aleatorio } from "@/lib/cripto";
import { ErroIA, extrairPerfilDoPdf, testarChaveGemini } from "@/lib/ia";
import { testarGmail } from "@/lib/email";
import { salvarCurriculo } from "@/lib/arquivos";
import { ErroGitHub, dispararWorkflow, ligarWorkflows, lerArquivo, salvarArquivos, verificarToken } from "@/lib/github";
import { normalizarPerfil, perfilYaml, problemasPerfil, type PerfilNovo } from "@/lib/montarPerfil";

// Ações do assistente de instalação (/instalar). Cada uma confere a sessão e valida tudo de novo aqui.

export type EstadoPassoAcao = { ok?: string; erro?: string; extra?: string } | null;

function pronto(ok: string, extra?: string): EstadoPassoAcao {
  revalidatePath("/", "layout");
  return { ok, extra };
}

// ------------------------------------------------------------------ 1. banco
export async function acaoCriarTabelas(): Promise<EstadoPassoAcao> {
  await exigirSessao();
  const erro = await criarTabelas();
  return erro ? { erro } : pronto("Tabelas criadas.");
}

// ------------------------------------------------------------------ 2. Gemini
export async function acaoSalvarGemini(_: EstadoPassoAcao, form: FormData): Promise<EstadoPassoAcao> {
  await exigirSessao();
  if (naVercel("GEMINI_API_KEY")) return { erro: "A chave está fixa nas variáveis da Vercel. Troque por lá." };
  const chave = String(form.get("chave") ?? "").trim();
  if (!/^[\w-]{30,60}$/.test(chave)) return { erro: "Essa não parece uma chave do Gemini. Ela começa com AIza e tem uns 39 caracteres." };
  const erro = await testarChaveGemini(chave);
  if (erro) return { erro };
  await salvarSegredos({ GEMINI_API_KEY: chave });
  return pronto("Chave testada e salva.");
}

// ------------------------------------------------------------------ 3. Gmail
export async function acaoSalvarGmail(_: EstadoPassoAcao, form: FormData): Promise<EstadoPassoAcao> {
  await exigirSessao();
  if (naVercel("GMAIL_USER") && naVercel("GMAIL_APP_PASSWORD")) return { erro: "O Gmail está fixo nas variáveis da Vercel. Troque por lá." };
  const usuario = String(form.get("usuario") ?? "").trim().toLowerCase();
  const senha = String(form.get("senha") ?? "").replace(/\s+/g, "");
  const telefone = String(form.get("telefone") ?? "").trim();
  if (!/^[^\s@]+@(gmail\.com|googlemail\.com|[\w-]+(\.[\w-]+)+)$/.test(usuario)) return { erro: "Digite o seu endereço do Gmail." };
  if (!/^[a-z]{16}$/i.test(senha)) return { erro: "A senha de app tem 16 letras (o Google mostra em 4 grupos de 4)." };
  if (telefone && !/^[\d\s()+-]{8,20}$/.test(telefone)) return { erro: "Telefone com números, espaços, parênteses ou traço." };
  const erro = await testarGmail(usuario, senha);
  if (erro) return { erro };
  await salvarSegredos({ GMAIL_USER: usuario, GMAIL_APP_PASSWORD: senha, CONTATO_TELEFONE: telefone || null });
  const erroGh = await sincronizarGitHub(); // se o GitHub já está ligado, a coleta passa a usar o Gmail novo
  return erroGh ? { erro: `Gmail salvo, mas ${erroGh}` } : pronto("Gmail testado e salvo.");
}

// ------------------------------------------------------------------ 4. GitHub
export async function acaoSalvarGitHub(_: EstadoPassoAcao, form: FormData): Promise<EstadoPassoAcao> {
  await exigirSessao();
  const token = String(form.get("token") ?? "").trim();
  if (!/^(github_pat_|ghp_)\w{20,}$/.test(token)) return { erro: "Esse não parece um token do GitHub. Ele começa com github_pat_." };
  const erro = await verificarToken(token);
  if (erro) return { erro };
  const atuais = await lerSegredosAgora();
  const novaSenhaBackup = atuais.BACKUP_SENHA ? null : aleatorio(18);
  await salvarSegredos({
    GITHUB_DISPATCH_TOKEN: token,
    CAPTURA_TOKEN: atuais.CAPTURA_TOKEN ?? aleatorio(24),
    ...(novaSenhaBackup ? { BACKUP_SENHA: novaSenhaBackup } : {}),
  });
  const erroGh = await sincronizarGitHub(token);
  if (erroGh) return { erro: erroGh };
  try {
    await ligarWorkflows(token);
  } catch (e) {
    return { erro: `Chaves salvas, mas ${(e as Error).message}. Abra a aba Actions do repositório e clique em "I understand… enable them".` };
  }
  return pronto("GitHub ligado: chaves guardadas no Actions e coleta ligada.", novaSenhaBackup ?? undefined);
}

// ------------------------------------------------------------------ 5. perfil
export type EstadoLeitura = { perfil?: PerfilNovo; erro?: string } | null;

export async function acaoLerCurriculo(_: EstadoLeitura, form: FormData): Promise<EstadoLeitura> {
  await exigirSessao();
  const arq = form.get("pdf");
  if (!(arq instanceof File) || arq.size === 0) return { erro: "Escolha o seu currículo em PDF." };
  if (arq.type !== "application/pdf" && !arq.name.toLowerCase().endsWith(".pdf")) return { erro: "O arquivo precisa ser PDF." };
  if (arq.size > 3.8 * 1024 * 1024) return { erro: "PDF maior que 3,8 MB. Exporte uma versão mais leve." };
  const bytes = await arq.arrayBuffer();
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return { erro: "Esse arquivo não é um PDF válido." };
  try {
    await salvarCurriculo(bytes); // é também o anexo dos emails
    const perfil = await extrairPerfilDoPdf(Buffer.from(bytes));
    if (!perfil.nome && !perfil.habilidades.length) return { erro: "Não consegui ler o texto do PDF. Ele precisa ter texto selecionável (não só imagem)." };
    return { perfil };
  } catch (e) {
    if (e instanceof ErroIA) return { erro: e.message };
    console.error("acaoLerCurriculo:", e);
    return { erro: "Não consegui ler o currículo agora. Tente de novo em instantes." };
  }
}

/** Junta o formulário de revisão: a base é o que a IA leu (campo "base"), com o que a pessoa mudou por cima. */
function perfilDoFormulario(form: FormData): PerfilNovo {
  let base: Partial<PerfilNovo> = {};
  try {
    base = JSON.parse(String(form.get("base") ?? "{}"));
  } catch {
    base = {};
  }
  const campo = (n: string) => String(form.get(n) ?? "");
  const habilidades = form.getAll("hab").map((h) => {
    try {
      return JSON.parse(String(h));
    } catch {
      return null;
    }
  });
  for (const nova of campo("hab_novas").split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)) {
    const padrao = nova.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    habilidades.push({ nome: nova, peso: 2, padroes: [padrao.length <= 3 ? `\\b${padrao}\\b` : padrao] });
  }
  const destaques = (base.destaques ?? []).map((d, i) => (form.get(`dest_manter_${i}`) ? { ...d, frase: campo(`dest_frase_${i}`) } : null));
  return normalizarPerfil({
    ...base,
    nome: campo("nome"),
    nome_curto: campo("nome_curto"),
    cargo: campo("cargo"),
    titulo: campo("titulo"),
    cidade: campo("cidade"),
    experiencia_resumo: campo("experiencia_resumo"),
    links: { linkedin: campo("linkedin"), github: campo("github"), portfolio: campo("portfolio") },
    habilidades,
    destaques: destaques.filter(Boolean),
    curriculo_md: campo("curriculo_md"),
  });
}

export async function acaoSalvarPerfil(_: EstadoPassoAcao, form: FormData): Promise<EstadoPassoAcao> {
  await exigirSessao();
  const perfil = perfilDoFormulario(form);
  const problemas = problemasPerfil(perfil);
  if (problemas.length) return { erro: problemas.join(" ") };
  const s = await lerSegredosAgora();
  if (!s.GITHUB_DISPATCH_TOKEN) return { erro: "Ligue o GitHub (passo 4) antes: o perfil fica salvo no seu repositório." };
  try {
    const atual = (await lerArquivo(s.GITHUB_DISPATCH_TOKEN, "perfil/perfil.yaml")) ?? "";
    await salvarArquivos(
      s.GITHUB_DISPATCH_TOKEN,
      [
        { caminho: "perfil/perfil.yaml", conteudo: perfilYaml(perfil, atual) },
        { caminho: "perfil/curriculo.md", conteudo: perfil.curriculo_md + "\n" },
      ],
      `Perfil de ${perfil.nome_curto} (assistente de instalação)`,
    );
  } catch (e) {
    if (e instanceof ErroGitHub) return { erro: `Não consegui salvar no GitHub: ${e.message}.` };
    throw e;
  }
  await marcar("perfil_salvo_em");
  return pronto("Perfil salvo no seu repositório. A Vercel publica o site de novo em 1 ou 2 minutos, já com ele.");
}

// ------------------------------------------------------------------ 7. primeira coleta
export async function acaoPrimeiraColeta(): Promise<EstadoPassoAcao> {
  await exigirSessao();
  const erro = await dispararWorkflow("coleta.yml", { tipo: "completa" });
  if (erro) return { erro: `Não consegui iniciar a coleta: ${erro}.` };
  await marcar("coleta_disparada_em");
  return pronto("Coleta iniciada. Leva de 5 a 10 minutos.");
}

// ------------------------------------------------------------------ atualizações
export async function acaoAtualizar(): Promise<EstadoPassoAcao> {
  await exigirSessao();
  const erro = await dispararWorkflow("atualizar.yml");
  if (erro) return { erro: `Não consegui iniciar a atualização: ${erro}.` };
  return { ok: "Atualização iniciada. Em uns 3 minutos o site novo está no ar (a página recarrega sozinha)." };
}
