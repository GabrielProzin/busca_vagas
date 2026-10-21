"use client";

import { useActionState, useEffect, useState } from "react";
import { enviarCandidatura, gerarRascunho, type EstadoEmail } from "@/app/acoes";

type Props = {
  vagaId: string;
  para: string;
  assunto: string;
  corpo: string;
  jaEnviada: boolean;
  /** O texto inicial é o modelo pronto (não salvo), não um rascunho seu. */
  preenchidoComModelo?: boolean;
  enviadaEm: string | null;
  iaPronta: boolean;
  gmailPronto: boolean;
  cvPronto: boolean;
};

export default function EmailCandidatura(p: Props) {
  const [para, setPara] = useState(p.para);
  const [assunto, setAssunto] = useState(p.assunto);
  const [corpo, setCorpo] = useState(p.corpo);
  const [gerado, gerar, gerando] = useActionState<EstadoEmail, FormData>(gerarRascunho, null);
  const [envio, enviar, enviando] = useActionState<EstadoEmail, FormData>(enviarCandidatura, null);
  const [tocado, setTocado] = useState(false); // depois de editar ou gerar, some o aviso de "modelo pronto"

  // Quando a IA devolve um rascunho, ele substitui o texto dos campos.
  useEffect(() => {
    if (gerado?.assunto) setAssunto(gerado.assunto);
    if (gerado?.corpo) setCorpo(gerado.corpo);
    if (gerado?.para) setPara(gerado.para);
    if (gerado) setTocado(true);
  }, [gerado]);

  const enviada = p.jaEnviada || Boolean(envio?.ok);
  const pendencias = [
    !p.gmailPronto && "configure GMAIL_USER e GMAIL_APP_PASSWORD na Vercel",
    !p.cvPronto && "envie o currículo em PDF em Configurações",
  ].filter(Boolean);

  if (enviada) {
    return (
      <div className="email-caixa">
        <p className="aviso ok">
          {envio?.ok ?? `Email enviado para ${p.para}${p.enviadaEm ? ` em ${new Date(p.enviadaEm).toLocaleString("pt-BR")}` : ""}.`}
        </p>
        <details>
          <summary>Ver o que foi enviado</summary>
          <p style={{ margin: "10px 0 6px" }}><b>{assunto}</b></p>
          <div className="descricao">{corpo}</div>
        </details>
      </div>
    );
  }

  return (
    <div className="email-caixa">
      <form action={gerar} className="linha-botoes">
        <input type="hidden" name="id" value={p.vagaId} />
        <input type="hidden" name="para" value={para} />
        <button className="botao" name="modo" value="ia" disabled={gerando}>
          {gerando ? "Escrevendo…" : corpo ? "Melhorar com IA" : "Escrever com IA"}
        </button>
        <button className="botao fantasma" name="modo" value="modelo" disabled={gerando}>Usar modelo pronto</button>
        {!p.iaPronta ? <span className="dica">Sem GEMINI_API_KEY: só o modelo pronto funciona.</span> : null}
      </form>
      {gerado?.erro ? <p className="aviso">{gerado.erro}</p> : null}
      {p.preenchidoComModelo && !tocado ? (
        <p className="dica">Já preenchido com o modelo pronto e os seus destaques que combinam com a vaga. Revise e envie, ou use “Melhorar com IA”.</p>
      ) : null}

      <form action={enviar} className="email-form" onChange={() => setTocado(true)}>
        <input type="hidden" name="id" value={p.vagaId} />
        <label>
          Para
          <input type="email" name="para" value={para} onChange={(e) => setPara(e.target.value)} placeholder="email do recrutador" required />
        </label>
        <label>
          Assunto
          <input type="text" name="assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} required />
        </label>
        <label>
          Mensagem
          <textarea name="corpo" value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={14} required placeholder="Use “Escrever com IA” ou escreva aqui." />
        </label>
        {pendencias.length ? <p className="aviso">Para enviar: {pendencias.join(" e ")}.</p> : null}
        <div className="email-rodape">
          <label className="confirmar">
            <input type="checkbox" name="revisado" /> Revisei o email (o currículo em PDF vai anexado)
          </label>
          <button className="botao primario" type="submit" disabled={enviando || pendencias.length > 0 || !corpo}>
            {enviando ? "Enviando…" : "Enviar pelo Gmail"}
          </button>
        </div>
        {envio?.erro ? <p className="erro" role="alert">{envio.erro}</p> : null}
      </form>
    </div>
  );
}
