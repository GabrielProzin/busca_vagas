import "server-only";

// Dispara workflows do GitHub Actions (coleta e envio da fila) com o GITHUB_DISPATCH_TOKEN.
// O repositório vem das variáveis de sistema da Vercel (projeto ligado ao GitHub); GITHUB_REPO sobrescreve.

export const REPO =
  process.env.GITHUB_REPO ??
  (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "");

/** null = disparado; texto = por que não deu. */
export async function dispararWorkflow(arquivo: "coleta.yml" | "envio.yml", inputs?: Record<string, string>): Promise<string | null> {
  if (process.env.DEMO_ARQUIVO) return null; // modo demo: finge que disparou
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  if (!token) return "GITHUB_DISPATCH_TOKEN não configurado na Vercel";
  if (!REPO) return "não sei qual é o repositório: defina GITHUB_REPO (dono/nome) na Vercel";
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${arquivo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main", ...(inputs ? { inputs } : {}) }),
      cache: "no-store",
    });
    return r.status === 204 ? null : `GitHub respondeu ${r.status}`;
  } catch (e) {
    return `erro ao chamar o GitHub: ${(e as Error).message}`;
  }
}
