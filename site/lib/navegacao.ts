import type { NomeIcone } from "@/components/Icone";

// Seções do site. No computador, todas ficam no menu lateral. No celular, as marcadas com "baixo" ficam na barra
// de baixo (cabem 6, contando o "Mais"); as outras ficam na tela Mais.
export type Secao = {
  href: string;
  rotulo: string;
  curto: string;
  icone: NomeIcone;
  conta?: "novas" | "candidaturas" | "fila";
  baixo: boolean;
  descricao: string;
};

export const SECOES: Secao[] = [
  { href: "/", rotulo: "Hoje", curto: "Hoje", icone: "inicio", baixo: true, descricao: "O que pede ação agora" },
  { href: "/vagas", rotulo: "Vagas", curto: "Vagas", icone: "vagas", conta: "novas", baixo: true, descricao: "Lista ordenada pela nota" },
  { href: "/triagem", rotulo: "Triagem rápida", curto: "Triagem", icone: "triagem", baixo: true, descricao: "Decidir as vagas novas uma por vez" },
  { href: "/lote", rotulo: "Envio em lote", curto: "Lote", icone: "lote", conta: "fila", baixo: true, descricao: "Várias candidaturas por email de uma vez" },
  { href: "/adicionar", rotulo: "Adicionar vaga", curto: "Adicionar", icone: "adicionar", baixo: false, descricao: "Colar o texto de um post ou anúncio" },
  { href: "/candidaturas", rotulo: "Candidaturas", curto: "Quadro", icone: "candidaturas", conta: "candidaturas", baixo: true, descricao: "Quadro com cada etapa" },
  { href: "/painel", rotulo: "Painel", curto: "Painel", icone: "painel", baixo: false, descricao: "Números das coletas e taxa de resposta" },
  { href: "/mapa", rotulo: "Mapa das vagas", curto: "Mapa", icone: "mapa", baixo: false, descricao: "Vagas agrupadas por tipo, perto ou longe do seu currículo" },
  { href: "/estudar", rotulo: "O que estudar", curto: "Estudar", icone: "estudar", baixo: false, descricao: "Habilidades que mais abririam vagas para você" },
  { href: "/uso", rotulo: "Uso dos serviços", curto: "Uso", icone: "medidor", baixo: false, descricao: "Quanto de cada plano grátis já foi usado" },
  { href: "/configuracoes", rotulo: "Configurações", curto: "Ajustes", icone: "config", baixo: false, descricao: "Currículo, primeiros passos e exportar dados" },
];

export const SECOES_MAIS = SECOES.filter((s) => !s.baixo);
