import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { enviadosHoje, lerUso, listarExecucoes } from "@/lib/db";
import { montarUso, quandoMedido, type Medidor } from "@/lib/uso";

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
  const medidores = montarUso({
    servicos: uso?.servicos ?? [],
    diario: uso?.diario ?? [],
    ultimaColeta: execucoes[0]?.iniciada_em ?? null,
    emailsCandidaturaHoje: hoje,
  });
  const faltaMedir = ["github", "supabase", "apify"].filter((id) => !medidores.some((c) => c.id === id));

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
      <div className="medidores">
        {medidores.map((m) => <Cartao key={m.id} m={m} />)}
      </div>
    </Moldura>
  );
}

const RAIO = 54;
const VOLTA = 2 * Math.PI * RAIO;

function Cartao({ m }: { m: Medidor }) {
  const f = m.fracao === null ? 0 : Math.min(1, m.fracao);
  const centro = m.centro ?? `${Math.round((m.fracao ?? 0) * 100)}%`;
  return (
    <section className={`cartao medidor ${m.estado}`} aria-label={m.nome}>
      <svg className="medidor-anel" width="150" height="150" viewBox="0 0 150 150" role="img"
        aria-label={m.fracao === null ? `${m.nome}: ${m.texto}` : `${m.nome}: ${Math.round(m.fracao * 100)}% do limite grátis`}>
        <circle cx="75" cy="75" r={RAIO} className="medidor-fundo" />
        {f > 0 ? (
          <circle cx="75" cy="75" r={RAIO} className="medidor-valor" strokeDasharray={`${VOLTA * Math.max(f, 0.015)} ${VOLTA}`} transform="rotate(-90 75 75)" />
        ) : null}
        <text x="75" y={m.fracao === null ? 86 : 80} textAnchor="middle" className="medidor-numero">{centro}</text>
        {m.fracao !== null ? <text x="75" y="101" textAnchor="middle" className="medidor-legenda">do limite</text> : null}
      </svg>
      <h2>{m.nome}</h2>
      <span className="dica">{m.para}</span>
      <b className="medidor-texto">{m.texto}</b>
      <span className={`uso-estado ${m.estado}`}>{ROTULO[m.estado]}</span>
      <span className="dica">{m.periodo}</span>
      <ul className="medidor-detalhes">{m.detalhes.map((d) => <li key={d}>{d}</li>)}</ul>
      <div className="medidor-rodape">
        <span>{quandoMedido(m)}</span>
        <a href={m.link.href} target="_blank" rel="noopener noreferrer">{m.link.rotulo} <Icone nome="externo" tamanho={13} /></a>
      </div>
    </section>
  );
}
