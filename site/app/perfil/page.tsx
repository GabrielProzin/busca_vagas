import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import AnelNota from "@/components/AnelNota";
import GraficoEvolucao from "@/components/GraficoEvolucao";
import { lerAnalise, listarAnalisesCV, listarVagas } from "@/lib/db";
import { ROTULO_NIVEL } from "@/lib/cv";
import { NIVEIS, proximosPassos, variacao } from "@/lib/perfil";
import { PERFIL } from "@/lib/gerado/perfil";

export const dynamic = "force-dynamic";

// Perfil profissional: nível de mercado, próximo passo e evolução das notas (docs/spec.md, "Telas").

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const dia = (iso: string) => fmt.format(new Date(iso)).replace(".", "");

export default async function PaginaPerfil() {
  const [analises, estudar, vagas] = await Promise.all([listarAnalisesCV(), lerAnalise("estudar"), listarVagas()]);
  const gerais = analises.filter((a) => a.tipo === "geral");
  const geral = gerais[0] ?? null;
  const passos = proximosPassos(geral, estudar);
  const combinam = vagas.filter((v) => v.lista === "principal" && (v.nota ?? 0) >= 70).length;
  const nivel = geral?.dados.nivel ?? null;
  const proximo = nivel ? NIVEIS[Math.min(NIVEIS.indexOf(nivel) + 1, NIVEIS.length - 1)] : null;
  const varia = geral ? variacao(analises, geral) : null;
  const topoEstudar = (estudar?.habilidades ?? []).filter((h) => !h.tenho && h.vagas > 0).sort((a, b) => b.destravaria * 3 + b.vagas - (a.destravaria * 3 + a.vagas))[0];

  return (
    <Moldura
      atual="/perfil"
      titulo="Perfil profissional"
      subtitulo="Seu currículo e o mercado juntos: onde você está e para onde ir."
      acoes={<Link href="/perfil/cv" className="botao primario"><Icone nome="ia" tamanho={16} /> Nova análise de CV</Link>}
    >
      <div className="perfil-topo">
        <section className="cartao perfil-quem" aria-label="Seu nível">
          <div className="perfil-quem-cabeca">
            <span className={`selo-nivel${nivel ? "" : " sem"}`}>{nivel ? ROTULO_NIVEL[nivel] : "Nível a definir"}</span>
            <span className="dica">{PERFIL.titulo.split("|").map((x) => x.trim()).join(" · ")}</span>
          </div>
          <p className="perfil-frase">
            {geral?.dados.nivel_motivo ?? "Faça uma análise geral do CV para o sistema estimar o seu nível com base no que você já fez."}
          </p>
          {geral?.dados.resumo ? <p className="dica">{geral.dados.resumo}</p> : null}
          <p className="perfil-fonte">
            {geral ? `Feito com a análise de CV de ${dia(geral.criada_em)}` : "Ainda sem análise de CV"}
            {estudar?.vagas ? ` e as ${estudar.vagas} vagas do seu nível analisadas na última coleta.` : "."}
          </p>
        </section>

        <section className="cartao perfil-passo" aria-label="Seu próximo passo">
          <span className="rotulo-pequeno">Seu próximo passo</span>
          {passos[0] ? (
            <>
              <h2>{passos[0].titulo}</h2>
              <p>{passos[0].texto}</p>
              <Link href={passos[0].href} className="botao primario">{passos[0].botao} <Icone nome="voltar" tamanho={15} className="seta-direita" /></Link>
              {passos[1] ? <p className="perfil-depois"><b>Depois:</b> {passos[1].titulo.charAt(0).toLowerCase() + passos[1].titulo.slice(1)}.</p> : null}
            </>
          ) : <p>Nada pendente por agora.</p>}
        </section>
      </div>

      <section className="perfil-numeros" aria-label="Números do perfil">
        <div className="cartao perfil-numero">
          <AnelNota nota={geral?.nota ?? null} tamanho={64} legenda={false} />
          <div>
            <span>Nota do CV</span>
            <strong>{geral ? geral.nota : "–"}<small>/100</small></strong>
            <em className={varia === null ? "" : varia >= 0 ? "variacao sobe" : "variacao desce"}>{varia === null ? (geral ? "primeira análise" : "sem análise") : `${varia >= 0 ? "+" : ""}${varia} desde a anterior`}</em>
          </div>
        </div>
        <div className="cartao perfil-numero">
          <span className="perfil-icone"><Icone nome="vagas" tamanho={22} /></span>
          <div>
            <span>Vagas que combinam</span>
            <strong>{combinam}</strong>
            <em>abertas, com nota 70 ou mais</em>
          </div>
        </div>
        <div className="cartao perfil-numero">
          <span className="perfil-icone"><Icone nome="estudar" tamanho={22} /></span>
          <div>
            <span>O que mais abriria vagas</span>
            <strong className="texto">{topoEstudar?.nome ?? "–"}</strong>
            <em>{topoEstudar ? `pedida em ${Math.round(topoEstudar.pct)}% das vagas` : "sai na próxima coleta completa"}</em>
          </div>
        </div>
      </section>

      <div className="perfil-grade">
        <section className="cartao" aria-label="Evolução das notas">
          <div className="cartao-cabecalho">
            <h2><Icone nome="sobe" /> Evolução das notas</h2>
            <Link href="/perfil/cv" className="dica">Ver análises</Link>
          </div>
          <div className="cartao-corpo">
            {gerais.length ? (
              <GraficoEvolucao series={[{ nome: "Currículo", classe: "s-cv", pontos: gerais.map((a) => ({ quando: a.criada_em, nota: a.nota, titulo: a.titulo })) }]} />
            ) : (
              <div className="vazio"><Icone nome="sobe" tamanho={28} /><b>Sem notas ainda.</b><p>Cada análise geral do CV vira um ponto neste gráfico.</p></div>
            )}
            <p className="dica grafico-nota">A nota do LinkedIn entra aqui quando o módulo do LinkedIn estiver pronto.</p>
          </div>
        </section>

        <section className="cartao" aria-label="Nível de mercado">
          <div className="cartao-cabecalho"><h2><Icone nome="ranking" /> Nível de mercado</h2></div>
          <div className="cartao-corpo">
            <ol className="niveis">
              {NIVEIS.map((n) => (
                <li key={n} aria-current={n === nivel ? "step" : undefined}>{ROTULO_NIVEL[n]}</li>
              ))}
            </ol>
            {proximo && proximo !== nivel && geral?.dados.proximo_nivel.length ? (
              <>
                <h3 className="niveis-titulo">Para chegar a {ROTULO_NIVEL[proximo]}</h3>
                <ul className="lista-pontos">
                  {geral.dados.proximo_nivel.map((p) => <li key={p}>{p}</li>)}
                </ul>
              </>
            ) : (
              <p className="dica">{geral ? "A análise mais recente não trouxe o que falta para o próximo nível." : "O nível aparece depois da primeira análise geral do CV."}</p>
            )}
          </div>
        </section>
      </div>
    </Moldura>
  );
}
