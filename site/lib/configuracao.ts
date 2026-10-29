import "server-only";
import { lerPreferencias, listarExecucoes, schemaCompleto } from "./db";
import { textoLocal } from "./preferencias";
import { infoCurriculo } from "./arquivos";
import { gmailConfigurado } from "./email";
import { iaConfigurada } from "./ia";
import { PERFIL } from "./gerado/perfil";

// "Primeiros passos": o que já está pronto nesta cópia e o que falta, cada um com o passo do README.

export type Passo = {
  id: string;
  rotulo: string;
  ok: boolean;
  /** Sem ele o básico (ver vagas e mandar email) não funciona. */
  essencial: boolean;
  detalhe: string;
  ancora?: string; // âncora no README
  link?: string; // página do próprio site onde se resolve
};

/** Endereço do repositório no GitHub (variáveis de sistema da Vercel), para os links do README. */
export function urlRepositorio(): string | null {
  const dono = process.env.VERCEL_GIT_REPO_OWNER;
  const nome = process.env.VERCEL_GIT_REPO_SLUG;
  if (dono && nome) return `https://github.com/${dono}/${nome}`;
  return process.env.GITHUB_REPO ? `https://github.com/${process.env.GITHUB_REPO}` : null;
}

export async function passosConfiguracao(): Promise<Passo[]> {
  const [execucoes, schema, cv, prefs] = await Promise.all([
    listarExecucoes(1).catch(() => null),
    schemaCompleto(),
    infoCurriculo().catch(() => null),
    lerPreferencias(),
  ]);
  const dono = (process.env.VERCEL_GIT_REPO_OWNER ?? "").toLowerCase();
  const perfilDoDono = !dono || String(PERFIL.links.github ?? "").toLowerCase().includes(dono);
  const senha = process.env.SITE_PASSWORD ?? "";

  return [
    {
      id: "banco", rotulo: "Banco de dados conectado", essencial: true, ok: execucoes !== null && schema,
      detalhe: execucoes === null
        ? "O site não conseguiu ler o Supabase: confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel."
        : schema ? "Supabase respondendo, com todas as tabelas e colunas." : "Faltam colunas novas: rode de novo todo o supabase/schema.sql no SQL Editor (não apaga nada).",
      ancora: "3-crie-o-banco-no-supabase",
    },
    {
      id: "coleta", rotulo: "Primeira coleta de vagas", essencial: true, ok: Boolean(execucoes?.length),
      detalhe: execucoes?.length ? "A coleta já rodou e roda sozinha 5 vezes por dia." : "Rode a primeira: GitHub → Actions → Coleta de vagas → Run workflow.",
      ancora: "6-ligue-a-coleta-no-github",
    },
    {
      id: "perfil", rotulo: "Perfil e currículo são seus", essencial: true, ok: perfilDoDono,
      detalhe: perfilDoDono
        ? `Perfil de ${PERFIL.nome}.`
        : `O perfil ainda é o do modelo (${PERFIL.nome}). Troque perfil/curriculo.md, perfil/perfil.yaml e config/preferencias.yaml pelos seus.`,
      ancora: "2-coloque-o-seu-perfil",
    },
    {
      id: "gmail", rotulo: "Gmail para enviar", essencial: true, ok: gmailConfigurado(),
      detalhe: gmailConfigurado() ? `Envia como ${process.env.GMAIL_USER}.` : "Faltam GMAIL_USER e GMAIL_APP_PASSWORD (senha de app) na Vercel.",
      ancora: "4-prepare-o-gmail-e-o-gemini",
    },
    {
      id: "cv", rotulo: "Currículo em PDF anexado", essencial: true, ok: Boolean(cv),
      detalhe: cv ? `Salvo${cv.atualizado ? ` em ${new Date(cv.atualizado).toLocaleDateString("pt-BR")}` : ""}; vai em todo email.` : "Envie o PDF aqui embaixo, em “Currículo anexado”.",
    },
    {
      id: "ia", rotulo: "IA para escrever e resumir", essencial: false, ok: iaConfigurada(),
      detalhe: iaConfigurada() ? "Gemini pronto. Sem cota no dia, o site usa o modelo pronto." : "Falta GEMINI_API_KEY na Vercel. Sem ela, só o modelo pronto funciona.",
      ancora: "4-prepare-o-gmail-e-o-gemini",
    },
    {
      id: "envio", rotulo: "Envio da fila na hora", essencial: false, ok: Boolean(process.env.GITHUB_DISPATCH_TOKEN),
      detalhe: process.env.GITHUB_DISPATCH_TOKEN
        ? "Ao colocar vagas na fila, o site chama o GitHub e o envio começa em 1 ou 2 minutos."
        : "Sem GITHUB_DISPATCH_TOKEN na Vercel, a fila sai na rodada de hora em hora (7h às 21h).",
      ancora: "7-últimos-ajustes-no-site",
    },
    {
      id: "senha", rotulo: "Senha do site forte", essencial: false, ok: senha.length >= 12,
      detalhe: senha.length >= 12 ? "Senha com 12 caracteres ou mais." : "Use uma SITE_PASSWORD com 12 caracteres ou mais.",
      ancora: "variáveis-da-vercel",
    },
    {
      id: "extensao", rotulo: "Extensão do Chrome liberada", essencial: false, ok: (process.env.CAPTURA_TOKEN ?? "").length >= 24,
      detalhe: (process.env.CAPTURA_TOKEN ?? "").length >= 24 ? "CAPTURA_TOKEN configurado: instale a extensão e informe o mesmo valor nas opções." : "Para usar a extensão, crie CAPTURA_TOKEN (24+ caracteres) na Vercel.",
      ancora: "7-últimos-ajustes-no-site",
    },
    {
      id: "preferencias", rotulo: "Preferências da busca revisadas", essencial: false, ok: Boolean(prefs.salvas_em),
      detalhe: prefs.salvas_em
        ? `Salvas no site: ${textoLocal(prefs.prefs) || "sem local"}.`
        : "Confira remoto, híbrido ou presencial, as cidades, o nível e os termos de busca.",
      link: "/preferencias",
    },
    {
      id: "vigia", rotulo: "Vigia da coleta", essencial: false,
      ok: Boolean(process.env.CRON_SECRET && process.env.GITHUB_DISPATCH_TOKEN),
      detalhe: process.env.CRON_SECRET && process.env.GITHUB_DISPATCH_TOKEN
        ? "Se o GitHub pular um horário, a Vercel dispara a coleta e avisa você."
        : "Opcional: CRON_SECRET e GITHUB_DISPATCH_TOKEN na Vercel garantem a coleta mesmo quando o GitHub pula o horário.",
      ancora: "variáveis-da-vercel",
    },
  ];
}
