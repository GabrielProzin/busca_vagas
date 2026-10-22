import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { lerAnalise } from "@/lib/db";
import type { HabilidadeMercado } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// O que estudar: as habilidades que as vagas abertas no seu nível e local pedem, contra o seu currículo.
// "Destravaria" = vagas em que essa é a ÚNICA habilidade pedida que falta no seu currículo.

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const pct = (x: number) => `${x.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/** Prioridade para estudar: vagas que destrava pesam mais que vagas que só pedem. */
const prioridade = (h: HabilidadeMercado) => h.destravaria * 3 + h.vagas;

function Variacao({ v }: { v: number | null }) {
  if (v === null || Math.abs(v) < 1) return <span className="dica">estável</span>;
  return <span className={v > 0 ? "variacao sobe" : "variacao desce"}>{v > 0 ? "▲" : "▼"} {pct(Math.abs(v))}</span>;
}

export default async function PaginaEstudar() {
  const a = await lerAnalise("estudar");
  const faltam = (a?.habilidades ?? []).filter((h) => !h.tenho && h.vagas > 0);
  const tenho = (a?.habilidades ?? []).filter((h) => h.tenho && h.vagas > 0).sort((x, y) => y.pct - x.pct);
  const primeiro = [...faltam].sort((x, y) => prioridade(y) - prioridade(x)).slice(0, 3);
  const maxPct = Math.max(...faltam.map((h) => h.pct), ...tenho.map((h) => h.pct), 1);

  return (
    <Moldura
      atual="/estudar"
      titulo="O que estudar"
      subtitulo={a ? `Com base em ${a.vagas} vagas abertas no seu nível e local. Atualizado em ${fmt.format(new Date(a.gerado_em))}.` : "As habilidades que mais abririam vagas para você."}
    >
      {!a || !a.vagas ? (
        <div className="cartao vazio">
          <Icone nome="estudar" tamanho={32} />
          <b>A análise sai na próxima coleta completa (por volta das 11:00 ou 18:30).</b>
          <p>Se já passou uma, confira se o SQL mais novo do supabase/schema.sql foi rodado (tabela “analises”).</p>
        </div>
      ) : (
        <>
          <section className="estudar-numeros" aria-label="Resumo">
            <div className="cartao"><strong>{a.vagas}</strong><span>vagas analisadas</span></div>
            <div className="cartao"><strong>{a.completas}</strong><span>em que você já tem tudo o que pedem</span></div>
            <div className="cartao"><strong>{faltam.length}</strong><span>habilidades pedidas que não estão no seu currículo</span></div>
          </section>

          {primeiro.length ? (
            <>
              <h2 className="secao-titulo">Para estudar primeiro</h2>
              <div className="estudar-top">
                {primeiro.map((h, i) => (
                  <section key={h.nome} className="cartao estudar-card" aria-label={h.nome}>
                    <span className="estudar-pos">{i + 1}º</span>
                    <h3>{h.nome}</h3>
                    <p className="estudar-frase">
                      Pedida em <b>{pct(h.pct)}</b> das vagas ({h.vagas}).
                      {h.destravaria ? <> Aprender destravaria <b>{h.destravaria} {h.destravaria === 1 ? "vaga" : "vagas"}</b> em que é a única coisa que falta.</> : null}
                    </p>
                    <span className="estudar-tendencia">Desde a última análise: <Variacao v={h.variacao} /></span>
                    {h.exemplos.length ? <ul className="estudar-exemplos">{h.exemplos.map((e) => <li key={e}>{e}</li>)}</ul> : null}
                  </section>
                ))}
              </div>
            </>
          ) : null}

          <div className="grade-2 estudar-listas">
            <section className="cartao" aria-label="Habilidades que faltam">
              <div className="cartao-cabecalho"><h2>Pedidas e não estão no seu currículo</h2></div>
              <div className="cartao-corpo">
                <div className="estudar-barras">
                  {faltam.map((h) => (
                    <div key={h.nome} className="estudar-linha">
                      <span className="estudar-nome">{h.nome}</span>
                      <span className="trilho"><i style={{ width: `${Math.max(2, (h.pct / maxPct) * 100)}%` }} /></span>
                      <span className="estudar-valor">{pct(h.pct)} · {h.vagas}</span>
                      <span className="estudar-extra">{h.destravaria ? `destrava ${h.destravaria}` : ""} <Variacao v={h.variacao} /></span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="cartao" aria-label="Seus pontos fortes">
              <div className="cartao-cabecalho"><h2>Seus pontos fortes no mercado</h2></div>
              <div className="cartao-corpo">
                <div className="estudar-barras forte">
                  {tenho.map((h) => (
                    <div key={h.nome} className="estudar-linha">
                      <span className="estudar-nome">{h.nome}</span>
                      <span className="trilho"><i style={{ width: `${Math.max(2, (h.pct / maxPct) * 100)}%` }} /></span>
                      <span className="estudar-valor">{pct(h.pct)} · {h.vagas}</span>
                      <span className="estudar-extra"><Variacao v={h.variacao} /></span>
                    </div>
                  ))}
                </div>
                <p className="dica" style={{ marginTop: 12 }}>Habilidades do seu currículo que as vagas mais pedem: vale deixá-las em destaque no currículo e nos emails.</p>
              </div>
            </section>
          </div>
          <p className="dica" style={{ marginTop: 14 }}>
            Uma habilidade citada só como “diferencial” não conta como pedida. O catálogo de habilidades fica em
            config/preferencias.yaml (catalogo_habilidades); você “tem” quando ela aparece no perfil/curriculo.md.
          </p>
        </>
      )}
    </Moldura>
  );
}
