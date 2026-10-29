// Copia o perfil do candidato (../perfil) para dentro do site antes do build.
// Assim o currículo tem uma fonte só: a mesma que o coletor em Python usa no ranking.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, "..", "..");
const perfil = parse(readFileSync(join(raiz, "perfil", "perfil.yaml"), "utf-8"));
const curriculo = readFileSync(join(raiz, "perfil", "curriculo.md"), "utf-8");
const preferencias = parse(readFileSync(join(raiz, "config", "preferencias.yaml"), "utf-8"));

// Cidades do YAML ("Goiânia") no formato da tela Preferências ("Goiânia - GO"), com o nome oficial do IBGE.
const municipios = JSON.parse(readFileSync(join(aqui, "..", "lib", "dados", "municipios.json"), "utf-8"));
const chave = (s) => String(s).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function comEstado(cidade, estado) {
  if (/ - [A-Z]{2}$/.test(cidade)) return cidade;
  const uf = String(estado ?? "").toUpperCase();
  const achar = (u) => (municipios[u] ?? []).find((n) => chave(n) === chave(cidade));
  if (achar(uf)) return `${achar(uf)} - ${uf}`;
  const outros = Object.keys(municipios).filter((u) => achar(u));
  return outros.length === 1 ? `${achar(outros[0])} - ${outros[0]}` : cidade;
}

const dados = {
  nome: perfil.nome,
  nomeCurto: perfil.nome_curto ?? perfil.nome,
  cargo: perfil.cargo ?? "",
  experienciaResumo: perfil.experiencia_resumo ?? "o que venho fazendo na área",
  regiao: preferencias?.localizacao?.rotulo ?? "",
  area: preferencias?.area_rotulo ?? "",
  titulo: perfil.titulo,
  cidade: perfil.cidade,
  links: perfil.links,
  destaques: perfil.destaques,
  habilidades: Object.keys(perfil.habilidades),
  curriculo,
  // Nota mínima das vagas que entram no email de resumo (o painel mostra quantas chegaram).
  resumoNotaMinima: Number(preferencias?.resumo?.nota_minima ?? 85),
  // Para a captura em lote descartar vaga presencial/híbrida fora daqui (mesma regra do coletor).
  cidadesAceitas: (preferencias?.localizacao?.cidades_presencial_hibrido ?? []).map((c) => comEstado(c, preferencias?.localizacao?.estado)),
  // Padrão da tela Preferências (o que vale enquanto a pessoa não salvar nada lá).
  preferenciasYaml: {
    remoto: preferencias?.localizacao?.aceita_remoto ?? true,
    hibrido: preferencias?.localizacao?.aceita_hibrido ?? true,
    presencial: preferencias?.localizacao?.aceita_presencial ?? true,
    estado: String(preferencias?.localizacao?.estado ?? "").toUpperCase(),
    aceitaIngles: Boolean(preferencias?.localizacao?.aceita_vagas_em_ingles),
    senioridadeBloqueada: preferencias?.senioridade_bloqueada ?? [],
    maxAnos: Number(preferencias?.max_anos_experiencia ?? 2),
    termosBusca: preferencias?.termos_busca ?? [],
    contratoClt: preferencias?.contrato?.clt ?? true,
    contratoPj: preferencias?.contrato?.pj ?? true,
  },
  notaMinimaPosts: Number(preferencias?.linkedin_posts?.nota_minima ?? 40),
  // Envio em lote (a fila é enviada pelo GitHub Actions: coletor/envio.py lê os mesmos valores).
  envio: {
    limiteDiario: Number(preferencias?.envio?.limite_diario ?? 40),
    porRodada: Number(preferencias?.envio?.max_por_execucao ?? 10),
    intervalo: preferencias?.envio?.intervalo_segundos ?? [60, 120],
    horario: preferencias?.envio?.horario ?? [7, 21],
    automatico: Boolean(preferencias?.envio?.automatico?.ligado),
    automaticoNota: Number(preferencias?.envio?.automatico?.nota_minima ?? 90),
  },
  // Catálogo de habilidades (regex sobre texto minúsculo e sem acento), o mesmo do coletor (O que estudar).
  // Usado na Análise de CV para conferir quais habilidades pedidas pelo mercado aparecem no texto.
  catalogoHabilidades: preferencias?.catalogo_habilidades ?? {},
  dominiosExcluidos: (preferencias?.dominios_email_excluidos ?? []).map((d) => String(d).toLowerCase().replace(/^@/, "")),
};

mkdirSync(join(aqui, "..", "lib", "gerado"), { recursive: true });
writeFileSync(
  join(aqui, "..", "lib", "gerado", "perfil.ts"),
  `// Gerado por scripts/gerar-perfil.mjs a partir de perfil/. Não edite à mão.\n` +
    `export const PERFIL = ${JSON.stringify(dados, null, 2)} as const;\n`,
);
// O SQL do banco vai junto: o assistente de instalação cria as tabelas sozinho (quando há conexão direta).
writeFileSync(
  join(aqui, "..", "lib", "gerado", "schema.ts"),
  `// Gerado por scripts/gerar-perfil.mjs a partir de supabase/schema.sql. Não edite à mão.\n` +
    `export const SCHEMA_SQL = ${JSON.stringify(readFileSync(join(raiz, "supabase", "schema.sql"), "utf-8"))};\n`,
);
// Versão do código: o commit do repositório de origem desta cópia (escrito pelo workflow "Atualizar").
let versao = "";
try { versao = readFileSync(join(raiz, ".versao"), "utf-8").trim(); } catch {}
writeFileSync(
  join(aqui, "..", "lib", "gerado", "versao.ts"),
  `// Gerado por scripts/gerar-perfil.mjs a partir de .versao. Não edite à mão.\nexport const VERSAO = ${JSON.stringify(versao)};\n`,
);
console.log("perfil gerado:", perfil.nome, `(${perfil.destaques.length} destaques)`);
