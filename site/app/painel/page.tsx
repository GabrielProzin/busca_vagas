import Topo from "@/components/Topo";
import { listarCandidaturas, listarExecucoes } from "@/lib/db";

export const dynamic = "force-dynamic";

const MOTIVO: Record<string, string> = {
  senioridade: "Pleno, sênior, estágio ou liderança no título",
  bloqueio: "Palavra bloqueada no título (.NET, Java, desenvolvedor…)",
  "título fora das trilhas de dados": "Cargo fora da área de dados",
  hibrido: "Híbrido fora de Goiânia",
  presencial: "Presencial fora de Goiânia",
  "vaga em inglês": "Descrição em inglês",
  vaga: "Descrição em inglês",
  "nota abaixo do mínimo": "Pouco a ver com o seu currículo",
};

const fmtData =new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

function horasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 36e5;
}

export default async function PaginaPainel() {
  const [execucoes, candidaturas] = await Promise.all([listarExecucoes(30), listarCandidaturas()]);
  const ultima = execucoes[0];
  const total = (o: Record<string, number> | null) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
  const avancaram = candidaturas.filter((v) => ["respondeu", "entrevista", "proposta"].includes(v.candidatura?.status ?? "")).length;

  return (
    <>
      <Topo atual="/painel" />
      <main className="conteudo">
        <div className="cabecalho">
          <div>
            <h1>Painel</h1>
            <p className="sub">Como a coleta e as suas candidaturas estão indo.</p>
          </div>
        </div>

        {ultima ? (
          <p className={horasDesde(ultima.iniciada_em) > 20 ? "aviso" : "aviso ok"} style={{ marginBottom: 14 }}>
            Última coleta: {fmtData.format(new Date(ultima.iniciada_em))} (há {Math.floor(horasDesde(ultima.iniciada_em))}h).
            {horasDesde(ultima.iniciada_em) > 20 ? " Está atrasada: confira em GitHub → Actions." : " A próxima roda por volta das 11:00 ou 18:30."}
          </p>
        ) : null}
        <div className="numeros">
          <div className="numero"><strong>{ultima ? total(ultima.coletadas) : 0}</strong><span>vagas lidas na última coleta</span></div>
          <div className="numero"><strong>{ultima?.principal ?? 0}</strong><span>entraram na lista principal</span></div>
          <div className="numero"><strong>{candidaturas.length}</strong><span>candidaturas feitas</span></div>
          <div className="numero"><strong>{avancaram}</strong><span>responderam ou chamaram para entrevista</span></div>
        </div>

        {ultima?.descartes ? (
          <>
            <h2>Por que as vagas ficaram de fora na última coleta</h2>
            <div className="rolagem"><table className="tabela">
              <thead><tr><th>Motivo</th><th className="num">Vagas</th></tr></thead>
              <tbody>
                {Object.entries(ultima.descartes).sort((a, b) => b[1] - a[1]).map(([motivo, n]) => (
                  <tr key={motivo}><td>{MOTIVO[motivo] ?? motivo.charAt(0).toUpperCase() + motivo.slice(1)}</td><td className="num">{n}</td></tr>
                ))}
              </tbody>
            </table></div>
          </>
        ) : null}

        <h2>Coletas recentes</h2>
        {execucoes.length === 0 ? (
          <div className="vazio"><p>Nenhuma coleta registrada ainda.</p></div>
        ) : (
          <div className="rolagem"><table className="tabela">
            <thead>
              <tr><th>Quando</th><th>Lidas por fonte</th><th className="num">Principal</th><th className="num">Vale tentar</th></tr>
            </thead>
            <tbody>
              {execucoes.map((e) => (
                <tr key={e.id}>
                  <td>{fmtData.format(new Date(e.iniciada_em))}</td>
                  <td>{Object.entries(e.coletadas ?? {}).map(([f, n]) => `${f} ${n}`).join(", ")}</td>
                  <td className="num">{e.principal ?? 0}</td>
                  <td className="num">{e.vale_tentar ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </main>
    </>
  );
}
