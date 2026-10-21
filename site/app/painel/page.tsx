import Moldura from "@/components/Moldura";
import { listarCandidaturas, listarExecucoes } from "@/lib/db";
import { fonte } from "@/lib/formato";

export const dynamic = "force-dynamic";

const MOTIVO: Record<string, string> = {
  senioridade: "Pleno, sênior, estágio ou liderança",
  bloqueio: "Palavra bloqueada no título",
  "título fora das trilhas de dados": "Cargo fora da área de dados",
  "publicada há mais de 14 dias": "Publicada há mais de 14 dias",
  hibrido: "Híbrido fora de Goiânia",
  presencial: "Presencial fora de Goiânia",
  "vaga em inglês": "Descrição em inglês",
  vaga: "Descrição em inglês",
  "descrição indica pleno/sênior": "Descrição pede pleno/sênior",
  "nota abaixo do mínimo": "Pouco a ver com o seu currículo",
  "local não informado": "Local não informado",
};

const fmtData = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function PaginaPainel() {
  const [execucoes, candidaturas] = await Promise.all([listarExecucoes(30), listarCandidaturas()]);
  const ultima = execucoes[0];
  const total = (o: Record<string, number> | null) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
  const avancaram = candidaturas.filter((v) => ["respondeu", "entrevista", "proposta"].includes(v.candidatura?.status ?? "")).length;
  const porEmail = candidaturas.filter((v) => v.candidatura?.email_para && v.candidatura.status !== "aplicada").length;
  const descartes = Object.entries(ultima?.descartes ?? {})
    .map(([m, n]) => [MOTIVO[m] ?? m.charAt(0).toUpperCase() + m.slice(1), n] as const)
    .sort((a, b) => b[1] - a[1]);
  const maior = descartes[0]?.[1] ?? 1;

  return (
    <Moldura
      atual="/painel"
      titulo="Painel"
      subtitulo={ultima ? `Última coleta em ${fmtData.format(new Date(ultima.iniciada_em))}. As próximas rodam por volta das 11:00 e das 18:30.` : "Nenhuma coleta registrada ainda."}
    >
      <div className="kpis">
        <div className="cartao kpi"><span>Vagas lidas na última coleta</span><strong>{ultima ? total(ultima.coletadas) : 0}</strong></div>
        <div className="cartao kpi"><span>Na lista principal</span><strong>{ultima?.principal ?? 0}</strong></div>
        <div className="cartao kpi"><span>Candidaturas feitas</span><strong>{candidaturas.length}</strong><span>{porEmail} por email</span></div>
        <div className="cartao kpi"><span>Responderam ou chamaram</span><strong>{avancaram}</strong></div>
      </div>

      <div className="grade-2">
        <section className="cartao">
          <div className="cartao-cabecalho"><h2>Por que as vagas ficaram de fora</h2><span className="dica">última coleta</span></div>
          <div className="cartao-corpo">
            {descartes.length ? (
              <div className="barras-h">
                {descartes.map(([motivo, n]) => (
                  <div key={motivo} className="linha">
                    <span>{motivo}</span>
                    <span className="n">{n}</span>
                    <span className="trilho"><i style={{ width: `${Math.max(2, (n / maior) * 100)}%` }} /></span>
                  </div>
                ))}
              </div>
            ) : <p className="dica">Sem dados ainda.</p>}
          </div>
        </section>

        <section className="cartao">
          <div className="cartao-cabecalho"><h2>Coletas recentes</h2></div>
          {execucoes.length === 0 ? (
            <div className="cartao-corpo dica">Nenhuma coleta registrada ainda.</div>
          ) : (
            <div className="rolagem">
              <table className="tabela">
                <thead>
                  <tr><th>Quando</th><th>Lidas por fonte</th><th className="num">Principal</th><th className="num">Vale tentar</th></tr>
                </thead>
                <tbody>
                  {execucoes.slice(0, 12).map((e) => (
                    <tr key={e.id}>
                      <td>{fmtData.format(new Date(e.iniciada_em))}</td>
                      <td>{Object.entries(e.coletadas ?? {}).map(([f, n]) => `${fonte(f)} ${n}`).join(", ")}</td>
                      <td className="num">{e.principal ?? 0}</td>
                      <td className="num">{e.vale_tentar ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Moldura>
  );
}
