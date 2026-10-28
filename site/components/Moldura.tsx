import Link from "next/link";
import Icone from "./Icone";
import { MODULOS, SECOES, secaoAtual, type Secao } from "@/lib/navegacao";
import { sair } from "@/app/acoes";
import { enviadosHoje, listarCandidaturas, listarExecucoes, listarVagas } from "@/lib/db";
import { PERFIL } from "@/lib/gerado/perfil";
import { situacaoFollowup } from "@/lib/followup";
import { ehNova } from "@/lib/tipos";

const fmtHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

async function resumoNavegacao() {
  try {
    const [vagas, candidaturas, execucoes, enviados] = await Promise.all([
      listarVagas(), listarCandidaturas(), listarExecucoes(1), enviadosHoje().catch(() => 0),
    ]);
    const novas = vagas.filter((v) => ehNova(v) && v.lista === "principal").length;
    const ultima = execucoes[0]?.iniciada_em ?? null;
    const horas = ultima ? (Date.now() - new Date(ultima).getTime()) / 36e5 : null;
    const followups = candidaturas.filter((v) => situacaoFollowup(v.candidatura)?.estado === "followup").length;
    const fila = vagas.filter((v) => v.candidatura?.status === "nova" && v.candidatura.fila_em).length;
    return { novas, candidaturas: candidaturas.length, fila, enviados, followups, ultima, atrasada: horas !== null && horas > 20 };
  } catch {
    return { novas: 0, candidaturas: 0, fila: 0, enviados: 0, followups: 0, ultima: null, atrasada: false };
  }
}

type Props = {
  atual: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  voltar?: { href: string; rotulo: string };
  /** Usa a largura toda da tela (quadro de candidaturas). */
  larga?: boolean;
  children: React.ReactNode;
};

export default async function Moldura({ atual, titulo, subtitulo, acoes, voltar, larga, children }: Props) {
  const nav = await resumoNavegacao();
  const ativa = secaoAtual(atual);
  // No celular, uma seção que não está na barra de baixo acende a do mesmo módulo (Análise de CV -> Perfil);
  // se o módulo não tem item na barra (Mercado, Sistema), acende o "Mais".
  const baixoAtivo = ativa?.baixo ? ativa : SECOES.find((s) => s.baixo && s.modulo === ativa?.modulo && s.modulo !== "inicio");
  return (
    <div className="app">
      <aside className="lateral" aria-label="Navegação">
        <Link href="/" className="marca">
          <span className="marca-simbolo" aria-hidden>
            <i /><i /><i />
          </span>
          busca_vagas
        </Link>
        <nav className="lateral-nav" aria-label="Menu">
          {MODULOS.map((m) => {
            const itens = SECOES.filter((s) => s.modulo === m.id);
            // Módulo de uma página só (Início): link direto, sem abrir e fechar.
            if (itens.length === 1) return <ItemMenu key={m.id} s={itens[0]} ativo={ativa?.href === itens[0].href} nav={nav} />;
            const aberto = itens.some((s) => s.href === ativa?.href);
            return (
              <details key={m.id} className="modulo" open={aberto || undefined}>
                <summary>
                  <Icone nome={m.icone} />
                  <span>{m.rotulo}</span>
                  <Icone nome="abaixo" tamanho={16} className="modulo-seta" />
                </summary>
                <div className="modulo-itens">
                  {itens.map((s) => <ItemMenu key={s.href} s={s} ativo={ativa?.href === s.href} nav={nav} />)}
                </div>
              </details>
            );
          })}
        </nav>
        <div className="lateral-rodape">
          <div className={`status-coleta${nav.atrasada ? " atrasada" : ""}`}>
            <span className="ponto-status" aria-hidden />
            <div>
              <b>{nav.atrasada ? "Coleta atrasada" : "Coleta em dia"}</b>
              <span>{nav.ultima ? `Última: ${fmtHora.format(new Date(nav.ultima))}` : "Nenhuma coleta ainda"}</span>
            </div>
          </div>
          <form action={sair}>
            <button className="lateral-sair" type="submit">
              <Icone nome="sair" /> Sair
            </button>
          </form>
        </div>
      </aside>

      <div className="area-principal">
        <header className="barra-mobile">
          <Link href="/" className="marca">
            <span className="marca-simbolo" aria-hidden><i /><i /><i /></span>
            busca_vagas
          </Link>
          <form action={sair}>
            <button className="botao fantasma pequeno" type="submit">Sair</button>
          </form>
        </header>

        <main className={larga ? "pagina larga" : "pagina"}>
          {voltar ? (
            <Link href={voltar.href} className="trilha">
              <Icone nome="voltar" tamanho={16} /> {voltar.rotulo}
            </Link>
          ) : null}
          <div className="pagina-cabecalho">
            <div className="pagina-titulos">
              <h1>{titulo}</h1>
              {subtitulo ? <div className="pagina-sub">{subtitulo}</div> : null}
            </div>
            {acoes ? <div className="pagina-acoes">{acoes}</div> : null}
          </div>
          {nav.atrasada && atual === "/" ? (
            <div className="faixa aviso" role="status">
              <Icone nome="alerta" /> A última coleta já passou de 20 horas. Confira em GitHub → Actions se ela falhou.
            </div>
          ) : null}
          {children}
        </main>
      </div>

      <nav className="nav-baixo" aria-label="Seções">
        {SECOES.filter((s) => s.baixo).map((s) => (
          <Link key={s.href} href={s.href} aria-current={baixoAtivo?.href === s.href ? "page" : undefined}>
            <span className="nav-baixo-icone">
              <Icone nome={s.icone} tamanho={22} />
              {s.href === "/candidaturas" && nav.followups ? <span className="ponto-quente" aria-label={`${nav.followups} follow-ups pendentes`} /> : null}
            </span>
            <span>{s.curto}</span>
          </Link>
        ))}
        {/* No celular, as outras seções (Painel, Uso dos serviços, Configurações...) ficam na tela Mais. */}
        <Link href="/mais" aria-current={atual === "/mais" || (ativa && !baixoAtivo) ? "page" : undefined}>
          <span className="nav-baixo-icone"><Icone nome="mais" tamanho={22} /></span>
          <span>Mais</span>
        </Link>
      </nav>
    </div>
  );
}

type ResumoNav = Awaited<ReturnType<typeof resumoNavegacao>>;

function ItemMenu({ s, ativo, nav }: { s: Secao; ativo: boolean; nav: ResumoNav }) {
  const n = s.conta ? nav[s.conta] : 0;
  const fu = s.href === "/candidaturas" ? nav.followups : 0;
  return (
    <Link href={s.href} aria-current={ativo ? "page" : undefined}>
      <Icone nome={s.icone} />
      <span>{s.rotulo}</span>
      {fu ? (
        <span className="contador quente" title={`${fu} ${fu === 1 ? "follow-up pendente" : "follow-ups pendentes"}`}>
          {fu}<span className="sr-only"> {fu === 1 ? "follow-up pendente" : "follow-ups pendentes"}</span>
        </span>
      ) : null}
      {s.href === "/lote" ? (
        <span className={`contador envio${nav.enviados >= PERFIL.envio.limiteDiario ? " cheio" : ""}`} title="Emails enviados hoje / limite do dia">
          {nav.enviados}/{PERFIL.envio.limiteDiario}<span className="sr-only"> emails enviados hoje</span>
        </span>
      ) : n ? <span className="contador">{n}</span> : null}
    </Link>
  );
}
