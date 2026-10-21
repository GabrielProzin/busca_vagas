import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { enviadosHoje, lerUso, listarExecucoes } from "@/lib/db";
import { medidoEm, montarUso, type Barra, type CartaoUso } from "@/lib/uso";

export const dynamic = "force-dynamic";

// Uso dos serviços grátis: quanto de cada limite já foi usado. GitHub, Supabase e Apify são medidos a cada
// coleta (coletor/uso.py); Gemini e Gmail são contados a cada uso; a Vercel só tem os limites.

const ROTULO = { ok: "Tranquilo", atencao: "Atenção", critico: "Perto do limite", sem: "Sem medição" } as const;

export default async function PaginaUso() {
  const [uso, execucoes, hoje] = await Promise.all([
    lerUso(),
    listarExecucoes(1).catch(() => []),
    enviadosHoje().catch(() => 0),
  ]);
  const cartoes = montarUso({
    servicos: uso?.servicos ?? [],
    diario: uso?.diario ?? [],
    ultimaColeta: execucoes[0]?.iniciada_em ?? null,
    emailsCandidaturaHoje: hoje,
  });
  const faltaMedir = ["github", "supabase", "apify"].filter((id) => !cartoes.some((c) => c.id === id));

  return (
    <Moldura
      atual="/uso"
      titulo="Uso dos serviços"
      subtitulo="Quanto de cada plano grátis já foi usado. Passou de 80% em algum, você recebe um email."
    >
      {!uso ? (
        <Link href="/configuracoes" className="faixa aviso">
          <Icone nome="alerta" /> Falta criar as tabelas do monitor: rode de novo o supabase/schema.sql no Supabase (não apaga nada).
        </Link>
      ) : faltaMedir.length ? (
        <div className="faixa aviso" role="status">
          <Icone nome="relogio" /> {faltaMedir.map((id) => ({ github: "GitHub", supabase: "Supabase", apify: "Apify" })[id]).join(", ")}: a primeira medição sai na próxima coleta.
        </div>
      ) : null}
      <div className="uso-grade">
        {cartoes.map((c) => <Cartao key={c.id} c={c} />)}
      </div>
    </Moldura>
  );
}

function Cartao({ c }: { c: CartaoUso }) {
  return (
    <section className={`cartao uso-cartao ${c.estado}`} aria-label={c.nome}>
      <div className="cartao-cabecalho">
        <div>
          <h2>{c.nome}</h2>
          <span className="dica">{c.para}</span>
        </div>
        <span className={`uso-estado ${c.estado}`}>{ROTULO[c.estado]}</span>
      </div>
      <div className="cartao-corpo">
        {c.barras.map((b) => <BarraUso key={b.rotulo} b={b} />)}
        {c.linhas.map((l) => <p key={l} className="dica uso-linha">{l}</p>)}
      </div>
      <div className="cartao-rodape uso-rodape">
        <span className="dica">{c.estado === "sem" ? "Não medido" : medidoEm(c.medidoEm)}</span>
        <a href={c.link.href} target="_blank" rel="noopener noreferrer">{c.link.rotulo} <Icone nome="externo" tamanho={13} /></a>
      </div>
    </section>
  );
}

function BarraUso({ b }: { b: Barra }) {
  const f = b.limite ? Math.min(1, b.usado / b.limite) : null;
  const nivel = f === null ? "" : f >= 0.8 ? "critico" : f >= 0.6 ? "atencao" : "";
  return (
    <div className={`uso-barra ${nivel}`}>
      <div className="uso-barra-topo">
        <span>{b.rotulo}</span>
        <b>{b.texto}{f !== null ? <small> · {Math.round(f * 100)}%</small> : null}</b>
      </div>
      {f !== null ? <span className="uso-trilho" aria-hidden><i style={{ width: `${Math.max(b.usado ? 2 : 0, f * 100)}%` }} /></span> : null}
    </div>
  );
}
