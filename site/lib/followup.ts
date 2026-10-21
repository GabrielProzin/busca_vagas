import type { Candidatura, Vaga } from "./tipos";
import { habilidade } from "./formato";

// Quando uma candidatura pede follow-up. A mesma regra está em coletor/followup.py (email de resumo).
// - Só para "Aplicada" e "Email enviado" (ninguém respondeu ainda).
// - 7 dias depois do envio (ou do último follow-up) sem resposta: pede follow-up.
// - Depois de 2 follow-ups sem resposta, 7 dias depois sugere mover para "Não seguiu".

export const FOLLOWUP_DIAS = 7;
export const FOLLOWUP_MAXIMO = 2;

export type Followup = {
  estado: "aguardando" | "followup" | "encerrar";
  dias: number; // dias desde o envio ou o último follow-up
  feitos: number;
  proxima: string; // ISO: quando o próximo follow-up passa a ser sugerido
  ultimoFollowup: string | null;
};

export function situacaoFollowup(c: Candidatura | null | undefined, agora = Date.now()): Followup | null {
  if (!c || (c.status !== "aplicada" && c.status !== "enviada")) return null;
  const desde = Date.parse(c.followup_em ?? c.enviada_em ?? c.atualizada_em);
  if (Number.isNaN(desde)) return null;
  const dias = Math.floor((agora - desde) / 864e5);
  const feitos = c.followups ?? 0;
  return {
    estado: dias < FOLLOWUP_DIAS ? "aguardando" : feitos >= FOLLOWUP_MAXIMO ? "encerrar" : "followup",
    dias,
    feitos,
    proxima: new Date(desde + FOLLOWUP_DIAS * 864e5).toISOString(),
    ultimoFollowup: c.followup_em ?? null,
  };
}

/** Mensagem curta para o recrutador no LinkedIn (cabe no limite de 300 caracteres do convite). */
export function mensagemLinkedin(v: Pick<Vaga, "titulo" | "empresa" | "habilidades_ok">): string {
  const titulo = v.titulo.length > 60 ? v.titulo.slice(0, 57) + "…" : v.titulo;
  const hab = v.habilidades_ok.slice(0, 3).map(habilidade);
  const lista = hab.length > 1 ? `${hab.slice(0, -1).join(", ")} e ${hab.at(-1)}` : hab[0];
  const texto =
    `Olá! Me candidatei à vaga de ${titulo}${v.empresa ? ` na ${v.empresa}` : ""} e queria reforçar meu interesse.` +
    (lista ? ` Trabalho com ${lista} e` : " Eu") +
    ` adoraria contribuir com o time. Fico à disposição para conversar. Obrigado!`;
  return texto.length <= 300 ? texto : texto.replace(/ Fico à disposição para conversar\./, "");
}
