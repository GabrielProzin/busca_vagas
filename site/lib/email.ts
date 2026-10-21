import "server-only";
import nodemailer from "nodemailer";

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
  if (process.env.DEMO_ARQUIVO) return "demo"; // modo demo nunca envia de verdade
  const usuario = process.env.GMAIL_USER;
  const senha = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, ""); // a senha de app vem com espaços
  if (!usuario || !senha) throw new Error("GMAIL_USER e GMAIL_APP_PASSWORD não configurados na Vercel.");
  const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: usuario, pass: senha } });
  const info = await t.sendMail({
    from: { name: "Gabriel Mendes", address: usuario },
    to: m.para,
    subject: m.assunto,
    text: m.corpo,
    attachments: m.anexo ? [{ filename: m.nomeAnexo ?? "curriculo.pdf", content: m.anexo, contentType: "application/pdf" }] : [],
    ...(m.emResposta ? { inReplyTo: m.emResposta, references: [m.emResposta] } : {}),
  });
  return info.messageId;
}
