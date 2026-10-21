import { salvarResumo } from "@/lib/db";
import { ErroIA, iaConfigurada, resumirVaga, type ResumoVaga as Resumo } from "@/lib/ia";
import type { Vaga } from "@/lib/tipos";

// Componente de servidor: se a vaga ainda não tem resumo, pede para a IA e guarda no banco.
// A página aparece na hora; este bloco chega logo depois (fica dentro de um <Suspense>).
export default async function ResumoVaga({ vaga }: { vaga: Vaga }) {
  let resumo: Resumo | null = vaga.resumo ?? null;
  let erro: string | null = null;
  if (!resumo) {
    if (!iaConfigurada()) return null;
    if ((vaga.descricao ?? "").length < 120) return null; // pouco texto para resumir
    try {
      resumo = await resumirVaga(vaga);
      await salvarResumo(vaga.id, resumo);
    } catch (e) {
      erro = e instanceof ErroIA ? e.message : "Não consegui resumir a vaga agora.";
    }
  }
  if (!resumo) return erro ? <p className="dica resumo-erro">{erro}</p> : null;

  const condicoes = [resumo.contrato, resumo.salario, resumo.local].filter(Boolean) as string[];
  return (
    <section className="resumo" aria-label="Resumo da vaga">
      {resumo.frase ? <p className="resumo-frase">{resumo.frase}</p> : null}
      {resumo.atencao.length ? (
        <div className="resumo-atencao">
          <b>Atenção</b>
          <ul>{resumo.atencao.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      ) : null}
      <div className="resumo-grade">
        <Bloco titulo="Você vai" itens={resumo.atividades} />
        <Bloco titulo="Exige" itens={resumo.obrigatorios} />
        <Bloco titulo="Diferenciais" itens={resumo.diferenciais} />
        <Bloco titulo="Condições" itens={[...condicoes, ...resumo.beneficios]} />
      </div>
      <p className="dica">Resumo feito pela IA a partir da descrição. Confira os detalhes no texto completo.</p>
    </section>
  );
}

function Bloco({ titulo, itens }: { titulo: string; itens: string[] }) {
  if (!itens.length) return null;
  return (
    <div>
      <h3>{titulo}</h3>
      <ul>{itens.map((i) => <li key={i}>{i}</li>)}</ul>
    </div>
  );
}

export function ResumoCarregando() {
  return <section className="resumo carregando" aria-busy="true"><p className="dica">Resumindo a vaga…</p></section>;
}
