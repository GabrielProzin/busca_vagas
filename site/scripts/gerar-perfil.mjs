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
};

mkdirSync(join(aqui, "..", "lib", "gerado"), { recursive: true });
writeFileSync(
  join(aqui, "..", "lib", "gerado", "perfil.ts"),
  `// Gerado por scripts/gerar-perfil.mjs a partir de perfil/. Não edite à mão.\n` +
    `export const PERFIL = ${JSON.stringify(dados, null, 2)} as const;\n`,
);
console.log("perfil gerado:", perfil.nome, `(${perfil.destaques.length} destaques)`);
