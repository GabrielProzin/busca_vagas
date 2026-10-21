import type { Vaga } from "@/lib/tipos";

// Os mesmos pesos do coletor (coletor/ranking.py): 45% semântica, 40% habilidades, 15% trilha.
const PARTES = [
  { chave: "semantica", rotulo: "Texto parecido com o seu currículo", peso: 45 },
  { chave: "habilidades", rotulo: "Habilidades que você tem", peso: 40 },
  { chave: "trilha", rotulo: "Tipo de cargo", peso: 15 },
] as const;

export default function Nota({ vaga, grande = false }: { vaga: Vaga; grande?: boolean }) {
  const c = vaga.componentes ?? {};
  // Vaga capturada (post colado/extensão): a nota vem inteira da avaliação da IA, sem componentes.
  if (c.ia !== undefined) {
    return (
      <div className={`nota ${vaga.lista ?? ""} ${grande ? "nota-grande" : ""}`}>
        <div className="nota-numero">
          {Math.round(vaga.nota ?? 0)}
          <small>/100</small>
        </div>
        <div className="barra" role="img" aria-label={`Avaliação da IA: ${Math.round(vaga.nota ?? 0)} de 100`}>
          <span style={{ flex: 1 }}><i style={{ width: `${Math.round(c.ia * 100)}%` }} /></span>
        </div>
        <div className="legenda">avaliada pela IA</div>
      </div>
    );
  }
  const resumo = PARTES.map((p) => `${p.rotulo}: ${Math.round((c[p.chave] ?? 0) * p.peso)} de ${p.peso}`).join("; ");
  return (
    <div className={`nota ${vaga.lista ?? ""} ${grande ? "nota-grande" : ""}`}>
      <div className="nota-numero">
        {Math.round(vaga.nota ?? 0)}
        <small>/100</small>
      </div>
      {/* Cada trecho tem a largura do peso; o preenchimento é o quanto a vaga pontuou nele. */}
      <div className="barra" role="img" aria-label={resumo} title={resumo}>
        {PARTES.map((p) => (
          <span key={p.chave} style={{ flex: p.peso }}>
            <i style={{ width: `${Math.round((c[p.chave] ?? 0) * 100)}%` }} />
          </span>
        ))}
      </div>
      {grande ? (
        <div className="composicao">
          {PARTES.map((p, i) => (
            <Linha key={p.chave} cor={`var(--seg-${i + 1})`} rotulo={p.rotulo} pontos={Math.round((c[p.chave] ?? 0) * p.peso)} peso={p.peso} />
          ))}
          {vaga.nivel === "junior" ? <Linha cor="var(--ink)" rotulo="Bônus: vaga júnior" pontos={5} peso={5} /> : null}
        </div>
      ) : vaga.nivel === "junior" ? (
        <div className="legenda">júnior</div>
      ) : null}
    </div>
  );
}

function Linha({ cor, rotulo, pontos, peso }: { cor: string; rotulo: string; pontos: number; peso: number }) {
  return (
    <>
      <span className="ponto" style={{ background: cor }} />
      <span>{rotulo}</span>
      <b>
        {pontos}/{peso}
      </b>
    </>
  );
}
