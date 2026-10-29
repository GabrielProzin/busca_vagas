import "server-only";
import { cache } from "react";
import { cifrar, decifrar } from "./cripto";
import { lerConfiguracao, gravarConfiguracao } from "./db";

// Chaves e senhas do site. Valem, nesta ordem: variável de ambiente da Vercel (setup manual) e o que o assistente
// de instalação guardou cifrado na tabela "configuracao". Ver docs/spec.md, "Instalação".

export const SEGREDOS = [
  "GEMINI_API_KEY",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "GITHUB_DISPATCH_TOKEN",
  "CAPTURA_TOKEN",
  "CONTATO_TELEFONE",
  "ALERTA_PARA",
  "BACKUP_SENHA",
] as const;
export type NomeSegredo = (typeof SEGREDOS)[number];

export const lerSegredos = cache(lerSegredosAgora);

/** Sem o cache da requisição: para ler de novo logo depois de salvar (assistente de instalação). */
export async function lerSegredosAgora(): Promise<Partial<Record<NomeSegredo, string>>> {
  const guardados = await lerConfiguracao().catch(() => ({}) as Record<string, string>);
  const r: Partial<Record<NomeSegredo, string>> = {};
  for (const nome of SEGREDOS) {
    const env = process.env[nome];
    if (env) r[nome] = env;
    else if (guardados[nome]) {
      const v = decifrar(guardados[nome]);
      if (v) r[nome] = v;
    }
  }
  return r;
}

export async function segredo(nome: NomeSegredo): Promise<string | undefined> {
  return (await lerSegredos())[nome];
}

/** De onde vem cada segredo (para a tela de instalação não oferecer trocar o que está fixo na Vercel). */
export function naVercel(nome: NomeSegredo): boolean {
  return Boolean(process.env[nome]);
}

/** Guarda (cifrado) ou apaga (null) segredos no banco. */
export async function salvarSegredos(valores: Partial<Record<NomeSegredo, string | null>>): Promise<void> {
  const linhas = Object.entries(valores).map(([chave, v]) => ({ chave, valor: v ? cifrar(v) : null }));
  await gravarConfiguracao(linhas);
}
