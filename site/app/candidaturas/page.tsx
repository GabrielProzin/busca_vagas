import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import QuadroCandidaturas, { type CartaoKanban } from "@/components/QuadroCandidaturas";
import { listarCandidaturas } from "@/lib/db";
import { idUrl, quando } from "@/lib/formato";
import { ETAPAS } from "@/lib/tipos";
import { situacaoFollowup } from "@/lib/followup";

export const dynamic = "force-dynamic";

// Cor do ponto de cada etapa: azul-petróleo enquanto espera, verde quando a empresa responde, cinza no fim.
const COR: Record<string, string> = {
  aplicada: "var(--seg-2)", enviada: "var(--accent)", respondeu: "var(--ok)", entrevista: "var(--ok)", proposta: "var(--ok)", recusada: "var(--muted)",
};

export default async function PaginaCandidaturas() {
  const vagas = await listarCandidaturas();
  const andamento = vagas.filter((v) => v.candidatura?.status !== "recusada").length;
  const cartoes: CartaoKanban[] = vagas.map((v) => {
    const fu = situacaoFollowup(v.candidatura);
    return {
    id: v.id,
    titulo: v.titulo,
    empresa: v.empresa || "Empresa não informada",
    quando: quando(v.candidatura?.enviada_em ?? v.candidatura?.atualizada_em ?? null),
    status: v.candidatura!.status,
    nota: v.nota,
    porEmail: Boolean(v.candidatura?.email_para && v.candidatura.status !== "aplicada"),
    href: idUrl(v.id),
    followup: fu && fu.estado !== "aguardando" ? fu.estado : null,
    diasSemResposta: fu?.dias ?? null,
    };
  });
  // Quem pede follow-up sobe para o topo da coluna.
  const ordem = { followup: 0, encerrar: 1 } as const;
  cartoes.sort((a, b) => (a.followup ? ordem[a.followup] : 2) - (b.followup ? ordem[b.followup] : 2));
  const pedem = cartoes.filter((c) => c.followup === "followup").length;

  return (
    <Moldura
      atual="/candidaturas"
      larga
      titulo="Candidaturas"
      subtitulo={
        vagas.length
          ? `${andamento} em andamento de ${vagas.length}${pedem ? `, ${pedem} ${pedem === 1 ? "pede" : "pedem"} follow-up` : ""}. Arraste os cartões entre as colunas quando a empresa responder.`
          : undefined
      }
    >
      {vagas.length === 0 ? (
        <div className="cartao vazio">
          <Icone nome="candidaturas" tamanho={36} />
          <b>Nenhuma candidatura ainda</b>
          <p>Em Vagas, marque “Já apliquei” depois de se candidatar pelo link, ou envie um email pela página da vaga.</p>
        </div>
      ) : (
        <QuadroCandidaturas iniciais={cartoes} etapas={ETAPAS.map((e) => ({ ...e, rotulo: e.status === "aplicada" ? "Aplicada" : e.rotulo, cor: COR[e.status] ?? "var(--accent)" }))} />
      )}
    </Moldura>
  );
}
