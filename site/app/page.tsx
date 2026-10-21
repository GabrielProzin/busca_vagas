import Link from "next/link";
import Topo from "@/components/Topo";
import Nota from "@/components/Nota";
import { alterarStatus } from "./acoes";
import { listarVagas } from "@/lib/db";
import { fonte, habilidade, idUrl, local, quando } from "@/lib/formato";
import type { Vaga } from "@/lib/tipos";

export const dynamic = "force-dynamic";

type Busca = { lista?: string; trilha?: string; modalidade?: string };

export default async function PaginaVagas({ searchParams }: { searchParams: Promise<Busca> }) {
  const busca = await searchParams;
  const lista = busca.lista === "vale_tentar" ? "vale_tentar" : "principal";

  let vagas: Vaga[];
  try {
    vagas = await listarVagas();
  } catch (e) {
    return <ErroBanco erro={e as Error} />;
  }
  // "Novas" = sem nenhuma ação sua ainda. Aplicadas e descartadas saem desta lista.
  const novas = vagas.filter((v) => !v.candidatura || v.candidatura.status === "nova");
  const contagem = {
    principal: novas.filter((v) => v.lista === "principal").length,
    vale_tentar: novas.filter((v) => v.lista === "vale_tentar").length,
  };
  const daLista = novas.filter((v) => v.lista === lista);
  const trilhas = [...new Set(daLista.map((v) => v.trilha).filter(Boolean))] as string[];
  const visiveis = daLista.filter(
    (v) => (!busca.trilha || v.trilha === busca.trilha) && (!busca.modalidade || v.modalidade === busca.modalidade),
  );

  const link = (mudar: Partial<Busca>) => {
    const p = new URLSearchParams({ ...(busca as Record<string, string>), ...(mudar as Record<string, string>) });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    const s = p.toString();
    return s ? `/?${s}` : "/";
  };

  return (
    <>
      <Topo atual="/" />
      <main className="conteudo">
        <div className="cabecalho">
          <div>
            <h1>Vagas para você hoje</h1>
            <p className="sub">Júnior de dados, remotas ou em Goiânia, ordenadas pela nota contra o seu currículo.</p>
          </div>
          <nav className="abas" aria-label="Listas">
            <Link href={link({ lista: "", trilha: "", modalidade: "" })} aria-current={lista === "principal"}>
              Principal<b>{contagem.principal}</b>
            </Link>
            <Link href={link({ lista: "vale_tentar", trilha: "", modalidade: "" })} aria-current={lista === "vale_tentar"}>
              Vale tentar<b>{contagem.vale_tentar}</b>
            </Link>
          </nav>
        </div>

        {daLista.length > 0 ? (
          <div className="filtros" aria-label="Filtros">
            <Link href={link({ trilha: "" })} aria-current={!busca.trilha}>Todos os cargos</Link>
            {trilhas.map((t) => (
              <Link key={t} href={link({ trilha: t })} aria-current={busca.trilha === t}>{t}</Link>
            ))}
            <Link href={link({ modalidade: busca.modalidade === "remoto" ? "" : "remoto" })} aria-current={busca.modalidade === "remoto"}>
              Só remoto
            </Link>
          </div>
        ) : null}

        {visiveis.length === 0 ? (
          <div className="vazio">
            {novas.length === 0 && vagas.length === 0 ? (
              <>
                <p><b>Nenhuma vaga coletada ainda.</b></p>
                <p>A coleta roda todo dia por volta das 11:00 e das 18:30. Para rodar agora: GitHub → Actions → Coleta de vagas → Run workflow.</p>
              </>
            ) : (
              <p>Nada novo nesta lista. Veja a outra aba ou o que você já aplicou em Candidaturas.</p>
            )}
          </div>
        ) : (
          <ul className="lista">
            {visiveis.map((v) => (
              <ItemVaga key={v.id} vaga={v} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function ItemVaga({ vaga: v }: { vaga: Vaga }) {
  const resumo = v.motivos.find((m) => m.startsWith("Trecho")) ?? v.motivos[0];
  return (
    <li>
      <Nota vaga={v} />
      <div>
        <Link href={idUrl(v.id)} className="vaga-titulo">{v.titulo}</Link>
        <div className="meta">
          <span>{v.empresa || "Empresa não informada"}</span>
          <span>{local(v)}</span>
          <span>{fonte(v.fonte)}, {quando(v.publicada_em)}</span>
        </div>
        {resumo ? <p className="motivo">{resumo}</p> : null}
        <div className="etiquetas">
          {v.email_contato ? <span className="etiqueta email">Tem email do recrutador</span> : null}
          {v.habilidades_ok.slice(0, 5).map((h) => (
            <span key={h} className="etiqueta">{habilidade(h)}</span>
          ))}
          {v.habilidades_faltando.map((h) => (
            <span key={h} className="etiqueta falta">Falta {h}</span>
          ))}
        </div>
      </div>
      <div className="acoes">
        {v.url ? (
          <a className="botao primario" href={v.url} target="_blank" rel="noopener noreferrer">Abrir vaga</a>
        ) : null}
        <form action={alterarStatus}>
          <input type="hidden" name="id" value={v.id} />
          <button className="botao" name="status" value="aplicada">Já apliquei</button>
          <button className="botao discreto" name="status" value="descartada">Descartar</button>
        </form>
      </div>
    </li>
  );
}

function ErroBanco({ erro }: { erro: Error }) {
  return (
    <>
      <Topo atual="/" />
      <main className="conteudo">
        <div className="vazio">
          <p><b>Não consegui ler o banco.</b></p>
          <p>{erro.message}</p>
          <p>Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nas variáveis de ambiente da Vercel.</p>
        </div>
      </main>
    </>
  );
}
