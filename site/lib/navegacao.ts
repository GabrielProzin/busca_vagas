import type { NomeIcone } from "@/components/Icone";

// Seções do site, agrupadas em módulos (docs/spec.md, "Telas"). No computador, o menu lateral mostra os módulos,
// que abrem e fecham. No celular, as marcadas com "baixo" ficam na barra de baixo (cabem 6, contando o "Mais");
// as outras ficam na tela Mais, também por módulo.
export type Modulo = "inicio" | "vagas" | "perfil" | "mercado" | "sistema";

export type Secao = {
  href: string;
  rotulo: string;
  curto: string;
  icone: NomeIcone;
  modulo: Modulo;
  conta?: "novas" | "candidaturas" | "fila";
  baixo: boolean;
  descricao: string;
};

export const MODULOS: { id: Modulo; rotulo: string; icone: NomeIcone }[] = [
  { id: "inicio", rotulo: "Início", icone: "inicio" },
  { id: "vagas", rotulo: "Vagas", icone: "vagas" },
  { id: "perfil", rotulo: "Meu perfil", icone: "perfil" },
  { id: "mercado", rotulo: "Mercado", icone: "ranking" },
  { id: "sistema", rotulo: "Sistema", icone: "config" },
];

export const SECOES: Secao[] = [
  { href: "/", rotulo: "Hoje", curto: "Hoje", icone: "inicio", modulo: "inicio", baixo: true, descricao: "O que pede ação agora" },
  { href: "/vagas", rotulo: "Vagas", curto: "Vagas", icone: "vagas", modulo: "vagas", conta: "novas", baixo: true, descricao: "Lista ordenada pela nota" },
  { href: "/triagem", rotulo: "Triagem rápida", curto: "Triagem", icone: "triagem", modulo: "vagas", baixo: true, descricao: "Decidir as vagas novas uma por vez" },
  { href: "/lote", rotulo: "Envio em lote", curto: "Lote", icone: "lote", modulo: "vagas", conta: "fila", baixo: false, descricao: "Várias candidaturas por email de uma vez" },
  { href: "/candidaturas", rotulo: "Candidaturas", curto: "Quadro", icone: "candidaturas", modulo: "vagas", conta: "candidaturas", baixo: true, descricao: "Quadro com cada etapa" },
  { href: "/adicionar", rotulo: "Adicionar vaga", curto: "Adicionar", icone: "adicionar", modulo: "vagas", baixo: false, descricao: "Colar o texto de um post ou anúncio" },
  { href: "/perfil", rotulo: "Perfil profissional", curto: "Perfil", icone: "perfil", modulo: "perfil", baixo: true, descricao: "Seu nível, o próximo passo e a evolução das notas" },
  { href: "/perfil/cv", rotulo: "Análise de CV", curto: "CV", icone: "arquivo", modulo: "perfil", baixo: false, descricao: "Nota do currículo, histórico e respostas de formulário" },
  { href: "/estudar", rotulo: "O que estudar", curto: "Estudar", icone: "estudar", modulo: "perfil", baixo: false, descricao: "Habilidades que mais abririam vagas para você" },
  { href: "/tipos", rotulo: "Tipos de vaga", curto: "Tipos", icone: "ranking", modulo: "mercado", baixo: false, descricao: "Que tipos de vaga existem e quanto cada um combina com você" },
  { href: "/painel", rotulo: "Painel", curto: "Painel", icone: "painel", modulo: "mercado", baixo: false, descricao: "Números das coletas e taxa de resposta" },
  { href: "/preferencias", rotulo: "Preferências da busca", curto: "Preferências", icone: "filtro", modulo: "sistema", baixo: false, descricao: "Remoto, híbrido ou presencial, cidades, nível e o que buscar" },
  { href: "/uso", rotulo: "Uso dos serviços", curto: "Uso", icone: "medidor", modulo: "sistema", baixo: false, descricao: "Quanto de cada plano grátis já foi usado" },
  { href: "/configuracoes", rotulo: "Configurações", curto: "Ajustes", icone: "config", modulo: "sistema", baixo: false, descricao: "Currículo, primeiros passos e exportar dados" },
];

export const SECOES_MAIS = SECOES.filter((s) => !s.baixo);

/** Seção do menu para uma página (páginas internas, como /perfil/cv/12, acendem a seção-mãe). */
export function secaoAtual(atual: string): Secao | undefined {
  return SECOES.find((s) => s.href === atual) ?? [...SECOES].sort((a, b) => b.href.length - a.href.length).find((s) => s.href !== "/" && atual.startsWith(s.href + "/"));
}
