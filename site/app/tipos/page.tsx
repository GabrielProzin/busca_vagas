import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { lerAnalise } from "@/lib/db";
import { idUrl } from "@/lib/formato";

export const dynamic = "force-dynamic";

// Tipos de vaga: as vagas abertas agrupadas por semelhança do texto (embeddings + k-means, na coleta completa),
// do tipo que mais combina com o seu currículo (nota média) para o que menos. A barra é quantas vagas há.

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

const FAIXAS = [
  { min: 70, classe: "combina-muito", rotulo: "Combina muito" },
  { min: 60, classe: "combina-bem", rotulo: "Combina bem" },
  { min: 50, classe: "combina-parte", rotulo: "Combina em parte" },
  { min: -1, classe: "combina-pouco", rotulo: "Combina pouco" },
];
const faixa = (nota: number | null) => FAIXAS.find((f) => (nota ?? 0) >= f.min)!;

export default async function PaginaTipos() {
  const t = await lerAnalise("tipos");
  const grupos = t?.grupos ?? [];
  const maior = Math.max(1, ...grupos.map((g) => g.vagas));

  return (
    <Moldura
      atual="/tipos"
      titulo="Tipos de vaga"
      subtitulo={t && grupos.length
        ? `${t.vagas} vagas abertas no seu nível e local, em ${grupos.length} tipos, do que mais combina com você para o que menos. Atualizado em ${fmt.format(new Date(t.gerado_em))}.`
        : "Que tipos de vaga existem e quanto cada um combina com você."}
    >
      {!grupos.length ? (
        <div className="cartao vazio">
          <Icone nome="ranking" tamanho={32} />
          <b>Sai na próxima coleta completa (por volta das 11:00 ou 18:30).</b>
          <p>Se já passou uma, confira se o SQL mais novo do supabase/schema.sql foi rodado (tabela “analises”).</p>
        </div>
      ) : (
        <>
          <section className="cartao tipos-lista" aria-label="Tipos de vaga">
            {grupos.map((g, i) => {
              const f = faixa(g.nota_media);
              return (
                <details key={g.nome} className={`tipo ${f.classe}`}>
                  <summary>
                    <span className="tipo-pos">{i + 1}º</span>
                    <span className="tipo-nome"><b>{g.trilha}</b><span>{g.termos}</span></span>
                    <span className="tipo-barra">
                      <span className="trilho"><i style={{ width: `${(g.vagas / maior) * 100}%` }} /></span>
                      <b>{g.vagas} {g.vagas === 1 ? "vaga" : "vagas"}</b>
                    </span>
                    <span className="tipo-combina">
                      <span className="pill-combina">{f.rotulo}</span>
                      <span>{g.nota_media !== null ? `nota média ${Math.round(g.nota_media)}` : "sem nota"} · {g.na_lista} na lista</span>
                    </span>
                    <span className="tipo-seta"><Icone nome="abaixo" tamanho={18} /></span>
                  </summary>
                  <div className="tipo-detalhe">
                    <div>
                      <h4>Você já tem</h4>
                      {g.tenho.length ? <div className="etiquetas">{g.tenho.map((h) => <span key={h} className="etiqueta email">{h}</span>)}</div> : <span className="dica">—</span>}
                    </div>
                    <div>
                      <h4>O que mais falta</h4>
                      {g.falta.length ? (
                        <div className="etiquetas">{g.falta.map((h) => <span key={h.nome} className="etiqueta falta falta-pct">{h.nome} <b>{h.pct}%</b></span>)}</div>
                      ) : <span className="dica">Nada: você tem o que esse tipo pede.</span>}
                    </div>
                    <div>
                      <h4>Melhores da sua lista</h4>
                      {g.exemplos.length ? (
                        <ul>{g.exemplos.map((v) => <li key={v.id}><Link href={idUrl(v.id)}>{v.titulo}</Link>{v.nota !== null ? <span className="dica"> · {Math.round(v.nota)}</span> : null}</li>)}</ul>
                      ) : <span className="dica">Nenhuma na lista agora.</span>}
                    </div>
                  </div>
                </details>
              );
            })}
          </section>
          <div className="tipos-legenda" aria-hidden>
            {FAIXAS.map((f) => <span key={f.classe} className={f.classe}><i />{f.rotulo}</span>)}
            <span>Barra = quantas vagas · clique num tipo para ver o que falta e as vagas</span>
          </div>
          {t?.metodo ? <p className="dica" style={{ marginTop: 10 }}>Como é feito: {t.metodo}. “O que mais falta” mostra em quantas vagas do tipo a habilidade é pedida.</p> : null}
        </>
      )}
    </Moldura>
  );
}
