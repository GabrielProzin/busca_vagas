import { PERFIL } from "./gerado/perfil";

// Preferências da busca (tela Preferências). O padrão vem do config/preferencias.yaml; o que a pessoa salva fica
// na tabela "preferencias" e o coletor aplica por cima do YAML (coletor/preferencias.py). Ver docs/spec.md.

export type Nivel = "estagio" | "junior" | "pleno" | "senior";

export type Preferencias = {
  modalidades: { remoto: boolean; hibrido: boolean; presencial: boolean };
  cidades: string[];
  estado: string;
  regiao: string;
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
    aceita_ingles: y.aceitaIngles,
  };
}

const LIMITES = { cidades: 15, termos: 20, palavras: 30, texto: 60 } as const;

const linhas = (v: FormDataEntryValue | null, max: number): string[] =>
  [...new Set(String(v ?? "").split(/\r?\n|,/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))].slice(0, max + 1);

/** Valida no servidor o que veio da tela. Erro em português simples, ou as preferências prontas para salvar. */
export function lerFormulario(form: FormData): { erro: string } | { prefs: Preferencias } {
  const modalidades = {
    remoto: form.get("remoto") === "on",
    hibrido: form.get("hibrido") === "on",
    presencial: form.get("presencial") === "on",
  };
  if (!modalidades.remoto && !modalidades.hibrido && !modalidades.presencial) return { erro: "Escolha pelo menos uma forma de trabalho: remoto, híbrido ou presencial." };
  const cidades = linhas(form.get("cidades"), LIMITES.cidades);
  if (cidades.length > LIMITES.cidades) return { erro: `Use até ${LIMITES.cidades} cidades.` };
  if ((modalidades.hibrido || modalidades.presencial) && !cidades.length) return { erro: "Diga pelo menos uma cidade para híbrido ou presencial (ou desmarque os dois)." };
  const estado = String(form.get("estado") ?? "").toUpperCase();
  if (estado && !UFS.includes(estado)) return { erro: "Escolha um estado da lista." };
  const niveis = NIVEIS.map((n) => n.id).filter((n) => form.get(`nivel_${n}`) === "on");
  if (!niveis.length) return { erro: "Escolha pelo menos um nível." };
  const max = Number(form.get("max_anos"));
  if (!Number.isInteger(max) || max < 0 || max > 15) return { erro: "Os anos de experiência vão de 0 a 15." };
  const termos = linhas(form.get("termos_busca"), LIMITES.termos);
  if (!termos.length) return { erro: "Coloque pelo menos um cargo ou termo de busca." };
  if (termos.length > LIMITES.termos) return { erro: `Use até ${LIMITES.termos} termos de busca.` };
  const palavras = linhas(form.get("palavras_bloqueadas"), LIMITES.palavras);
  if (palavras.length > LIMITES.palavras) return { erro: `Use até ${LIMITES.palavras} palavras para evitar.` };
  const longo = [...cidades, ...termos, ...palavras].find((x) => x.length > LIMITES.texto);
  if (longo) return { erro: `“${longo.slice(0, 30)}…” passou de ${LIMITES.texto} caracteres.` };
  const regiao = String(form.get("regiao") ?? "").trim().slice(0, 40) || cidades[0] || "";
  return {
    prefs: { modalidades, cidades, estado, regiao, niveis, max_anos: max, termos_busca: termos, palavras_bloqueadas: palavras, aceita_ingles: form.get("aceita_ingles") === "on" },
  };
}

const sem = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** A vaga capturada pela extensão cabe nas preferências (forma de trabalho, cidade e nível)? */
export function capturaNoPerfil(p: Preferencias, x: { modalidade: string | null; cidade: string | null; nivel: string }): boolean {
  if (x.modalidade === "remoto") return p.modalidades.remoto;
  if (x.modalidade === "hibrido" && !p.modalidades.hibrido) return false;
  if (x.modalidade === "presencial" && !p.modalidades.presencial) return false;
  if (x.cidade && !p.cidades.some((c) => sem(c) === sem(x.cidade!))) return false;
  if ((NIVEIS.map((n) => n.id) as string[]).includes(x.nivel) && !p.niveis.includes(x.nivel as Nivel)) return false;
  return true;
}

/** "remotas ou em Goiânia", "só remotas", "em Goiânia" (subtítulo da lista de vagas). */
export function textoLocal(p: Preferencias): string {
  const local = p.modalidades.hibrido || p.modalidades.presencial ? p.regiao || p.cidades[0] || "" : "";
  if (p.modalidades.remoto && local) return `remotas ou em ${local}`;
  if (p.modalidades.remoto) return "só remotas";
  return local ? `em ${local}` : "";
}
