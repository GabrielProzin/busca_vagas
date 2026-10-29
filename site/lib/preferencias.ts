import { PERFIL } from "./gerado/perfil";
import { cidadeAceita, separarCidade } from "./cidades";

// Preferências da busca (tela Preferências). O padrão vem do config/preferencias.yaml; o que a pessoa salva fica
// na tabela "preferencias" e o coletor aplica por cima do YAML (coletor/preferencias.py). Ver docs/spec.md.

export type Nivel = "estagio" | "junior" | "pleno" | "senior";

export type Preferencias = {
  modalidades: { remoto: boolean; hibrido: boolean; presencial: boolean };
  /** "Goiânia - GO": nome oficial do IBGE e estado. */
  cidades: string[];
  /** Estado e nome da região: tirados da primeira cidade (o coletor usa para saber o que é "de fora"). */
  estado: string;
  regiao: string;
  contratos: { clt: boolean; pj: boolean };
  empresas_bloqueadas: string[];
  niveis: Nivel[];
  max_anos: number;
  termos_busca: string[];
  palavras_bloqueadas: string[];
  aceita_ingles: boolean;
};

export const NIVEIS: { id: Nivel; rotulo: string }[] = [
  { id: "estagio", rotulo: "Estágio" },
  { id: "junior", rotulo: "Júnior" },
  { id: "pleno", rotulo: "Pleno" },
  { id: "senior", rotulo: "Sênior" },
];

// Os mesmos termos de coletor/preferencias.py: um nível conta como aceito no YAML se os termos dele não estão todos bloqueados.
const TERMOS_NIVEL: Record<Nivel, string[]> = {
  estagio: ["estagi", "intern\\b", "trainee", "aprendiz"],
  junior: ["junior", "júnior", "\\bjr\\.?\\b"],
  pleno: ["pleno", "\\bpl\\b", "mid[- ]?level", "\\bii\\b"],
  senior: ["senior", "sênior", "\\bsr\\.?\\b", "especialista", "specialist", "expert", "\\biii\\b"],
};

export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/** O que vale enquanto nada foi salvo na tela: o config/preferencias.yaml. */
export function preferenciasPadrao(): Preferencias {
  const y = PERFIL.preferenciasYaml;
  const bloq = new Set<string>(y.senioridadeBloqueada as readonly string[]);
  return {
    modalidades: { remoto: y.remoto, hibrido: y.hibrido, presencial: y.presencial },
    cidades: [...(PERFIL.cidadesAceitas as readonly string[])],
    estado: y.estado,
    regiao: PERFIL.regiao,
    niveis: NIVEIS.map((n) => n.id).filter((n) => !TERMOS_NIVEL[n].every((t) => bloq.has(t))),
    max_anos: y.maxAnos,
    termos_busca: [...(y.termosBusca as readonly string[])],
    palavras_bloqueadas: [],
    contratos: { clt: y.contratoClt, pj: y.contratoPj },
    empresas_bloqueadas: [],
    aceita_ingles: y.aceitaIngles,
  };
}

export const LIMITES = { cidades: 15, termos: 20, palavras: 30, empresas: 30, texto: 60 } as const;

/** Sugestões de cargos na tela (a pessoa pode digitar qualquer outro). */
export const SUGESTOES_CARGOS = [
  "analista de dados", "analista de bi", "business intelligence", "engenheiro de dados", "analytics engineer",
  "cientista de dados", "data analyst", "data engineer", "data scientist", "power bi", "analista de sistemas de dados",
  "engenheiro de machine learning",
];

const lista = (form: FormData, campo: string): string[] => {
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const v of form.getAll(campo)) {
    const x = String(v).trim().replace(/\s+/g, " ");
    const k = x.toLowerCase();
    if (x && !vistos.has(k)) { vistos.add(k); r.push(x); }
  }
  return r;
};

/** Valida no servidor o que veio da tela. Erro em português simples, ou as preferências prontas para salvar.
 *  `oficial` confere a cidade na lista do IBGE (lib/municipios.ts, só no servidor). */
export function lerFormulario(form: FormData, oficial: (cidade: string) => string | null): { erro: string } | { prefs: Preferencias } {
  const modalidades = {
    remoto: form.get("remoto") === "on",
    hibrido: form.get("hibrido") === "on",
    presencial: form.get("presencial") === "on",
  };
  if (!modalidades.remoto && !modalidades.hibrido && !modalidades.presencial) return { erro: "Escolha pelo menos uma forma de trabalho: remoto, híbrido ou presencial." };
  const brutas = lista(form, "cidade");
  if (brutas.length > LIMITES.cidades) return { erro: `Use até ${LIMITES.cidades} cidades.` };
  const cidades: string[] = [];
  for (const c of brutas) {
    const o = oficial(c);
    if (!o) return { erro: `Não achei “${c.slice(0, 40)}” na lista de cidades. Escolha pela busca.` };
    if (!cidades.includes(o)) cidades.push(o);
  }
  if ((modalidades.hibrido || modalidades.presencial) && !cidades.length) return { erro: "Escolha pelo menos uma cidade para híbrido ou presencial (ou desmarque os dois)." };
  const niveis = NIVEIS.map((n) => n.id).filter((n) => form.get(`nivel_${n}`) === "on");
  if (!niveis.length) return { erro: "Escolha pelo menos um nível." };
  const max = Number(form.get("max_anos"));
  if (!Number.isInteger(max) || max < 0 || max > 15) return { erro: "Os anos de experiência vão de 0 a 15." };
  const contratos = { clt: form.get("clt") === "on", pj: form.get("pj") === "on" };
  if (!contratos.clt && !contratos.pj) return { erro: "Aceite pelo menos um tipo de contrato: CLT ou PJ." };
  const termos = lista(form, "termo");
  if (!termos.length) return { erro: "Coloque pelo menos um cargo para buscar." };
  if (termos.length > LIMITES.termos) return { erro: `Use até ${LIMITES.termos} cargos.` };
  const palavras = lista(form, "palavra");
  if (palavras.length > LIMITES.palavras) return { erro: `Use até ${LIMITES.palavras} palavras para evitar.` };
  const empresas = lista(form, "empresa");
  if (empresas.length > LIMITES.empresas) return { erro: `Use até ${LIMITES.empresas} empresas para evitar.` };
  const longo = [...termos, ...palavras, ...empresas].find((x) => x.length > LIMITES.texto);
  if (longo) return { erro: `“${longo.slice(0, 30)}…” passou de ${LIMITES.texto} caracteres.` };
  const primeira = cidades[0] ?? "";
  return {
    prefs: {
      modalidades, cidades, estado: primeira.slice(-2), regiao: primeira.replace(/ - [A-Z]{2}$/, ""), niveis, max_anos: max,
      termos_busca: termos, palavras_bloqueadas: palavras, contratos, empresas_bloqueadas: empresas,
      aceita_ingles: form.get("aceita_ingles") === "on",
    },
  };
}

/** A vaga capturada pela extensão cabe nas preferências (forma de trabalho, cidade e nível)? */
export function capturaNoPerfil(p: Preferencias, x: { modalidade: string | null; cidade: string | null; nivel: string }): boolean {
  if (x.modalidade === "remoto") return p.modalidades.remoto;
  if (x.modalidade === "hibrido" && !p.modalidades.hibrido) return false;
  if (x.modalidade === "presencial" && !p.modalidades.presencial) return false;
  if (x.cidade && separarCidade(x.cidade).nome && !cidadeAceita(p.cidades, x.cidade)) return false;
  if ((NIVEIS.map((n) => n.id) as string[]).includes(x.nivel) && !p.niveis.includes(x.nivel as Nivel)) return false;
  return true;
}

/** "remotas ou em Goiânia", "só remotas", "em Goiânia" (subtítulo da lista de vagas). */
export function textoLocal(p: Preferencias): string {
  const primeira = (p.cidades[0] ?? "").replace(/ - [A-Z]{2}$/, "");
  const local = p.modalidades.hibrido || p.modalidades.presencial ? p.regiao || primeira : "";
  if (p.modalidades.remoto && local) return `remotas ou em ${local}`;
  if (p.modalidades.remoto) return "só remotas";
  return local ? `em ${local}` : "";
}
