// Nomes das variáveis do Supabase: o setup manual usa SUPABASE_SERVICE_ROLE_KEY; a integração da Vercel
// (botão de instalação) cria SUPABASE_SECRET_KEY. Os dois funcionam.
export function supabaseUrl(): string {
  return (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
}
export function supabaseChave(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY ?? "").trim();
}
/** Conexão com o Postgres (só existe com a integração da Vercel): permite criar as tabelas sozinho. O pooler
 *  (POSTGRES_URL) vem antes: a conexão direta do Supabase é só IPv6, que a Vercel não alcança. */
export function postgresUrl(): string {
  return (process.env.POSTGRES_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? "").trim();
}
/** Endereço público do site (para links nos emails e no GitHub). */
export function urlDoSite(): string {
  const v = process.env.SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? "";
  return v ? (v.startsWith("http") ? v : `https://${v}`) : "";
}
