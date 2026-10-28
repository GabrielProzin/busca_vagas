import type { AnaliseCV, AnaliseEstudar, CriterioCV } from "./tipos";

// Regras do Perfil profissional que dependem só dos dados (docs/spec.md, "Análise de CV").

export const NIVEIS = ["estagio", "junior", "pleno", "senior"] as const;

/** Análise anterior do mesmo tipo (para a variação). A lista vem da mais nova para a mais antiga. */
export function anterior(lista: AnaliseCV[], a: AnaliseCV): AnaliseCV | null {
  const i = lista.findIndex((x) => x.id === a.id);
  return lista.slice(i + 1).find((x) => x.tipo === a.tipo) ?? null;
}

export function variacao(lista: AnaliseCV[], a: AnaliseCV): number | null {
  const ant = anterior(lista, a);
  return ant ? a.nota - ant.nota : null;
}

export function maisFraco(criterios: CriterioCV[]): CriterioCV | null {
  const com = criterios.filter((c) => c.nota !== null);
  return com.length ? com.reduce((m, c) => ((c.nota as number) < (m.nota as number) ? c : m)) : null;
}

export type Passo = { titulo: string; texto: string; href: string; botao: string };

function passoCV(a: AnaliseCV): Passo | null {
  const fraco = maisFraco(a.dados.criterios);
  if (!fraco) return null;
  // As melhorias da IA falam da escrita; nos outros critérios, o motivo calculado já diz o que fazer.
  const melhoria = fraco.chave === "escrita" ? a.dados.melhorias[0] : undefined;
  const titulos: Record<string, string> = {
    mercado: "Mostre no CV as habilidades que as vagas pedem",
    resultados: "Coloque números nos resultados do seu CV",
    estrutura: "Ajuste a estrutura do seu CV",
    escrita: "Deixe a escrita do seu CV mais direta",
  };
  return {
    titulo: titulos[fraco.chave] ?? `Melhore “${fraco.rotulo.toLowerCase()}” no seu CV`,
    texto: melhoria ? melhoria.sugestao : fraco.chave === "mercado" ? `${fraco.motivo} Inclua as que você já usa de verdade.` : fraco.motivo,
    href: `/perfil/cv/${a.id}`,
    botao: "Ver a análise",
  };
}

function passoEstudo(e: AnaliseEstudar | null): Passo | null {
  const h = (e?.habilidades ?? []).filter((x) => !x.tenho && x.vagas > 0).sort((x, y) => y.destravaria * 3 + y.vagas - (x.destravaria * 3 + x.vagas))[0];
  if (!h) return null;
  return {
    titulo: `Estude ${h.nome}`,
    texto: `Pedida em ${Math.round(h.pct)}% das vagas do seu nível${h.destravaria ? ` e é a única coisa que falta em ${h.destravaria === 1 ? "uma delas" : `${h.destravaria} delas`}` : ""}.`,
    href: "/estudar",
    botao: "Ver o que estudar",
  };
}

/** Próximo passo: melhorar o critério mais fraco do CV; com o CV em 85 ou mais, estudar o que destrava vagas. */
export function proximosPassos(geral: AnaliseCV | null, estudar: AnaliseEstudar | null): Passo[] {
  if (!geral) {
    const primeiro: Passo = { titulo: "Faça a primeira análise do seu CV", texto: "Ela dá a nota do currículo, o seu nível de mercado e o que melhorar primeiro.", href: "/perfil/cv", botao: "Analisar agora" };
    return [primeiro, passoEstudo(estudar)].filter(Boolean) as Passo[];
  }
  const cv = passoCV(geral);
  const estudo = passoEstudo(estudar);
  const ordem = geral.nota >= 85 ? [estudo, cv] : [cv, estudo];
  return ordem.filter(Boolean) as Passo[];
}
