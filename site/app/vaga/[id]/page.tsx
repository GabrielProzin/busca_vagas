import Link from "next/link";
import { notFound } from "next/navigation";
import Topo from "@/components/Topo";
import Nota from "@/components/Nota";
import EmailCandidatura from "@/components/EmailCandidatura";
import ResumoVaga, { ResumoCarregando } from "@/components/ResumoVaga";
import { Suspense } from "react";
import { alterarStatus, salvarNotas } from "../../acoes";
import { buscarVaga } from "@/lib/db";
import { infoCurriculo } from "@/lib/arquivos";
import { gmailConfigurado } from "@/lib/email";
import { iaConfigurada } from "@/lib/ia";
import { fonte, habilidade, local, naFonte, origemEmail, quando } from "@/lib/formato";
import { ETAPAS, ROTULO_STATUS } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaVaga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await buscarVaga(decodeURIComponent(id));
  if (!v) notFound();
  const c = v.candidatura;
  const status = c?.status ?? "nova";
  const cv = await infoCurriculo().catch(() => null);
  const temEmail = Boolean(v.email_contato || c?.email_para);

  return (
    <>
      <Topo atual="" />
      <main className="conteudo">
        <Link href="/" className="voltar">← Voltar para as vagas</Link>
        <h1 className="titulo-vaga">{v.titulo}</h1>
        <div className="meta meta-vaga">
          <span>{v.empresa || "Empresa não informada"}</span>
          <span>{local(v)}</span>
          <span>{fonte(v.fonte)}, publicada {quando(v.publicada_em)}</span>
        </div>
        <div className="detalhe">
          <div>

            <Suspense fallback={<ResumoCarregando />}>
              <ResumoVaga vaga={v} />
            </Suspense>

            <h2>Por que essa nota</h2>
            <ul className="motivos">
              {/* "Pede x, y — está no seu currículo" já aparece nas etiquetas logo abaixo */}
              {v.motivos.filter((m) => !m.startsWith("Pede ")).map((m) => <li key={m}>{m}</li>)}
            </ul>
            {v.habilidades_ok.length || v.habilidades_faltando.length ? (
              <div className="etiquetas" style={{ marginTop: 14 }}>
                {v.habilidades_ok.map((h) => <span key={h} className="etiqueta">{habilidade(h)}</span>)}
                {v.habilidades_faltando.map((h) => <span key={h} className="etiqueta falta">Falta {h}</span>)}
              </div>
            ) : null}

            <h2>{temEmail ? "Email para o recrutador" : "Candidatura por email"}</h2>
            {v.email_origem === "site_rh" || v.email_origem === "site_contato" ? (
              <p className="dica" style={{ marginBottom: 12, maxWidth: "70ch" }}>
                A vaga não trazia email. Este endereço é {v.email_origem === "site_rh" ? "o de RH" : "o de contato geral"} publicado no site da empresa,
                não o do recrutador desta vaga. Vale enviar e também se candidatar pelo link.
              </p>
            ) : null}
            {!temEmail ? (
              <p className="dica" style={{ marginBottom: 12, maxWidth: "70ch" }}>
                Essa vaga não trouxe email: o normal é se candidatar pelo link. Se você achar o email do recrutador, preencha o campo Para e envie por aqui.
              </p>
            ) : null}
            <EmailCandidatura
              vagaId={v.id}
              para={c?.email_para ?? v.email_contato ?? ""}
              assunto={c?.email_assunto ?? ""}
              corpo={c?.email_corpo ?? ""}
              jaEnviada={status === "enviada" || Boolean(c?.email_para && c?.enviada_em && status !== "aplicada")}
              enviadaEm={c?.enviada_em ?? null}
              iaPronta={iaConfigurada()}
              gmailPronto={gmailConfigurado()}
              cvPronto={Boolean(cv)}
            />

            <h2>Descrição da vaga</h2>
            <div className="descricao">{v.descricao || "A fonte não trouxe a descrição. Abra a vaga para ler."}</div>
          </div>

          <aside className="painel-lateral" aria-label="Ações">
            <Nota vaga={v} grande />
            <p className="status-atual">Situação: <b>{ROTULO_STATUS[status]}</b></p>
            {v.email_contato ? (
              <p className="status-atual">{origemEmail(v.email_origem)}: <b>{v.email_contato}</b></p>
            ) : null}
            {v.url ? (
              <a className="botao primario" href={v.url} target="_blank" rel="noopener noreferrer">Abrir vaga {naFonte(v.fonte)}</a>
            ) : null}
            <form action={alterarStatus} style={{ display: "flex", gap: 8 }}>
              <input type="hidden" name="id" value={v.id} />
              <select name="status" defaultValue={status === "nova" ? "aplicada" : status} aria-label="Nova situação">
                {ETAPAS.map((e) => <option key={e.status} value={e.status}>{e.rotulo}</option>)}
                <option value="descartada">Descartada</option>
                <option value="nova">Nova (desfazer)</option>
              </select>
              <button className="botao" type="submit">Salvar</button>
            </form>
            <details className="anotacoes" open={Boolean(c?.notas)}>
              <summary className="status-atual">Anotações{c?.notas ? "" : " (nenhuma)"}</summary>
              <form action={salvarNotas} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <input type="hidden" name="id" value={v.id} />
                <textarea id="notas" name="notas" aria-label="Anotações" defaultValue={c?.notas ?? ""} placeholder="Contato, data da entrevista, salário combinado…" />
                <button className="botao" type="submit">Salvar anotações</button>
              </form>
            </details>
          </aside>
        </div>
      </main>
    </>
  );
}
