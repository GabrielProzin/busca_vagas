import Link from "next/link";
import { notFound } from "next/navigation";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import AnelNota, { faixaNota } from "@/components/AnelNota";
import BotaoCopiar from "@/components/BotaoCopiar";
import { apagarAnaliseCV } from "@/app/acoes";
import { buscarAnaliseCV, listarAnalisesCV } from "@/lib/db";
import { ROTULO_NIVEL } from "@/lib/cv";
import { NIVEIS, variacao } from "@/lib/perfil";

export const dynamic = "force-dynamic";

// Uma análise do CV: nota e critérios, comentários e, para vaga, conexão e respostas do formulário.

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function PaginaAnalise({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [a, todas] = await Promise.all([buscarAnaliseCV(id).catch(() => null), listarAnalisesCV()]);
  if (!a) notFound();
  const d = a.dados;
  const v = variacao(todas, a);
  const proximo = d.nivel ? NIVEIS[Math.min(NIVEIS.indexOf(d.nivel) + 1, NIVEIS.length - 1)] : null;

  return (
    <Moldura
      atual={`/perfil/cv/${a.id}`}
      voltar={{ href: "/perfil/cv", rotulo: "Análise de CV" }}
      titulo={a.tipo === "vaga" ? `CV para: ${a.titulo}` : a.titulo}
      subtitulo={
        <>
          <span className="item">{fmt.format(new Date(a.criada_em))}</span>
          <span className="item">{a.tipo === "geral" ? "Análise geral" : "Análise para vaga"}</span>
          {a.versao ? <span className="item">Versão: {a.versao}</span> : <span className="item">Currículo do perfil</span>}
        </>
      }
    >
      {d.sem_ia ? (
        <div className="faixa aviso" role="status"><Icone nome="alerta" /> A IA ficou de fora desta análise ({d.sem_ia}). A nota usa só os critérios calculados.</div>
      ) : null}

      <div className="analise-topo">
        <section className="cartao analise-nota" aria-label="Nota do currículo">
          <AnelNota nota={a.nota} tamanho={120} />
          <div>
            <span className="dica">Nota do currículo</span>
            <p className={v === null ? "cv-variacao" : v >= 0 ? "cv-variacao sobe" : "cv-variacao desce"}>
              {v === null ? "Sem análise anterior para comparar" : `${v >= 0 ? "+" : ""}${v} desde a anterior`}
            </p>
            {d.resumo ? <p className="analise-resumo">{d.resumo}</p> : null}
            {d.nivel ? <p className="dica">Nível estimado: <b>{ROTULO_NIVEL[d.nivel]}</b>{d.nivel_motivo ? `. ${d.nivel_motivo}` : ""}</p> : null}
          </div>
        </section>

        {a.tipo === "vaga" ? (
          <section className="cartao analise-nota" aria-label="Conexão com a vaga">
            <AnelNota nota={a.conexao} tamanho={120} />
            <div>
              <span className="dica">Conexão com a vaga</span>
              <p className="analise-resumo">{d.vaga?.titulo}{d.vaga?.empresa ? ` – ${d.vaga.empresa}` : ""}</p>
              <p className="dica">{a.vaga_id ? "Nota da própria vaga no sistema." : "Avaliada pela IA ao comparar a vaga com o currículo."}</p>
              {a.vaga_id ? <Link href={`/vaga/${encodeURIComponent(a.vaga_id)}`} className="dica">Abrir a vaga</Link> : null}
            </div>
          </section>
        ) : null}
      </div>

      <section className="cartao" aria-labelledby="criterios">
        <div className="cartao-cabecalho"><h2 id="criterios"><Icone nome="painel" /> Como a nota foi calculada</h2><span className="dica">Média ponderada dos critérios</span></div>
        <ul className="criterios">
          {d.criterios.map((c) => (
            <li key={c.chave} className={faixaNota(c.nota).classe}>
              <div className="criterio-topo">
                <b>{c.rotulo}</b>
                <span className="dica">peso {c.peso}%</span>
                <strong>{c.nota ?? "fora"}</strong>
              </div>
              <div className="criterio-trilho" aria-hidden><i style={{ width: `${c.nota ?? 0}%` }} /></div>
              <p className="dica">{c.motivo}</p>
            </li>
          ))}
        </ul>
      </section>

      {a.tipo === "vaga" ? (
        <div className="analise-grade">
          <section className="cartao" aria-labelledby="destacar">
            <div className="cartao-cabecalho"><h2 id="destacar"><Icone nome="check" /> O que destacar na candidatura</h2></div>
            <div className="cartao-corpo">{d.destacar?.length ? <ul className="lista-pontos">{d.destacar.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="dica">Nada em especial.</p>}</div>
          </section>
          <section className="cartao" aria-labelledby="lacunas">
            <div className="cartao-cabecalho"><h2 id="lacunas"><Icone nome="alerta" /> Lacunas para essa vaga</h2></div>
            <div className="cartao-corpo">{d.lacunas?.length ? <ul className="lista-pontos falta">{d.lacunas.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="dica">O currículo cobre o que a vaga pede.</p>}</div>
          </section>
        </div>
      ) : null}

      {d.respostas?.length ? (
        <section className="cartao" aria-labelledby="respostas">
          <div className="cartao-cabecalho"><h2 id="respostas"><Icone nome="email" /> Respostas do formulário</h2><span className="dica">Só com fatos do seu currículo. Revise antes de colar.</span></div>
          <ol className="respostas">
            {d.respostas.map((r, i) => (
              <li key={i}>
                <p className="resposta-pergunta">{r.pergunta}</p>
                {r.resposta ? <p className="resposta-texto">{r.resposta}</p> : null}
                {r.confirmar ? <p className="resposta-confirmar"><Icone nome="alerta" tamanho={15} /> <span><b>Confira:</b> {r.confirmar}</span></p> : null}
                {r.resposta ? <BotaoCopiar texto={r.resposta} /> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="analise-grade">
        <section className="cartao" aria-labelledby="fortes">
          <div className="cartao-cabecalho"><h2 id="fortes"><Icone nome="check" /> Pontos fortes</h2></div>
          <div className="cartao-corpo">{d.fortes.length ? <ul className="lista-pontos">{d.fortes.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="dica">Sem comentários da IA nesta análise.</p>}</div>
        </section>
        <section className="cartao" aria-labelledby="melhorias">
          <div className="cartao-cabecalho"><h2 id="melhorias"><Icone nome="sobe" /> O que melhorar primeiro</h2></div>
          <div className="cartao-corpo">
            {d.melhorias.length ? (
              <ol className="melhorias">
                {d.melhorias.map((m, i) => (
                  <li key={i}>
                    {m.trecho ? <blockquote>{m.trecho}</blockquote> : null}
                    <p>{m.sugestao}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="dica">Sem sugestões da IA nesta análise.</p>}
          </div>
        </section>
      </div>

      {proximo && proximo !== d.nivel && d.proximo_nivel.length ? (
        <section className="cartao" aria-labelledby="proximo-nivel">
          <div className="cartao-cabecalho"><h2 id="proximo-nivel"><Icone nome="ranking" /> Para chegar a {ROTULO_NIVEL[proximo]}</h2></div>
          <div className="cartao-corpo"><ul className="lista-pontos">{d.proximo_nivel.map((x) => <li key={x}>{x}</li>)}</ul></div>
        </section>
      ) : null}

      <details className="cartao texto-analisado">
        <summary>Texto analisado</summary>
        <pre>{d.texto}</pre>
      </details>

      <details className="excluir-analise">
        <summary className="botao fantasma pequeno">Excluir esta análise</summary>
        <form action={apagarAnaliseCV}>
          <input type="hidden" name="id" value={a.id} />
          <span className="dica">Ela sai do histórico e do gráfico. Não dá para desfazer.</span>
          <button type="submit" className="botao pequeno perigo">Excluir de vez</button>
        </form>
      </details>
    </Moldura>
  );
}
