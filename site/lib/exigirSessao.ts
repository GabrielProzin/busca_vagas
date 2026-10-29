import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, sessaoValida } from "./sessao";

// Server Functions são endpoints públicos: cada uma confere a sessão por conta própria.
export async function exigirSessao(): Promise<void> {
  if (!(await sessaoValida((await cookies()).get(COOKIE_SESSAO)?.value))) redirect("/login");
}
