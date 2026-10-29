import "server-only";
import { lerConfiguracao, gravarConfiguracao, listarExecucoes, lerPreferencias, schemaCompleto } from "./db";
import { lerSegredos, lerSegredosAgora, naVercel } from "./segredos";
import { postgresUrl, supabaseChave, supabaseUrl, urlDoSite } from "./ambiente";
import { ORIGEM, REPO, gravarSecrets, ultimaExecucao, type Execucao } from "./github";
import { infoCurriculo } from "./arquivos";
import { PERFIL } from "./gerado/perfil";
import { SCHEMA_SQL } from "./gerado/schema";

// Assistente de instalação (/instalar): o que já está pronto nesta cópia e as ações de cada passo.
// Ver docs/spec.md, "Instalação".

/** Marcas sem segredo guardadas na tabela configuracao (texto puro). */
type Marca = "perfil_salvo_em" | "coleta_disparada_em";

export async function lerMarca(nome: Marca): Promise<string | null> {
  const c = await lerConfiguracao().catch(() => ({}) as Record<string, string>);
  return c[`marca:${nome}`] ?? null;
}
export async function marcar(nome: Marca, valor: string | null = new Date().toISOString()): Promise<void> {
  await gravarConfiguracao([{ chave: `marca:${nome}`, valor }]);
}

/** Dá para criar as tabelas daqui? Só com a conexão do Postgres que a integração Supabase da Vercel cria. */
export function podeCriarTabelas(): boolean {
  return Boolean(process.env.DEMO_ARQUIVO || postgresUrl());
}

/** Roda o supabase/schema.sql (só cria o que falta; nunca apaga). null = deu certo. */
export async function criarTabelas(): Promise<string | null> {
  if (process.env.DEMO_ARQUIVO) return null;
  const url = postgresUrl();
  if (!url) return "Este site não tem a conexão direta com o banco. Rode o SQL abaixo no Supabase (SQL Editor).";
  const { default: pg } = await import("pg");
  // O sslmode da URL faz o pg exigir certificado conferido; o do Supabase é de uma CA própria.
  const limpa = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const cliente = new pg.Client({ connectionString: limpa, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  try {
    await cliente.connect();
    await cliente.query(SCHEMA_SQL);
    return null;
  } catch (e) {
    console.error("criarTabelas:", e);
    return "Não consegui falar com o banco agora. Tente de novo em 1 minuto ou rode o SQL abaixo no Supabase.";
  } finally {
    await cliente.end().catch(() => {});
  }
}

export { SCHEMA_SQL };

/** Copia para os secrets do GitHub Actions o que a coleta e o envio da fila usam (eles rodam lá, não na Vercel). */
export async function sincronizarGitHub(token?: string): Promise<string | null> {
  const s = await lerSegredosAgora();
  const t = token ?? s.GITHUB_DISPATCH_TOKEN;
  if (!t) return null;
  const valores: Record<string, string> = {
    SUPABASE_URL: supabaseUrl(),
    SUPABASE_SERVICE_ROLE_KEY: supabaseChave(),
    GMAIL_USER: s.GMAIL_USER ?? "",
    GMAIL_APP_PASSWORD: s.GMAIL_APP_PASSWORD ?? "",
    RESUMO_PARA: s.ALERTA_PARA ?? s.GMAIL_USER ?? "",
    CONTATO_TELEFONE: s.CONTATO_TELEFONE ?? "",
    BACKUP_SENHA: s.BACKUP_SENHA ?? "",
    SITE_URL: urlDoSite(),
    PERFILUP_TOKEN: t, // o workflow Atualizar usa para mexer nos arquivos de workflow (o token do Actions não pode)
  };
  try {
    await gravarSecrets(t, valores);
    return null;
  } catch (e) {
    console.error("sincronizarGitHub:", e);
    return `Não consegui guardar as chaves no GitHub: ${(e as Error).message}.`;
  }
}

export type EstadoPasso = "pronto" | "falta" | "bloqueado";
export type Instalacao = {
  banco: { ok: boolean; podeCriar: boolean };
  gemini: { ok: boolean; fixo: boolean };
  gmail: { ok: boolean; fixo: boolean; usuario: string | null; telefone: string | null };
  github: { ok: boolean; repo: string };
  perfil: { ok: boolean; nome: string; cv: boolean };
  preferencias: { ok: boolean };
  coleta: { ok: boolean; disparada: string | null; execucao: Execucao | null };
  prontos: number;
  total: number;
  /** O básico (banco, Gmail, GitHub e perfil) está pronto. */
  essencial: boolean;
};

export async function estadoInstalacao(): Promise<Instalacao> {
  const [banco, s, execucoes, cv, prefs, perfilSalvo, disparada] = await Promise.all([
    schemaCompleto(),
    lerSegredos(),
    listarExecucoes(1).catch(() => [] as unknown[]),
    infoCurriculo().catch(() => null),
    lerPreferencias().catch(() => ({ salvas_em: null })),
    lerMarca("perfil_salvo_em"),
    lerMarca("coleta_disparada_em"),
  ]);
  const dono = (process.env.VERCEL_GIT_REPO_OWNER ?? "").toLowerCase();
  const perfilDoDono = Boolean(dono) && String(PERFIL.links.github ?? "").toLowerCase().includes(dono);
  const coletaOk = execucoes.length > 0;
  const execucao = !coletaOk && disparada && s.GITHUB_DISPATCH_TOKEN ? await ultimaExecucao("coleta.yml").catch(() => null) : null;

  const r = {
    banco: { ok: banco, podeCriar: podeCriarTabelas() },
    gemini: { ok: Boolean(s.GEMINI_API_KEY), fixo: naVercel("GEMINI_API_KEY") },
    gmail: {
      ok: Boolean(s.GMAIL_USER && s.GMAIL_APP_PASSWORD),
      fixo: naVercel("GMAIL_USER") && naVercel("GMAIL_APP_PASSWORD"),
      usuario: s.GMAIL_USER ?? null,
      telefone: s.CONTATO_TELEFONE ?? null,
    },
    github: { ok: Boolean(s.GITHUB_DISPATCH_TOKEN), repo: REPO },
    perfil: { ok: Boolean(perfilSalvo) || perfilDoDono, nome: PERFIL.nome, cv: Boolean(cv) },
    preferencias: { ok: Boolean(prefs.salvas_em) },
    coleta: { ok: coletaOk, disparada, execucao },
  };
  const lista = [r.banco.ok, r.gemini.ok, r.gmail.ok, r.github.ok, r.perfil.ok, r.preferencias.ok, r.coleta.ok];
  return {
    ...r,
    prontos: lista.filter(Boolean).length,
    total: lista.length,
    essencial: r.banco.ok && r.gmail.ok && r.github.ok && r.perfil.ok,
  };
}

/** Falta algo essencial? (o login manda para /instalar). Barato: sem chamar o GitHub. */
export async function instalacaoPendente(): Promise<boolean> {
  if (REPO && REPO.toLowerCase() === ORIGEM.toLowerCase()) return false; // o repositório original foi montado à mão
  if (!(await schemaCompleto())) return true;
  const s = await lerSegredos();
  if (!s.GMAIL_USER || !s.GMAIL_APP_PASSWORD || !s.GITHUB_DISPATCH_TOKEN) return true;
  const dono = (process.env.VERCEL_GIT_REPO_OWNER ?? "").toLowerCase();
  if (dono && String(PERFIL.links.github ?? "").toLowerCase().includes(dono)) return false;
  return !(await lerMarca("perfil_salvo_em"));
}
