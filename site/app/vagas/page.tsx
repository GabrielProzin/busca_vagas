import Link from "next/link";
import Moldura from "@/components/Moldura";
import AcoesVaga from "@/components/AcoesVaga";
import { PERFIL } from "@/lib/gerado/perfil";
import Nota from "@/components/Nota";
import Icone from "@/components/Icone";
import FiltroCargo from "@/components/FiltroCargo";
import { lerPreferencias, listarVagas } from "@/lib/db";
import { textoLocal } from "@/lib/preferencias";
import { fonte, habilidade, idUrl, local, normalizarBusca, origemEmail, quando } from "@/lib/formato";
import { ehNova, type Vaga } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type Busca = { lista?: string; trilha?: string; modalidade?: string; email?: string; q?: string };

export default async function PaginaVagas({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const { prefs } = await lerPreferencias();
  const lista = busca.lista === "vale_tentar" ? "vale_tentar" : "principal";

  let vagas: Vaga[];
  try {
    vagas = await listarVagas();
  } catch (e) {
    console.error("listarVagas:", e); // detalhe técnico só no log da Vercel
    return (
      <Moldura atual="/vagas" titulo="Vagas">
        <div className="cartao vazio">
          <Icone nome="alerta" tamanho={32} />
          <b>Não consegui ler o banco agora.</b>
          <p>Tente recarregar em instantes. Se continuar, confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel e o log da implantação.</p>
        </div>
      </Moldura>
    );
  }

  // "Novas" = sem nenhuma ação sua ainda. Aplicadas e descartadas saem desta lista.
  const novas = vagas.filter(ehNova);
  const contagem = {
    principal: novas.filter((v) => v.lista === "principal").length,
    vale_tentar: novas.filter((v) => v.lista === "vale_tentar").length,
  };
  const daLista = novas.filter((v) => v.lista === lista);
  const trilhas = [...new Set(daLista.map((v) => v.trilha).filter(Boolean))] as string[];
  const termo = normalizarBusca(busca.q ?? "");
  const visiveis = daLista.filter(
    (v) =>
      (!busca.trilha || v.trilha === busca.trilha) &&
      (!busca.modalidade || v.modalidade === busca.modalidade) &&
      (!busca.email || Boolean(v.email_contato)) &&
      (!termo || normalizarBusca(`${v.titulo} ${v.empresa ?? ""} ${v.habilidades_ok.join(" ")}`).includes(termo)),
  );

  const link = (mudar: Partial<Busca>) => {
    const p = new URLSearchParams({ ...(busca as Record<string, string>), ...(mudar as Record<string, string>) });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/vagas?${s}` : "/vagas";
  };

  return (
    <Moldura
      atual="/vagas"
      titulo="Vagas"
      subtitulo={`Vagas ${PERFIL.area}${textoLocal(prefs) ? `, ${textoLocal(prefs)}` : ""}, ordenadas pela nota contra o seu currículo.`}
      acoes={
        <>
        <Link className="botao primario" href="/triagem"><Icone nome="triagem" tamanho={16} /> Triagem rápida</Link>
        <nav className="segmentado" aria-label="Listas">
          <Link href={link({ lista: "", trilha: "", modalidade: "", email: "" })} aria-current={lista === "principal"}>
            Principal <b>{contagem.principal}</b>
          </Link>
          <Link href={link({ lista: "vale_tentar", trilha: "", modalidade: "", email: "" })} aria-current={lista === "vale_tentar"}>
            Vale tentar <b>{contagem.vale_tentar}</b>
          </Link>
        </nav>
        </>
      }
    >
      <section className="cartao tabela-vagas">
        <div className="ferramentas">
          <form className="busca" action="/vagas" role="search">
            <Icone nome="busca" tamanho={16} />
            {Object.entries(busca).filter(([k, v]) => k !== "q" && v).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            <input type="search" name="q" defaultValue={busca.q ?? ""} placeholder="Buscar vagas" aria-label="Buscar" />
          </form>
          <div className="chips">
            <FiltroCargo
              trilhas={trilhas}
              atual={busca.trilha ?? ""}
              base={Object.fromEntries(Object.entries(busca).filter(([k, v]) => k !== "trilha" && v)) as Record<string, string>}
            />
            <Link className="chip" href={link({ email: busca.email ? "" : "1" })} aria-current={Boolean(busca.email)}>
              <Icone nome="email" tamanho={14} /> Com email <span className="n">{daLista.filter((v) => v.email_contato).length}</span>
            </Link>
            <Link className="chip" href={link({ modalidade: busca.modalidade === "remoto" ? "" : "remoto" })} aria-current={busca.modalidade === "remoto"}>
              Remoto
            </Link>
          </div>
          <span className="espaco" />
          <span className="total">{visiveis.length} {visiveis.length === 1 ? "vaga" : "vagas"}</span>
        </div>

        {visiveis.length === 0 ? (
          <div className="vazio">
            <Icone nome="vagas" tamanho={36} />
            {vagas.length === 0 ? (
              <>
                <b>Nenhuma vaga coletada ainda</b>
                <p>A coleta roda por volta das 8:00, 11:00, 14:00, 18:30 e 22:00. Para rodar agora: GitHub → Actions → Coleta de vagas → Run workflow.</p>
              </>
            ) : (
              <>
                <b>Nada por aqui com esses filtros</b>
                <p>Tente a outra lista, limpe os filtros ou veja o que você já aplicou em Candidaturas.</p>
              </>
            )}
          </div>
        ) : (
          <div role="table" aria-label="Vagas">
            <div className="tv-linha tv-cabecalho" role="row">
              <span role="columnheader">Nota</span>
              <span role="columnheader">Vaga</span>
              <span role="columnheader" className="tv-requisitos">Pede e você tem</span>
              <span role="columnheader">Publicada</span>
              <span role="columnheader" style={{ textAlign: "right" }}>Ações</span>
            </div>
            {visiveis.map((v) => <LinhaVaga key={v.id} vaga={v} />)}
          </div>
        )}
      </section>
    </Moldura>
  );
}

function LinhaVaga({ vaga: v }: { vaga: Vaga }) {
  const ok = v.habilidades_ok.slice(0, 3);
  const resto = v.habilidades_ok.length - ok.length;
  return (
    <div className="tv-linha tv-item" role="row">
      <div role="cell"><Nota vaga={v} /></div>
      <div role="cell" style={{ minWidth: 0 }}>
        <Link href={idUrl(v.id)} className="tv-titulo">{v.titulo}</Link>
        <div className="tv-meta">
          <span className="item"><Icone nome="empresa" tamanho={14} />{v.empresa || "Empresa não informada"}</span>
          <span className="item"><Icone nome="local" tamanho={14} />{local(v)}</span>
          <span className="item"><Icone nome="fonte" tamanho={14} />{fonte(v.fonte)}</span>
        </div>
        {v.email_contato ? (
          <div className="etiquetas" style={{ marginTop: 6 }}>
            <span className="etiqueta email"><Icone nome="email" tamanho={12} />{origemEmail(v.email_origem)}</span>
          </div>
        ) : null}
      </div>
      <div role="cell" className="tv-requisitos etiquetas">
        {ok.map((h) => <span key={h} className="etiqueta ok">{habilidade(h)}</span>)}
        {resto > 0 ? <span className="mais">+{resto}</span> : null}
        {v.habilidades_faltando.slice(0, 1).map((h) => <span key={h} className="etiqueta falta">Falta {h}</span>)}
      </div>
      <div role="cell" className="tv-data">{quando(v.publicada_em)}</div>
      <div role="cell" className="tv-acoes">
        {v.url ? (
          <a className="icone-botao" href={v.url} target="_blank" rel="noopener noreferrer" title="Abrir vaga" aria-label={`Abrir a vaga ${v.titulo}`}>
            <Icone nome="externo" />
          </a>
        ) : null}
        <AcoesVaga id={v.id} titulo={v.titulo} />
      </div>
    </div>
  );
}
