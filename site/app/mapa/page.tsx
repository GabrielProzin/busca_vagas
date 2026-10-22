import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import MapaVagas from "@/components/MapaVagas";
import { lerAnalise } from "@/lib/db";
import { idUrl } from "@/lib/formato";

export const dynamic = "force-dynamic";

// Mapa das vagas: embeddings do texto de cada vaga, agrupados (k-means) e levados para 2D (t-SNE) pela coleta.

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function PaginaMapa() {
  const m = await lerAnalise("mapa");
  const vazio = !m || !m.pontos.length;
  const perto = m?.grupos[0];
  const maior = m ? [...m.grupos].sort((a, b) => b.vagas - a.vagas)[0] : undefined;

  return (
    <Moldura
      atual="/mapa"
      titulo="Mapa das vagas"
      subtitulo={m && !vazio ? `${m.vagas} vagas abertas no seu nível e local, em ${m.grupos.length} grupos. Atualizado em ${fmt.format(new Date(m.gerado_em))}.` : "Vagas parecidas ficam perto umas das outras."}
    >
      {vazio ? (
        <div className="cartao vazio">
          <Icone nome="mapa" tamanho={32} />
          <b>O mapa sai na próxima coleta completa (por volta das 11:00 ou 18:30).</b>
          <p>Se já passou uma, confira se o SQL mais novo do supabase/schema.sql foi rodado (tabela “analises”).</p>
        </div>
      ) : (
        <>
          <section className="mapa-resumo" aria-label="Resumo do mapa">
            {perto ? (
              <div className={`cartao mapa-destaque g${perto.id}`}>
                <span className="dica">Mais perto do seu currículo</span>
                <b><i aria-hidden /> {perto.nome}</b>
                <span>{perto.vagas} vagas · {perto.na_lista} na sua lista{perto.nota_media !== null ? ` · nota média ${Math.round(perto.nota_media)}` : ""}</span>
              </div>
            ) : null}
            {maior && maior.id !== perto?.id ? (
              <div className={`cartao mapa-destaque g${maior.id}`}>
                <span className="dica">Onde há mais vagas</span>
                <b><i aria-hidden /> {maior.nome}</b>
                <span>{maior.vagas} vagas · {maior.na_lista} na sua lista{maior.nota_media !== null ? ` · nota média ${Math.round(maior.nota_media)}` : ""}</span>
              </div>
            ) : null}
          </section>

          <section className="cartao mapa-cartao" aria-label="Mapa">
            <MapaVagas pontos={m.pontos} grupos={m.grupos} cv={m.cv} />
          </section>

          <h2 className="secao-titulo">Os grupos, do mais perto do seu currículo para o mais longe</h2>
          <div className="mapa-grupos">
            {m.grupos.map((g) => {
              const daLista = m.pontos.filter((p) => p.grupo === g.id && p.no_site).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0)).slice(0, 4);
              const max = Math.max(...m.grupos.map((x) => x.proximidade), 1e-6);
              return (
                <section key={g.id} className={`cartao mapa-grupo g${g.id}`} aria-label={g.nome}>
                  <h3><i aria-hidden /> {g.nome}</h3>
                  <div className="mapa-grupo-numeros">
                    <span><b>{g.vagas}</b> vagas</span>
                    <span><b>{g.na_lista}</b> na sua lista</span>
                    {g.nota_media !== null ? <span><b>{Math.round(g.nota_media)}</b> nota média</span> : null}
                  </div>
                  <div className="mapa-proximidade">
                    <span className="dica">Perto do seu currículo</span>
                    <span className="trilho"><i style={{ width: `${Math.max(4, (g.proximidade / max) * 100)}%` }} /></span>
                  </div>
                  {g.habilidades.length ? (
                    <div className="etiquetas">{g.habilidades.map((h) => <span key={h} className="etiqueta">{h}</span>)}</div>
                  ) : null}
                  {daLista.length ? (
                    <ul className="mapa-grupo-vagas">
                      {daLista.map((p) => <li key={p.id}><Link href={idUrl(p.id)}>{p.titulo}</Link><span className="dica"> {p.empresa}</span></li>)}
                    </ul>
                  ) : null}
                </section>
              );
            })}
          </div>
          {m.metodo ? <p className="dica" style={{ marginTop: 14 }}>Como é feito: {m.metodo}. O número de grupos é o que separa melhor as vagas (silhueta).</p> : null}
        </>
      )}
    </Moldura>
  );
}
