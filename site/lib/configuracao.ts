import "server-only";
import { lerPreferencias, listarExecucoes, schemaCompleto } from "./db";
import { lerSegredos } from "./segredos";
import { textoLocal } from "./preferencias";
import { infoCurriculo } from "./arquivos";
import { gmailConfigurado } from "./email";
import { iaConfigurada } from "./ia";
import { PERFIL } from "./gerado/perfil";
import { lerMarca } from "./instalacao";

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
  const [execucoes, schema, cv, prefs, seg, ia, gmail, perfilSalvo] = await Promise.all([
    listarExecucoes(1).catch(() => null),
    schemaCompleto(),
    infoCurriculo().catch(() => null),
    lerPreferencias(),
    lerSegredos(),
    iaConfigurada(),
    gmailConfigurado(),
    lerMarca("perfil_salvo_em"),
  ]);
  const dono = (process.env.VERCEL_GIT_REPO_OWNER ?? "").toLowerCase();
  const perfilDoDono = !dono || String(PERFIL.links.github ?? "").toLowerCase().includes(dono) || Boolean(perfilSalvo);
  const senha = process.env.SITE_PASSWORD ?? "";

  return [
    {
      id: "banco", rotulo: "Banco de dados conectado", essencial: true, ok: execucoes !== null && schema,
      detalhe: execucoes === null
        ? "O site não conseguiu ler o Supabase: confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel."
        : schema ? "Supabase respondendo, com todas as tabelas e colunas." : "Faltam tabelas ou colunas novas. O assistente cria para você.",
      ancora: "como-instalar-uns-15-minutos",
      link: "/instalar",
    },
    {
      id: "coleta", rotulo: "Primeira coleta de vagas", essencial: true, ok: Boolean(execucoes?.length),
      detalhe: execucoes?.length ? "A coleta já rodou e roda sozinha 5 vezes por dia." : "Rode a primeira pelo assistente de instalação.",
      ancora: "como-instalar-uns-15-minutos",
      link: "/instalar",
    },
    {
      id: "perfil", rotulo: "Perfil e currículo são seus", essencial: true, ok: perfilDoDono,
      detalhe: perfilDoDono
        ? `Perfil de ${PERFIL.nome}.`
        : `O perfil ainda é o do modelo (${PERFIL.nome}). O assistente monta o seu a partir do currículo em PDF.`,
      ancora: "como-instalar-uns-15-minutos",
      link: "/instalar",
    },
    {
      id: "gmail", rotulo: "Gmail para enviar", essencial: true, ok: gmail,
      detalhe: gmail ? `Envia como ${seg.GMAIL_USER}.` : "Falta o Gmail e a senha de app.",
      ancora: "como-instalar-uns-15-minutos",
      link: "/instalar",
    },
    {
      id: "cv", rotulo: "Currículo em PDF anexado", essencial: true, ok: Boolean(cv),
      detalhe: cv ? `Salvo${cv.atualizado ? ` em ${new Date(cv.atualizado).toLocaleDateString("pt-BR")}` : ""}; vai em todo email.` : "Envie o PDF aqui embaixo, em “Currículo anexado”.",
    },
    {
      id: "ia", rotulo: "IA para escrever e resumir", essencial: false, ok: ia,
      detalhe: ia ? "Gemini pronto. Sem cota no dia, o site usa o modelo pronto." : "Falta a chave do Gemini. Sem ela, só o modelo pronto funciona.",
      ancora: "como-instalar-uns-15-minutos",
      link: "/instalar",
    },
    {
      id: "envio", rotulo: "Envio da fila na hora", essencial: false, ok: Boolean(seg.GITHUB_DISPATCH_TOKEN),
      detalhe: seg.GITHUB_DISPATCH_TOKEN
        ? "Ao colocar vagas na fila, o site chama o GitHub e o envio começa em 1 ou 2 minutos."
        : "Sem o token do GitHub, a fila sai na rodada de hora em hora (7h às 21h).",
      ancora: "a-extensão-do-chrome",
      link: "/instalar",
    },
    {
      id: "senha", rotulo: "Senha do site forte", essencial: false, ok: senha.length >= 12,
      detalhe: senha.length >= 12 ? "Senha com 12 caracteres ou mais." : "Use uma SITE_PASSWORD com 12 caracteres ou mais.",
      ancora: "opcionais",
    },
    {
      id: "extensao", rotulo: "Extensão do Chrome liberada", essencial: false, ok: (seg.CAPTURA_TOKEN ?? "").length >= 24,
      detalhe: (seg.CAPTURA_TOKEN ?? "").length >= 24 ? "Token da extensão criado: instale a extensão e cole o token nas opções dela." : "O assistente cria o token da extensão quando você liga o GitHub.",
      ancora: "a-extensão-do-chrome",
      link: "/instalar",
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
      ok: Boolean(process.env.CRON_SECRET && seg.GITHUB_DISPATCH_TOKEN),
      detalhe: process.env.CRON_SECRET && seg.GITHUB_DISPATCH_TOKEN
        ? "Se o GitHub pular um horário, a Vercel dispara a coleta e avisa você."
        : "Opcional: crie CRON_SECRET na Vercel (README, Opcionais) para a coleta rodar mesmo quando o GitHub pula o horário.",
      ancora: "opcionais",
    },
  ];
}
