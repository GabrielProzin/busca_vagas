import Link from "next/link";
import Icone, { type NomeIcone } from "./Icone";
import { sair } from "@/app/acoes";
import { listarCandidaturas, listarExecucoes, listarVagas } from "@/lib/db";

const SECOES: { href: string; rotulo: string; curto: string; icone: NomeIcone; conta?: "novas" | "candidaturas" }[] = [
  { href: "/", rotulo: "Vagas", curto: "Vagas", icone: "vagas", conta: "novas" },
  { href: "/adicionar", rotulo: "Adicionar vaga", curto: "Adicionar", icone: "adicionar" },
  { href: "/candidaturas", rotulo: "Candidaturas", curto: "Candidaturas", icone: "candidaturas", conta: "candidaturas" },
  { href: "/painel", rotulo: "Painel", curto: "Painel", icone: "painel" },
  { href: "/configuracoes", rotulo: "Configurações", curto: "Ajustes", icone: "config" },
];

const fmtHora = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

async function resumoNavegacao() {
  try {
    const [vagas, candidaturas, execucoes] = await Promise.all([listarVagas(), listarCandidaturas(), listarExecucoes(1)]);
    const novas = vagas.filter((v) => (!v.candidatura || v.candidatura.status === "nova") && v.lista === "principal").length;
    const ultima = execucoes[0]?.iniciada_em ?? null;
    const horas = ultima ? (Date.now() - new Date(ultima).getTime()) / 36e5 : null;
    return { novas, candidaturas: candidaturas.length, ultima, atrasada: horas !== null && horas > 20 };
  } catch {
    return { novas: 0, candidaturas: 0, ultima: null, atrasada: false };
  }
}

type Props = {
  atual: string;
  titulo: string;
  subtitulo?: React.ReactNode;
  acoes?: React.ReactNode;
  voltar?: { href: string; rotulo: string };
  children: React.ReactNode;
};

export default async function Moldura({ atual, titulo, subtitulo, acoes, voltar, children }: Props) {
  const nav = await resumoNavegacao();
  return (
    <div className="app">
      <aside className="lateral" aria-label="Navegação">
        <Link href="/" className="marca">
          <span className="marca-simbolo" aria-hidden>
            <i /><i /><i />
          </span>
          busca_vagas
        </Link>
        <nav className="lateral-nav">
          {SECOES.map((s) => {
            const n = s.conta ? nav[s.conta] : 0;
            return (
              <Link key={s.href} href={s.href} aria-current={atual === s.href ? "page" : undefined}>
                <Icone nome={s.icone} />
                <span>{s.rotulo}</span>
                {n ? <span className="contador">{n}</span> : null}
              </Link>
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

        <main className="pagina">
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
        {SECOES.map((s) => (
          <Link key={s.href} href={s.href} aria-current={atual === s.href ? "page" : undefined}>
            <Icone nome={s.icone} tamanho={22} />
            <span>{s.curto}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
