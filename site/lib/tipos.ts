export type Status =
  | "nova"
  | "descartada"
  | "aplicada"
  | "enviada"
  | "respondeu"
  | "entrevista"
  | "recusada"
  | "proposta";

export const ETAPAS: { status: Status; rotulo: string }[] = [
  { status: "aplicada", rotulo: "Aplicada pelo link" },
  { status: "enviada", rotulo: "Email enviado" },
  { status: "respondeu", rotulo: "Respondeu" },
  { status: "entrevista", rotulo: "Entrevista" },
  { status: "proposta", rotulo: "Proposta" },
  { status: "recusada", rotulo: "Não seguiu" },
];

export const ROTULO_STATUS: Record<Status, string> = {
  nova: "Nova",
  descartada: "Descartada",
  aplicada: "Aplicada pelo link",
  enviada: "Email enviado",
  respondeu: "Respondeu",
  entrevista: "Entrevista",
  recusada: "Não seguiu",
  proposta: "Proposta",
};

export type Candidatura = {
  vaga_id: string;
  status: Status;
  email_assunto: string | null;
  email_corpo: string | null;
  email_para: string | null;
  enviada_em: string | null;
  notas: string | null;
  atualizada_em: string;
};

export type Vaga = {
  id: string;
  fonte: string;
  titulo: string;
  empresa: string | null;
  url: string | null;
  descricao: string | null;
  cidade: string | null;
  estado: string | null;
  modalidade: string | null;
  publicada_em: string | null;
  email_contato: string | null;
  emails: string[];
  // De onde veio o email: "vaga" (estava no texto) | "site_rh" | "site_contato" (site oficial da empresa)
  email_origem?: string | null;
  trilha: string | null;
  nivel: string | null;
  nota: number | null;
  lista: "principal" | "vale_tentar" | null;
  motivos: string[];
  habilidades_ok: string[];
  habilidades_faltando: string[];
  // Vagas da coleta têm os três componentes; vagas capturadas (LinkedIn/colar) têm só a nota da IA.
  componentes: { semantica?: number; habilidades?: number; trilha?: number; ia?: number };
  primeira_vez_em: string;
  atualizada_em: string;
  // Resumo direto gerado pela IA na primeira vez que a vaga é aberta (coluna opcional no banco).
  resumo?: import("./ia").ResumoVaga | null;
  candidatura: Candidatura | null;
};

export type Execucao = {
  id: number;
  iniciada_em: string;
  duracao_s: number | null;
  coletadas: Record<string, number> | null;
  descartes: Record<string, number> | null;
  principal: number | null;
  vale_tentar: number | null;
};
