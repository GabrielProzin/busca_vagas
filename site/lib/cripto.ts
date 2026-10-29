import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { supabaseChave } from "./ambiente";

// Segredos guardados no banco (chave do Gemini, senha de app do Gmail, token do GitHub) vão cifrados com AES-256-GCM.
// A chave sai da chave secreta do Supabase (que só o servidor tem): quem lê o banco sem ela não lê os segredos.

function chave(): Buffer {
  const base = supabaseChave();
  if (!base) throw new Error("Chave do Supabase ausente: não há como cifrar os segredos");
  return Buffer.from(hkdfSync("sha256", base, "busca_vagas", "segredos-v1", 32));
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

export function decifrar(guardado: string): string | null {
  try {
    const [v, iv, tag, dados] = guardado.split(":");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(dados, "base64")), d.final()]).toString("utf8");
  } catch {
    return null; // chave do Supabase trocou ou valor corrompido: refaça o passo no assistente
  }
}

/** Texto aleatório para tokens gerados pelo próprio site (extensão do Chrome, senha do backup). */
export function aleatorio(bytes = 24): string {
  return randomBytes(bytes).toString("base64url");
}
