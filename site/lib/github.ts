import "server-only";
import { selar } from "./selado";
import { segredo } from "./segredos";

// GitHub da cópia de cada pessoa: dispara a coleta e o envio da fila, e (no assistente de instalação) grava os
// secrets do Actions, liga os workflows e salva os arquivos do perfil. Tudo com o token fine-grained da pessoa,
// limitado ao repositório dela. O repositório vem das variáveis de sistema da Vercel; GITHUB_REPO sobrescreve.

export const REPO =
  process.env.GITHUB_REPO ??
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "");

/** Repositório de onde as cópias puxam as atualizações (o mesmo do workflow "Atualizar"). */
export const ORIGEM = process.env.PERFILUP_ORIGEM ?? "GabrielProzin/busca_vagas";

const API = () => process.env.GITHUB_API_URL ?? "https://api.github.com"; // trocável só para testes
/** Modo demonstração sem servidor falso do GitHub: as chamadas fingem que deu certo. */
const simulado = () => Boolean(process.env.DEMO_ARQUIVO && !process.env.GITHUB_API_URL);

export class ErroGitHub extends Error {}

async function gh<T>(token: string, caminho: string, init: RequestInit = {}): Promise<{ status: number; dados: T | null }> {
  const r = await fetch(`${API()}${caminho}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string>),
    },
    cache: "no-store",
  });
  const texto = await r.text();
  let dados: T | null = null;
  try {
    dados = texto ? (JSON.parse(texto) as T) : null;
  } catch {
    dados = null;
  }
  return { status: r.status, dados };
}

/** null = disparado; texto = por que não deu. */
export async function dispararWorkflow(arquivo: "coleta.yml" | "envio.yml" | "atualizar.yml", inputs?: Record<string, string>): Promise<string | null> {
  if (simulado()) return null;
  const token = await segredo("GITHUB_DISPATCH_TOKEN");
  if (!token) return "falta o token do GitHub (assistente de instalação)";
  if (!REPO) return "não sei qual é o repositório: defina GITHUB_REPO (dono/nome) na Vercel";
  try {
    const { status } = await gh(token, `/repos/${REPO}/actions/workflows/${arquivo}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref: await ramoPadrao(token), ...(inputs ? { inputs } : {}) }),
    });
    return status === 204 ? null : `GitHub respondeu ${status}`;
  } catch (e) {
    return `erro ao chamar o GitHub: ${(e as Error).message}`;
  }
}

async function ramoPadrao(token: string): Promise<string> {
  const { dados } = await gh<{ default_branch?: string }>(token, `/repos/${REPO}`).catch(() => ({ dados: null }));
  return dados?.default_branch ?? "main";
}

// ------------------------------------------------------------------ assistente de instalação

/** Link para criar o token já com o nome, a validade e as permissões marcadas (a pessoa só escolhe o repositório). */
export function linkNovoToken(): string {
  const p = new URLSearchParams({
    name: "PerfilUp",
    description: `Usado pelo site ${REPO || "do busca_vagas"} para ligar a coleta, guardar as chaves do GitHub Actions e se atualizar.`,
    expires_in: "365",
    actions: "write",
    secrets: "write",
    contents: "write",
    workflows: "write",
    pull_requests: "write",
  });
  if (REPO) p.set("target_name", REPO.split("/")[0]);
  return `https://github.com/settings/personal-access-tokens/new?${p.toString()}`;
}

/** Confere se o token abre o repositório e tem as permissões que o assistente usa. null = tudo certo. */
export async function verificarToken(token: string): Promise<string | null> {
  if (simulado()) return token.length >= 20 ? null : "Esse token parece incompleto. Copie de novo, inteiro.";
  if (!REPO) return "Não sei qual é o seu repositório. O site precisa estar ligado ao GitHub pela Vercel.";
  const repo = await gh(token, `/repos/${REPO}`);
  if (repo.status === 401) return "O GitHub não aceitou esse token. Copie de novo, inteiro (começa com github_pat_).";
  if (repo.status === 404) return `O token não enxerga o repositório ${REPO}. Em "Repository access", escolha "Only select repositories" e marque ${REPO.split("/")[1]}.`;
  if (repo.status !== 200) return `O GitHub respondeu ${repo.status} ao abrir o repositório.`;
  const chave = await gh(token, `/repos/${REPO}/actions/secrets/public-key`);
  if (chave.status !== 200) return "Falta a permissão Secrets: Read and write no token.";
  const wf = await gh(token, `/repos/${REPO}/actions/workflows`);
  if (wf.status !== 200) return "Falta a permissão Actions: Read and write no token.";
  return null;
}

/** Grava os secrets do GitHub Actions (cifrados com a chave pública do repositório, como o GitHub exige). */
export async function gravarSecrets(token: string, valores: Record<string, string>): Promise<void> {
  if (simulado()) return;
  const { status, dados } = await gh<{ key: string; key_id: string }>(token, `/repos/${REPO}/actions/secrets/public-key`);
  if (status !== 200 || !dados) throw new ErroGitHub(`não li a chave pública do repositório (${status})`);
  for (const [nome, valor] of Object.entries(valores)) {
    if (!valor) continue;
    const cifrado = selar(valor, dados.key);
    const r = await gh(token, `/repos/${REPO}/actions/secrets/${nome}`, {
      method: "PUT",
      body: JSON.stringify({ encrypted_value: cifrado, key_id: dados.key_id }),
    });
    if (r.status !== 201 && r.status !== 204) throw new ErroGitHub(`não gravei o secret ${nome} (${r.status})`);
  }
}

/** Liga os workflows da coleta, do envio e da atualização (repositórios novos às vezes vêm com eles parados). */
export async function ligarWorkflows(token: string): Promise<void> {
  if (simulado()) return;
  for (const arq of ["coleta.yml", "envio.yml", "atualizar.yml"]) {
    const r = await gh(token, `/repos/${REPO}/actions/workflows/${arq}/enable`, { method: "PUT" });
    if (r.status !== 204 && r.status !== 404) throw new ErroGitHub(`não liguei o workflow ${arq} (${r.status})`);
  }
}

/** Conteúdo atual de um arquivo do repositório (null se não existe). */
export async function lerArquivo(token: string, caminho: string): Promise<string | null> {
  if (simulado()) return null;
  const { status, dados } = await gh<{ content?: string; encoding?: string }>(token, `/repos/${REPO}/contents/${caminho.split("/").map(encodeURIComponent).join("/")}`);
  if (status !== 200 || !dados?.content) return null;
  return Buffer.from(dados.content, (dados.encoding as BufferEncoding) ?? "base64").toString("utf-8");
}

/** Salva vários arquivos num commit só (Git Data API). A Vercel republica o site sozinha depois. */
export async function salvarArquivos(token: string, arquivos: { caminho: string; conteudo: string }[], mensagem: string): Promise<void> {
  if (simulado()) return;
  const ramo = await ramoPadrao(token);
  const ref = await gh<{ object: { sha: string } }>(token, `/repos/${REPO}/git/ref/heads/${ramo}`);
  if (ref.status !== 200 || !ref.dados) throw new ErroGitHub(`não li o ramo ${ramo} (${ref.status})`);
  const pai = ref.dados.object.sha;
  const commitPai = await gh<{ tree: { sha: string } }>(token, `/repos/${REPO}/git/commits/${pai}`);
  if (!commitPai.dados) throw new ErroGitHub("não li o último commit");
  const arvore = await gh<{ sha: string }>(token, `/repos/${REPO}/git/trees`, {
    method: "POST",
    body: JSON.stringify({
      base_tree: commitPai.dados.tree.sha,
      tree: arquivos.map((a) => ({ path: a.caminho, mode: "100644", type: "blob", content: a.conteudo })),
    }),
  });
  if (arvore.status !== 201 || !arvore.dados) throw new ErroGitHub(`não montei os arquivos (${arvore.status}); confira a permissão Contents: Read and write`);
  const commit = await gh<{ sha: string }>(token, `/repos/${REPO}/git/commits`, {
    method: "POST",
    body: JSON.stringify({ message: mensagem, tree: arvore.dados.sha, parents: [pai] }),
  });
  if (commit.status !== 201 || !commit.dados) throw new ErroGitHub(`não criei o commit (${commit.status})`);
  const atual = await gh(token, `/repos/${REPO}/git/refs/heads/${ramo}`, { method: "PATCH", body: JSON.stringify({ sha: commit.dados.sha }) });
  if (atual.status !== 200) throw new ErroGitHub(`não atualizei o ramo ${ramo} (${atual.status})`);
}

export type Execucao = { estado: "nenhuma" | "na_fila" | "rodando" | "ok" | "falhou"; url: string | null; quando: string | null };

/** Última execução de um workflow (para o assistente mostrar o andamento da primeira coleta). */
export async function ultimaExecucao(arquivo: string): Promise<Execucao> {
  if (simulado()) return { estado: "ok", url: null, quando: new Date().toISOString() };
  const token = await segredo("GITHUB_DISPATCH_TOKEN");
  if (!token || !REPO) return { estado: "nenhuma", url: null, quando: null };
  const { dados } = await gh<{ workflow_runs: { status: string; conclusion: string | null; html_url: string; created_at: string }[] }>(
    token, `/repos/${REPO}/actions/workflows/${arquivo}/runs?per_page=1`,
  );
  const r = dados?.workflow_runs?.[0];
  if (!r) return { estado: "nenhuma", url: null, quando: null };
  const estado = r.status !== "completed" ? (r.status === "queued" ? "na_fila" : "rodando") : r.conclusion === "success" ? "ok" : "falhou";
  return { estado, url: r.html_url, quando: r.created_at };
}

// ------------------------------------------------------------------ atualizações
export type Versao = { nova: boolean; resumo: string | null; data: string | null };

/** Há versão mais nova no repositório de origem? A versão desta cópia está em .versao ("sha data", escrito pelo
 *  workflow Atualizar); sem ele (cópia recém-criada), vale a data de criação do repositório. */
export async function verificarAtualizacao(versao: string): Promise<Versao> {
  const nada = { nova: false, resumo: null, data: null };
  if (simulado()) return nada;
  const token = await segredo("GITHUB_DISPATCH_TOKEN");
  if (!token || !REPO || REPO.toLowerCase() === ORIGEM.toLowerCase()) return nada; // a própria origem não se atualiza
  const { status, dados } = await gh<{ sha: string; commit: { message: string; committer: { date: string } } }>(token, `/repos/${ORIGEM}/commits/main`);
  if (status !== 200 || !dados) return nada;
  const [sha, data] = versao.split(" ");
  let desde = data ?? "";
  if (sha && sha === dados.sha) return nada;
  if (!desde) {
    const repo = await gh<{ created_at: string }>(token, `/repos/${REPO}`);
    desde = repo.dados?.created_at ?? "";
  }
  if (desde && Date.parse(dados.commit.committer.date) <= Date.parse(desde)) return nada;
  return { nova: true, resumo: dados.commit.message.split("\n")[0].slice(0, 140), data: dados.commit.committer.date };
}
