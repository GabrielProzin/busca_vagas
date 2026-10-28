import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import AnelNota from "@/components/AnelNota";
import GraficoEvolucao from "@/components/GraficoEvolucao";
import FormAnaliseCV from "@/components/FormAnaliseCV";
import { listarAnalisesCV, listarVagas } from "@/lib/db";
import { iaConfigurada } from "@/lib/ia";
import { maisFraco, variacao } from "@/lib/perfil";
import { tituloLimpo } from "@/lib/formato";

export const dynamic = "force-dynamic";

// Análise de CV: nota atual, evolução, nova análise e histórico (docs/spec.md, "Análise de CV").

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const dia = (iso: string) => fmt.format(new Date(iso)).replace(".", "");
const FILTROS = [
  { id: "todas", rotulo: "Todas" },
  { id: "geral", rotulo: "Geral" },
  { id: "vaga", rotulo: "Para vaga" },
] as const;

export default async function PaginaAnaliseCV({ searchParams }: { searchParams: Promise<{ filtro?: string; vaga?: string }> }) {
  const sp = await searchParams;
  const filtro = FILTROS.some((f) => f.id === sp.filtro) ? (sp.filtro as (typeof FILTROS)[number]["id"]) : "todas";
  const [analises, vagas] = await Promise.all([listarAnalisesCV(), listarVagas()]);
  const gerais = analises.filter((a) => a.tipo === "geral");
  const atual = gerais[0] ?? null;
  const varia = atual ? variacao(analises, atual) : null;
  const fraco = atual ? maisFraco(atual.dados.criterios) : null;
  const lista = analises.filter((a) => filtro === "todas" || a.tipo === filtro);
  const opcoes = vagas
    .filter((v) => v.lista && v.nota !== null)
    .sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0))
    .slice(0, 40)
    .map((v) => ({ valor: v.id, rotulo: `${Math.round(v.nota ?? 0)} · ${tituloLimpo(v.titulo)}${v.empresa ? ` – ${v.empresa}` : ""}` }));
  const vagaInicial = sp.vaga && vagas.some((v) => v.id === sp.vaga) ? sp.vaga : undefined;
  const contagem = (id: string) => analises.filter((a) => id === "todas" || a.tipo === id).length;

  return (
    <Moldura atual="/perfil/cv" titulo="Análise de CV" subtitulo="A nota do seu currículo, com histórico. Para uma vaga, também a conexão e as respostas do formulário.">
      <section className="cartao cv-resumo" aria-label="Nota atual">
        <div className="cv-resumo-nota">
          <AnelNota nota={atual?.nota ?? null} />
          <div>
            <span className="dica">Nota atual</span>
            {atual ? (
              <>
                <p className={varia === null ? "cv-variacao" : varia >= 0 ? "cv-variacao sobe" : "cv-variacao desce"}>
                  {varia === null ? "Primeira análise geral" : `${varia >= 0 ? "+" : ""}${varia} desde a anterior`}
                </p>
                {fraco ? <p className="dica">Mais fraco: <b>{fraco.rotulo}</b> · {fraco.nota}</p> : null}
                <Link href={`/perfil/cv/${atual.id}`} className="dica">Abrir a análise de {dia(atual.criada_em)}</Link>
              </>
            ) : <p className="dica">Faça a primeira análise geral logo abaixo.</p>}
          </div>
        </div>
        <div className="cv-resumo-grafico">
          <span className="dica">Evolução da nota (análises gerais)</span>
          {gerais.length > 1 ? (
            <GraficoEvolucao altura={150} series={[{ nome: "Currículo", classe: "s-cv", pontos: gerais.map((a) => ({ quando: a.criada_em, nota: a.nota, titulo: a.titulo })) }]} />
          ) : <p className="dica cv-sem-grafico">O gráfico aparece a partir da segunda análise geral.</p>}
        </div>
      </section>

      <section className="cartao" aria-labelledby="nova-analise">
        <div className="cartao-cabecalho"><h2 id="nova-analise"><Icone nome="ia" /> Nova análise</h2></div>
        <div className="cartao-corpo">
          <FormAnaliseCV vagas={opcoes} vagaInicial={vagaInicial} iaLigada={iaConfigurada()} />
        </div>
      </section>

      <section className="cartao cv-historico" aria-labelledby="suas-analises">
        <div className="cartao-cabecalho">
          <h2 id="suas-analises"><Icone nome="arquivo" /> Suas análises</h2>
          <nav className="segmentado" aria-label="Filtrar análises">
            {FILTROS.map((f) => (
              <Link key={f.id} href={f.id === "todas" ? "/perfil/cv" : `/perfil/cv?filtro=${f.id}`} aria-current={filtro === f.id ? "true" : undefined}>
                {f.rotulo} <b>{contagem(f.id)}</b>
              </Link>
            ))}
          </nav>
        </div>
        {lista.length ? (
          <ul className="cv-lista">
            <li className="cv-linha cv-linha-cabecalho" aria-hidden>
              <span>Nota</span><span>Análise</span><span>Conexão com a vaga</span><span>Respostas</span><span>Variação</span><span>Data</span>
            </li>
            {lista.map((a) => {
              const v = variacao(analises, a);
              const respostas = a.dados.respostas?.length ?? 0;
              return (
                <li key={a.id}>
                  <Link href={`/perfil/cv/${a.id}`} className="cv-linha">
                    <AnelNota nota={a.nota} tamanho={40} legenda={false} />
                    <span className="cv-titulo"><b>{a.titulo}</b><small>{a.tipo === "geral" ? "Geral" : "Para vaga"}{a.versao && a.tipo === "vaga" ? ` · ${a.versao}` : ""}</small></span>
                    <span className="cv-col" data-rotulo="Conexão">{a.conexao ?? "—"}</span>
                    <span className="cv-col" data-rotulo="Respostas">{respostas || "—"}</span>
                    <span className={`cv-col ${v === null ? "" : v >= 0 ? "variacao sobe" : "variacao desce"}`} data-rotulo="Variação">{v === null ? "—" : `${v >= 0 ? "+" : ""}${v}`}</span>
                    <span className="cv-col dica">{dia(a.criada_em)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="vazio"><Icone nome="arquivo" tamanho={28} /><b>Nenhuma análise {filtro === "vaga" ? "para vaga" : filtro === "geral" ? "geral" : ""} ainda.</b><p>Use “Nova análise” acima.</p></div>
        )}
      </section>
    </Moldura>
  );
}
