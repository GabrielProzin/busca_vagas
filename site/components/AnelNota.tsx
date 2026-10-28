// Nota de 0 a 100 num anel (Perfil profissional e Análise de CV). A cor segue a faixa da nota,
// e o número fica sempre escrito: a cor nunca é a única informação.

export function faixaNota(n: number | null): { classe: string; rotulo: string } {
  if (n === null) return { classe: "sem", rotulo: "Sem nota" };
  if (n >= 85) return { classe: "otimo", rotulo: "Excelente" };
  if (n >= 70) return { classe: "bom", rotulo: "Bom" };
  if (n >= 50) return { classe: "medio", rotulo: "Dá para melhorar" };
  return { classe: "baixo", rotulo: "Precisa de atenção" };
}

export default function AnelNota({ nota, tamanho = 112, legenda = true }: { nota: number | null; tamanho?: number; legenda?: boolean }) {
  const r = 42;
  const volta = 2 * Math.PI * r;
  const f = faixaNota(nota);
  const valor = nota === null ? 0 : Math.max(0, Math.min(100, nota));
  return (
    <div className={`anel-nota ${f.classe}`} style={{ width: tamanho }}>
      <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} role="img" aria-label={nota === null ? "Sem nota" : `Nota ${nota} de 100, ${f.rotulo.toLowerCase()}`}>
        <circle cx="50" cy="50" r={r} className="anel-fundo" />
        <circle cx="50" cy="50" r={r} className="anel-valor" strokeDasharray={`${(valor / 100) * volta} ${volta}`} transform="rotate(-90 50 50)" />
        <text x="50" y="50" textAnchor="middle" dominantBaseline="central" className="anel-numero">{nota ?? "–"}</text>
      </svg>
      {legenda ? <span className="anel-legenda">{f.rotulo}</span> : null}
    </div>
  );
}
