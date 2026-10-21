"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Icone from "./Icone";
import { enviarFollowup, gerarRascunhoFollowup, marcarFollowup, moverCandidatura, type EstadoEmail } from "@/app/acoes";
import { FOLLOWUP_DIAS, type Followup as Situacao } from "@/lib/followup";

type Props = {
  vagaId: string;
  modo: "email" | "link";
  para: string | null;
  situacao: Situacao;
  linkedin: string;
  naFonte: string;
  iaPronta: boolean;
  gmailPronto: boolean;
};

const data = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

// Cartão de acompanhamento: diz quando fazer o follow-up e deixa a mensagem pronta.
// Por email: vai como resposta ao primeiro email, pelo Gmail. Pelo link: mensagem para o recrutador no LinkedIn.
export default function Followup(p: Props) {
  const router = useRouter();
  const s = p.situacao;
  const [assunto, setAssunto] = useState("");
  const [corpo, setCorpo] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [ocupado, startTransition] = useTransition();
  const [gerado, gerar, gerando] = useActionState<EstadoEmail, FormData>(gerarRascunhoFollowup, null);
  const [envio, enviar, enviando] = useActionState<EstadoEmail, FormData>(enviarFollowup, null);

  useEffect(() => {
    if (gerado?.assunto) setAssunto(gerado.assunto);
    if (gerado?.corpo) setCorpo(gerado.corpo);
  }, [gerado]);
  useEffect(() => {
    if (envio?.ok) router.refresh();
  }, [envio, router]);

  function acao(f: () => Promise<string | null>) {
    setErroAcao(null);
    startTransition(async () => {
      const erro = await f();
      if (erro) setErroAcao(erro);
      else router.refresh();
    });
  }

  const envioTexto = p.modo === "email" ? "o email" : "a candidatura";
  const contexto =
    s.feitos > 0 && s.ultimoFollowup
      ? `Último follow-up em ${data(s.ultimoFollowup)} (${s.feitos} até agora).`
      : `Você enviou ${envioTexto} há ${dias(s.dias)}.`;

  const situacao =
    s.estado === "aguardando" ? (
      <p className="dica">{contexto} O próximo follow-up é sugerido a partir de <b>{data(s.proxima)}</b>.</p>
    ) : s.estado === "followup" ? (
      <p className="aviso">{dias(s.dias)} sem resposta. {s.feitos === 0 ? "Hora de um follow-up curto." : "Vale um último follow-up."}</p>
    ) : (
      <div className="followup-encerrar">
        <p className="aviso">{s.feitos} follow-ups e {dias(s.dias)} sem resposta. Pode ser hora de mover para Não seguiu e focar nas próximas.</p>
        <button className="botao" type="button" disabled={ocupado} onClick={() => acao(() => moverCandidatura(p.vagaId, "recusada"))}>
          Mover para Não seguiu
        </button>
      </div>
    );

  const ferramentas =
    p.modo === "email" ? (
      envio?.ok ? null : (
        <div className="email-caixa">
          <form action={gerar} className="linha-botoes">
            <input type="hidden" name="id" value={p.vagaId} />
            <button className="botao" name="modo" value="ia" disabled={gerando}>{gerando ? "Escrevendo…" : corpo ? "Reescrever com IA" : "Escrever follow-up com IA"}</button>
            <button className="botao fantasma" name="modo" value="modelo" disabled={gerando}>Usar modelo pronto</button>
            {!p.iaPronta ? <span className="dica">Sem GEMINI_API_KEY: só o modelo pronto funciona.</span> : null}
          </form>
          {gerado?.erro ? <p className="aviso">{gerado.erro}</p> : null}
          {corpo ? (
            <form action={enviar} className="email-form">
              <input type="hidden" name="id" value={p.vagaId} />
              <p className="dica">Para <b>{p.para}</b>, como resposta ao seu primeiro email (sem anexo: o currículo já está na conversa).</p>
              <label>
                Assunto
                <input type="text" name="assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} required />
              </label>
              <label>
                Mensagem
                <textarea name="corpo" value={corpo} onChange={(e) => setCorpo(e.target.value)} rows={10} required />
              </label>
              {!p.gmailPronto ? <p className="aviso">Para enviar: configure GMAIL_USER e GMAIL_APP_PASSWORD na Vercel.</p> : null}
              <div className="email-rodape">
                <label className="confirmar"><input type="checkbox" name="revisado" /> Revisei o follow-up</label>
                <button className="botao primario" type="submit" disabled={enviando || !p.gmailPronto}>{enviando ? "Enviando…" : "Enviar follow-up"}</button>
              </div>
              {envio?.erro ? <p className="erro" role="alert">{envio.erro}</p> : null}
            </form>
          ) : null}
        </div>
      )
    ) : (
      <div className="followup-link">
        <p className="dica">
          Primeiro, abra a vaga {p.naFonte} e veja se o status mudou. Se achar no LinkedIn quem recruta para a vaga, mande esta mensagem
          (cabe no convite de conexão):
        </p>
        <div className="mensagem-pronta">
          <p>{p.linkedin}</p>
          <button
            className="botao fantasma"
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(p.linkedin).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
              });
            }}
          >
            <Icone nome={copiado ? "check" : "copiar"} tamanho={15} /> {copiado ? "Copiada" : "Copiar"}
          </button>
        </div>
      </div>
    );

  const marcar = (
    <div className="linha-botoes">
      <button className="botao fantasma" type="button" disabled={ocupado} onClick={() => acao(() => marcarFollowup(p.vagaId))}>
        <Icone nome="check" tamanho={15} /> {p.modo === "email" ? "Fiz o follow-up por fora" : "Já fiz o follow-up"}
      </button>
      <span className="dica">Registra o follow-up e reinicia a contagem de {FOLLOWUP_DIAS} dias.</span>
    </div>
  );

  return (
    <div className="followup">
      {envio?.ok ? <p className="aviso ok" role="status">{envio.ok}</p> : null}
      {situacao}
      {s.estado === "aguardando" ? (
        <details className="followup-cedo">
          <summary>Fazer o follow-up agora mesmo assim</summary>
          <div className="followup-corpo">{ferramentas}{marcar}</div>
        </details>
      ) : s.estado === "followup" ? (
        <div className="followup-corpo">{ferramentas}{marcar}</div>
      ) : null}
      {erroAcao ? <p className="erro" role="alert">{erroAcao}</p> : null}
    </div>
  );
}
