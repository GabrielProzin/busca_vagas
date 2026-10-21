"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { mudarStatus, salvarCandidatura } from "@/lib/db";
import { COOKIE_SESSAO, DURACAO_S, criarSessao, senhaCorreta, sessaoValida } from "@/lib/sessao";
import type { Status } from "@/lib/tipos";

const STATUS_VALIDOS: Status[] = ["nova", "descartada", "aplicada", "enviada", "respondeu", "entrevista", "recusada", "proposta"];

// Server Functions são endpoints públicos: cada uma confere a sessão por conta própria.
async function exigirSessao() {
  if (!(await sessaoValida((await cookies()).get(COOKIE_SESSAO)?.value))) redirect("/login");
}

export async function entrar(_: { erro: string } | null, form: FormData) {
  const senha = String(form.get("senha") ?? "");
  // Pausa curta em toda tentativa: deixa adivinhação por força bruta lenta.
  await new Promise((r) => setTimeout(r, 600));
  if (!(await senhaCorreta(senha))) return { erro: "Senha incorreta." };
  (await cookies()).set(COOKIE_SESSAO, await criarSessao(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", maxAge: DURACAO_S, path: "/",
  });
  redirect("/");
}

export async function sair() {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect("/login");
}

export async function alterarStatus(form: FormData) {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  const status = String(form.get("status") ?? "") as Status;
  if (!id || !STATUS_VALIDOS.includes(status)) return;
  await mudarStatus(id, status);
  revalidatePath("/", "layout");
}

export async function salvarNotas(form: FormData) {
  await exigirSessao();
  const id = String(form.get("id") ?? "");
  if (!id) return;
  await salvarCandidatura(id, { notas: String(form.get("notas") ?? "").slice(0, 4000) });
  revalidatePath("/", "layout");
}
