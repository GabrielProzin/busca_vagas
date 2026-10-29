// Cria ou completa as tabelas do banco a cada build na Vercel, quando a integração do Supabase deu a conexão
// (POSTGRES_URL). O SQL é o mesmo de supabase/schema.sql: só cria o que falta e nunca apaga nada.
// Sem a conexão (instalação manual) ou em caso de erro, só avisa: o build continua e o site mostra o que falta.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const url = (process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? "").trim();
if (!url || process.env.DEMO_ARQUIVO) {
  console.log("migrar: sem POSTGRES_URL, nada a fazer");
  process.exit(0);
}
const aqui = dirname(fileURLToPath(import.meta.url));
const sql = readFileSync(join(aqui, "..", "..", "supabase", "schema.sql"), "utf-8");
try {
  const { default: pg } = await import("pg");
  // O sslmode da URL faz o pg exigir certificado conferido; o do Supabase é de uma CA própria.
  const limpa = url.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, "");
  const cliente = new pg.Client({ connectionString: limpa, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
  await cliente.connect();
  try {
    await cliente.query(sql);
  } finally {
    await cliente.end();
  }
  console.log("migrar: tabelas conferidas");
} catch (e) {
  console.warn("migrar: não consegui atualizar o banco agora (o site avisa em Instalação):", e.message);
}
