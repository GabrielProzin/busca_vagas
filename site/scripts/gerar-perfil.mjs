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
  cidadesAceitas: preferencias?.localizacao?.cidades_presencial_hibrido ?? [],
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
console.log("perfil gerado:", perfil.nome, `(${perfil.destaques.length} destaques)`);
