import Link from "next/link";
import Topo from "@/components/Topo";
import { alterarStatus } from "../acoes";
import { listarCandidaturas } from "@/lib/db";
import { idUrl, quando } from "@/lib/formato";
import { ETAPAS } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaCandidaturas() {
  const vagas = await listarCandidaturas();
  return (
    <>
      <Topo atual="/candidaturas" />
      <main className="conteudo">
        <div className="cabecalho">
          <div>
            <h1>Candidaturas</h1>
            <p className="sub">{vagas.length} em andamento. Mude a etapa quando a empresa responder.</p>
          </div>
        </div>
        {vagas.length === 0 ? (
          <div className="vazio">
            <p><b>Nenhuma candidatura ainda.</b></p>
            <p>Em Vagas, use “Já apliquei” depois de se candidatar pelo link.</p>
          </div>
        ) : (
          <div className="quadro">
            {ETAPAS.map((etapa) => {
              const daEtapa = vagas.filter((v) => v.candidatura?.status === etapa.status);
              return (
                <section key={etapa.status} className={`coluna${daEtapa.length ? "" : " vazia"}`} aria-label={etapa.rotulo}>
                  <h3>{etapa.rotulo} <span>{daEtapa.length}</span></h3>
                  {daEtapa.map((v) => (
                    <div key={v.id} className="cartao">
                      <Link href={idUrl(v.id)}>{v.titulo}</Link>
                      <small>{v.empresa || "Empresa não informada"}, {quando(v.candidatura?.enviada_em ?? v.candidatura?.atualizada_em ?? null)}</small>
                      <form action={alterarStatus}>
                        <input type="hidden" name="id" value={v.id} />
                        <select name="status" defaultValue={etapa.status} aria-label={`Etapa de ${v.titulo}`}>
                          {ETAPAS.map((e) => <option key={e.status} value={e.status}>{e.rotulo}</option>)}
                        </select>
                        <button className="botao" type="submit">Mover</button>
                      </form>
                    </div>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
