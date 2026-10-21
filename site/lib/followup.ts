import type { Candidatura, Vaga } from "./tipos";
import { deEmpresa, habilidade, tituloLimpo } from "./formato";

// Quando uma candidatura pede follow-up. A mesma regra está em coletor/followup.py (email de resumo).
// - Só para "Aplicada" e "Email enviado" (ninguém respondeu ainda).
// - 15 dias depois do envio (ou do último follow-up) sem resposta: pede follow-up.
// - Depois de 2 follow-ups sem resposta, 15 dias depois sugere mover para "Não seguiu".

export const FOLLOWUP_DIAS = 15;
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
  const limpo = tituloLimpo(v.titulo);
  const titulo = limpo.length > 60 ? limpo.slice(0, 57) + "…" : limpo;
  const hab = v.habilidades_ok.slice(0, 3).map(habilidade);
  const lista = hab.length > 1 ? `${hab.slice(0, -1).join(", ")} e ${hab.at(-1)}` : hab[0];
  const empresa = v.empresa ? ` ${deEmpresa(v.empresa)}` : "";
  const texto =
    `Olá, tudo bem? Me candidatei à vaga de ${titulo}${empresa} e quis passar aqui para me apresentar.` +
    (lista ? ` Trabalho com ${lista} e acho que meu perfil conversa com o que vocês procuram.` : "") +
    ` Se fizer sentido, gostaria de conversar.`;
  return texto.length <= 300 ? texto : texto.replace(/ Se fizer sentido, gostaria de conversar\./, "");
}
