import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { alterarStatus } from "../acoes";
import { listarCandidaturas } from "@/lib/db";
import { idUrl, quando } from "@/lib/formato";
import { ETAPAS } from "@/lib/tipos";

export const dynamic = "force-dynamic";

const COR: Record<string, string> = { respondeu: "verde", entrevista: "verde", proposta: "verde", recusada: "cinza" };

export default async function PaginaCandidaturas() {
  const vagas = await listarCandidaturas();
  const andamento = vagas.filter((v) => !["recusada"].includes(v.candidatura?.status ?? "")).length;
  return (
    <Moldura
      atual="/candidaturas"
      titulo="Candidaturas"
      subtitulo={vagas.length ? `${andamento} em andamento de ${vagas.length} no total. Mude a etapa quando a empresa responder.` : undefined}
    >
      {vagas.length === 0 ? (
        <div className="cartao vazio">
          <Icone nome="candidaturas" tamanho={36} />
          <b>Nenhuma candidatura ainda</b>
          <p>Em Vagas, marque “Já apliquei” depois de se candidatar pelo link, ou envie um email pela página da vaga.</p>
        </div>
      ) : (
        <div className="quadro">
          {ETAPAS.map((etapa) => {
            const daEtapa = vagas.filter((v) => v.candidatura?.status === etapa.status);
            return (
              <section key={etapa.status} className={`coluna${daEtapa.length ? "" : " vazia"}`} aria-label={etapa.rotulo}>
                <h3>
                  <span className={`ponto-etapa ${COR[etapa.status] ?? ""}`} aria-hidden />
                  {etapa.rotulo}
                  <span className="contador">{daEtapa.length}</span>
                </h3>
                {daEtapa.length === 0 ? <p className="coluna-vazia">Nada aqui ainda.</p> : null}
                {daEtapa.map((v) => (
                  <article key={v.id} className="cartao-vaga">
                    <Link href={idUrl(v.id)}>{v.titulo}</Link>
                    <small>{v.empresa || "Empresa não informada"} · {quando(v.candidatura?.enviada_em ?? v.candidatura?.atualizada_em ?? null)}</small>
                    <form action={alterarStatus}>
                      <input type="hidden" name="id" value={v.id} />
                      <select name="status" defaultValue={etapa.status} aria-label={`Etapa de ${v.titulo}`}>
                        {ETAPAS.map((e) => <option key={e.status} value={e.status}>{e.rotulo}</option>)}
                      </select>
                      <button className="botao pequeno" type="submit">Mover</button>
                    </form>
                  </article>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </Moldura>
  );
}
