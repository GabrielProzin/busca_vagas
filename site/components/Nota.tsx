import type { Vaga } from "@/lib/tipos";

// Os mesmos pesos do coletor (coletor/ranking.py): 45% semântica, 40% habilidades, 15% trilha.
const PARTES = [
  { chave: "semantica", rotulo: "Texto parecido com o seu currículo", peso: 45 },
  { chave: "habilidades", rotulo: "Habilidades que você tem", peso: 40 },
  { chave: "trilha", rotulo: "Tipo de cargo", peso: 15 },
] as const;

export default function Nota({ vaga, grande = false }: { vaga: Vaga; grande?: boolean }) {
  const c = vaga.componentes ?? {};
  const nota = Math.round(vaga.nota ?? 0);
  const ia = c.ia !== undefined;
  const resumo = ia
    ? `Avaliação da IA: ${nota} de 100`
    : PARTES.map((p) => `${p.rotulo}: ${Math.round((c[p.chave] ?? 0) * p.peso)} de ${p.peso}`).join("; ");

  return (
    <div className={`nota-celula ${vaga.lista ?? ""} ${grande ? "nota-grande" : ""}`}>
      <div className="nota-numero">
        {nota}
        {grande ? <small>/100</small> : null}
      </div>
      {/* Cada trecho tem a largura do peso; o preenchimento é o quanto a vaga pontuou nele. */}
      <div className="barra" role="img" aria-label={resumo} title={resumo}>
        {ia ? (
          <span style={{ flex: 1 }}><i style={{ width: `${Math.round((c.ia ?? 0) * 100)}%` }} /></span>
        ) : (
          PARTES.map((p) => (
            <span key={p.chave} style={{ flex: p.peso }}>
              <i style={{ width: `${Math.round((c[p.chave] ?? 0) * 100)}%` }} />
            </span>
          ))
        )}
      </div>
      {grande && !ia ? (
        <div className="composicao">
          {PARTES.map((p, i) => (
            <Linha key={p.chave} cor={`var(--seg-${i + 1})`} rotulo={p.rotulo} pontos={Math.round((c[p.chave] ?? 0) * p.peso)} peso={p.peso} />
          ))}
          {vaga.nivel === "junior" ? <Linha cor="var(--ink)" rotulo="Bônus: vaga júnior" pontos={5} peso={5} /> : null}
          {c.historico !== undefined && Math.round(c.historico) !== 0 ? (
            <>
              <span className="ponto" style={{ background: c.historico > 0 ? "var(--ok)" : "var(--warm)" }} />
              <span>{c.historico > 0 ? "Parece com as que você aplicou" : "Parece com as que você descartou"}</span>
              <b>{c.historico > 0 ? "+" : "−"}{Math.abs(Math.round(c.historico))}</b>
            </>
          ) : null}
        </div>
      ) : null}
      {grande && ia ? <p className="dica" style={{ marginTop: 10 }}>Nota dada pela IA ao ler o post contra o seu currículo.</p> : null}
    </div>
  );
}

function Linha({ cor, rotulo, pontos, peso }: { cor: string; rotulo: string; pontos: number; peso: number }) {
  return (
    <>
      <span className="ponto" style={{ background: cor }} />
      <span>{rotulo}</span>
      <b>{pontos}/{peso}</b>
    </>
  );
}
