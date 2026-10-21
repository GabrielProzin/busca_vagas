import Moldura from "@/components/Moldura";
import { listarCandidaturas, listarChegadas, listarExecucoes, type Chegada } from "@/lib/db";
import { PERFIL } from "@/lib/gerado/perfil";
import { fonte } from "@/lib/formato";
import type { Aprendizado, Execucao } from "@/lib/tipos";

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
  const [execucoes, candidaturas, chegadas] = await Promise.all([listarExecucoes(30), listarCandidaturas(), listarChegadas(30)]);
  const novasPorColeta = novasDeCadaColeta(execucoes, chegadas);
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

      <CartaoAprendizado a={ultima?.aprendizado ?? null} />

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
          <div className="cartao-cabecalho"><h2>Vagas novas por coleta</h2></div>
          {execucoes.length === 0 ? (
            <div className="cartao-corpo dica">Nenhuma coleta registrada ainda.</div>
          ) : (
            <>
              <div className="rolagem">
                <table className="tabela coletas">
                  <thead>
                    <tr><th>Quando</th><th>Novas por fonte</th><th className="num">Principal</th><th className="num">Vale tentar</th><th className="num">{PERFIL.resumoNotaMinima}+</th></tr>
                  </thead>
                  <tbody>
                    {execucoes.slice(0, 12).map((e) => {
                      const n = novasPorColeta.get(e.id)!;
                      return (
                        <tr key={e.id} className={n.total ? "" : "sem-novas"}>
                          <td>{fmtData.format(new Date(e.iniciada_em))}</td>
                          <td>{n.total ? Object.entries(n.porFonte).sort((a, b) => b[1] - a[1]).map(([f, q]) => `${fonte(f)} ${q}`).join(", ") : "Nenhuma vaga nova"}</td>
                          <td className="num">{n.total ? n.principal : "–"}</td>
                          <td className="num">{n.total ? n.valeTentar : "–"}</td>
                          <td className="num">{n.total ? <b className={n.altas ? "destaque-num" : ""}>{n.altas}</b> : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="dica rodape-cartao">
                Só as vagas que apareceram pela primeira vez em cada coleta. O email de resumo sai quando a coluna {PERFIL.resumoNotaMinima}+ passa de zero
                (ou, na coleta da manhã, quando alguma candidatura pede follow-up).
              </p>
            </>
          )}
        </section>
      </div>
    </Moldura>
  );
}

// O ranking aprendendo com o que você aplica e descarta (calculado pelo coletor a cada coleta).
function CartaoAprendizado({ a }: { a: Aprendizado | null }) {
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="cartao aprendizado">
      <div className="cartao-cabecalho">
        <h2>O ranking aprendendo com você</h2>
        {a ? <span className={`etiqueta ${a.ativo ? "ok" : ""}`}>{a.ativo ? "Ligado" : "Juntando exemplos"}</span> : null}
      </div>
      <div className="cartao-corpo">
        {!a ? (
          <p className="dica">
            Começa na próxima coleta. Cada vaga em que você aplica ou que descarta vira um exemplo; vagas parecidas com as que você aplicou ganham
            até 8 pontos, e parecidas com as que descartou perdem até 8.
          </p>
        ) : (
          <>
            <div className="aprendizado-numeros">
              <div><strong>{a.positivos}</strong><span>aplicadas</span><Trilho valor={Math.min(1, a.positivos / a.minimo)} /></div>
              <div><strong>{a.negativos}</strong><span>descartadas</span><Trilho valor={Math.min(1, a.negativos / a.minimo)} /></div>
              <div><strong>{a.ativo ? pct(a.confianca) : "—"}</strong><span>força do ajuste</span><Trilho valor={a.ativo ? a.confianca : 0} /></div>
              <div><strong>{a.acerto !== null ? pct(a.acerto) : "—"}</strong><span>acerto no teste</span><Trilho valor={a.acerto ?? 0} /></div>
            </div>
            <p className="dica" style={{ marginTop: 14 }}>
              {a.ativo
                ? `Vagas parecidas com as que você aplicou ganham até ${a.max_pontos} pontos; parecidas com as que descartou perdem até ${a.max_pontos}. A força cresce até 100% com 30 exemplos. “Acerto no teste” é quantas das suas próprias decisões ele adivinha sem ver a resposta.`
                : `Liga quando houver pelo menos ${a.minimo} vagas aplicadas e ${a.minimo} descartadas. Descartar o que não serve na lista de vagas também ensina.`}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function Trilho({ valor }: { valor: number }) {
  return <span className="trilho"><i style={{ width: `${Math.max(2, Math.round(valor * 100))}%` }} /></span>;
}

type Novas = { total: number; principal: number; valeTentar: number; altas: number; porFonte: Record<string, number> };

/** Vagas que entraram no banco entre a coleta anterior e esta (a coleta grava as vagas antes de se registrar). */
function novasDeCadaColeta(execucoes: Execucao[], chegadas: Chegada[]): Map<number, Novas> {
  const ordem = [...execucoes].sort((a, b) => Date.parse(a.iniciada_em) - Date.parse(b.iniciada_em));
  const mapa = new Map<number, Novas>();
  ordem.forEach((e, i) => {
    const ate = Date.parse(e.iniciada_em);
    const desde = i > 0 ? Date.parse(ordem[i - 1].iniciada_em) : -Infinity;
    const n: Novas = { total: 0, principal: 0, valeTentar: 0, altas: 0, porFonte: {} };
    for (const v of chegadas) {
      const t = Date.parse(v.primeira_vez_em);
      if (t <= desde || t > ate) continue;
      n.total++;
      if (v.lista === "principal") n.principal++;
      if (v.lista === "vale_tentar") n.valeTentar++;
      if ((v.nota ?? 0) >= PERFIL.resumoNotaMinima) n.altas++;
      n.porFonte[v.fonte] = (n.porFonte[v.fonte] ?? 0) + 1;
    }
    mapa.set(e.id, n);
  });
  return mapa;
}
