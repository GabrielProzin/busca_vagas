// Sessão de um único usuário: cookie "exp.assinatura" assinado com HMAC-SHA256.
// Usa só Web Crypto, então roda tanto no proxy quanto nas rotas do servidor.

export const COOKIE_SESSAO = "bv_sessao";
export const DURACAO_S = 60 * 60 * 24 * 30; // 30 dias

const enc = new TextEncoder();

function base64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function chave(): Promise<CryptoKey> {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres)");
  return crypto.subtle.importKey("raw", enc.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function assinar(valor: string): Promise<string> {
  return base64url(await crypto.subtle.sign("HMAC", await chave(), enc.encode(valor)));
}

/** Comparação em tempo constante para strings do mesmo tamanho. */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function criarSessao(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + DURACAO_S;
  return `${exp}.${await assinar(`sessao:${exp}`)}`;
}

export async function sessaoValida(valor: string | undefined): Promise<boolean> {
  if (!valor) return false;
  const [expStr, assinatura] = valor.split(".");
  const exp = Number(expStr);
  if (!exp || !assinatura || exp < Date.now() / 1000) return false;
  try {
    return iguais(assinatura, await assinar(`sessao:${exp}`));
  } catch {
    return false;
  }
}

/** Compara a senha digitada com SITE_PASSWORD sem vazar tempo pelo tamanho. */
export async function senhaCorreta(digitada: string): Promise<boolean> {
  const certa = process.env.SITE_PASSWORD;
  if (!certa) return false;
  const [a, b] = await Promise.all([assinar(`senha:${digitada}`), assinar(`senha:${certa}`)]);
  return iguais(a, b);
}
