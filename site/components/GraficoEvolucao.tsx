// Linha da evolução das notas no tempo (CV hoje; LinkedIn quando existir). SVG desenhado no servidor,
// com uma tabela escondida para leitores de tela. Eixo y fixo de 0 a 100 para as séries serem comparáveis.

export type Serie = { nome: string; classe: string; pontos: { quando: string; nota: number; titulo?: string }[] };

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });
const dia = (iso: string) => fmt.format(new Date(iso)).replace(".", "");

export default function GraficoEvolucao({ series, altura = 200 }: { series: Serie[]; altura?: number }) {
  const L = 640, A = altura, mx = 34, my = 18;
  const todos = series.flatMap((s) => s.pontos.map((p) => new Date(p.quando).getTime()));
  if (!todos.length) return null;
  const t0 = Math.min(...todos), t1 = Math.max(...todos);
  const x = (iso: string) => (t1 === t0 ? L / 2 : mx + ((new Date(iso).getTime() - t0) / (t1 - t0)) * (L - mx * 2));
  const y = (n: number) => my + (1 - n / 100) * (A - my * 2 - 14);
  const base = A - 14;
  return (
    <figure className="grafico-evolucao">
      {series.length > 1 ? (
        <figcaption className="grafico-legenda">
          {series.map((s) => <span key={s.nome}><i className={`ponto-serie ${s.classe}`} />{s.nome}</span>)}
        </figcaption>
      ) : null}
      <svg viewBox={`0 0 ${L} ${A}`} aria-hidden className="grafico-svg">
        {[0, 50, 100].map((g) => (
          <g key={g}>
            <line x1={mx} x2={L - 8} y1={y(g)} y2={y(g)} className="grafico-grade" />
            <text x={mx - 8} y={y(g)} textAnchor="end" dominantBaseline="central" className="grafico-eixo">{g}</text>
          </g>
        ))}
        {series.map((s) => {
          const pts = [...s.pontos].sort((a, b) => a.quando.localeCompare(b.quando));
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.quando).toFixed(1)},${y(p.nota).toFixed(1)}`).join(" ");
          const ult = pts[pts.length - 1];
          return (
            <g key={s.nome} className={`serie ${s.classe}`}>
              <path d={d} className="serie-linha" />
              {pts.map((p, i) => (
                <circle key={i} cx={x(p.quando)} cy={y(p.nota)} r={i === pts.length - 1 ? 5 : 3.5} className="serie-ponto">
                  <title>{`${p.titulo ?? s.nome}: ${p.nota} (${dia(p.quando)})`}</title>
                </circle>
              ))}
              <text x={Math.min(x(ult.quando), L - 14)} y={y(ult.nota) - 12} textAnchor="middle" className="serie-valor">{ult.nota}</text>
            </g>
          );
        })}
        <text x={mx} y={base + 12} className="grafico-eixo">{dia(new Date(t0).toISOString())}</text>
        {t1 !== t0 ? <text x={L - 8} y={base + 12} textAnchor="end" className="grafico-eixo">{dia(new Date(t1).toISOString())}</text> : null}
      </svg>
      <table className="sr-only">
        <caption>Evolução das notas</caption>
        <thead><tr><th>Série</th><th>Data</th><th>Nota</th></tr></thead>
        <tbody>
          {series.flatMap((s) => s.pontos.map((p, i) => <tr key={`${s.nome}${i}`}><td>{s.nome}</td><td>{dia(p.quando)}</td><td>{p.nota}</td></tr>))}
        </tbody>
      </table>
    </figure>
  );
}
