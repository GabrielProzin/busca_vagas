import "server-only";
import nodemailer from "nodemailer";
import { PERFIL } from "./gerado/perfil";
import { contarUso } from "./db";

// Envio pelo Gmail do próprio usuário (SMTP + senha de app). Sai da conta dele
// e fica na pasta Enviados, como um email escrito à mão.

export function gmailConfigurado(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

type Mensagem = {
  para: string;
  assunto: string;
  corpo: string;
  anexo?: Buffer;
  nomeAnexo?: string;
  /** Message-ID do email anterior: a mensagem vai como resposta, na mesma conversa. */
  emResposta?: string | null;
};

export async function enviarEmail(m: Mensagem): Promise<string> {
  if (process.env.DEMO_ARQUIVO) {
    await contarUso("gmail:site");
    return "demo"; // modo demo nunca envia de verdade
  }
  const usuario = process.env.GMAIL_USER;
  const senha = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ""); // a senha de app vem com espaços
  if (!usuario || !senha) throw new Error("GMAIL_USER e GMAIL_APP_PASSWORD não configurados na Vercel.");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: usuario, pass: senha } });
  const info = await t.sendMail({
    from: { name: PERFIL.nomeCurto, address: usuario },
    to: m.para,
    subject: m.assunto,
    text: m.corpo,
    attachments: m.anexo ? [{ filename: m.nomeAnexo ?? "curriculo.pdf", content: m.anexo, contentType: "application/pdf" }] : [],
    ...(m.emResposta ? { inReplyTo: m.emResposta, references: [m.emResposta] } : {}),
  });
  await contarUso("gmail:site");
  return info.messageId;
}

/** Mensagem clara para os erros mais comuns do Gmail; o detalhe técnico vai para o log. */
export function erroGmail(e: unknown): string {
  const msg = String((e as Error)?.message ?? e);
  console.error("gmail:", msg);
  if (/535|Username and Password not accepted|Invalid login|BadCredentials/i.test(msg)) {
    return "O Gmail recusou o login. Confira GMAIL_USER e a senha de app (GMAIL_APP_PASSWORD) na Vercel.";
  }
  if (/5\.4\.5|Daily user sending limit|limit exceeded|421/i.test(msg)) return "O Gmail atingiu o limite de envios de hoje. Tente amanhã.";
  if (/5\.1\.1|does not exist|User unknown|NoSuchUser|550/i.test(msg)) return "O Gmail diz que esse endereço de destino não existe. Confira o email.";
  if (/ETIMEDOUT|ECONNRESET|ENOTFOUND|timeout/i.test(msg)) return "Não consegui falar com o Gmail agora. Tente de novo em instantes.";
  return "O Gmail recusou o envio. Tente de novo; se continuar, veja o log da Vercel.";
}
