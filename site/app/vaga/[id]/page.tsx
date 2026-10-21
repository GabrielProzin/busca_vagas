import { notFound } from "next/navigation";
import { Suspense } from "react";
import Moldura from "@/components/Moldura";
import Nota from "@/components/Nota";
import Icone from "@/components/Icone";
import EmailCandidatura from "@/components/EmailCandidatura";
import StatusVaga from "@/components/StatusVaga";
import Followup from "@/components/Followup";
import ResumoVaga, { ResumoCarregando } from "@/components/ResumoVaga";
import { salvarNotas } from "../../acoes";
import AcoesVaga from "@/components/AcoesVaga";
import { buscarVaga } from "@/lib/db";
import { infoCurriculo } from "@/lib/arquivos";
import { gmailConfigurado } from "@/lib/email";
import { emailModelo, iaConfigurada } from "@/lib/ia";
import { fonte, habilidade, local, naFonte, origemEmail, quando } from "@/lib/formato";
import { mensagemLinkedin, situacaoFollowup } from "@/lib/followup";

export const dynamic = "force-dynamic";

export default async function PaginaVaga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await buscarVaga(decodeURIComponent(id));
  if (!v) notFound();
  const c = v.candidatura;
  const status = c?.status ?? "nova";
  const cv = await infoCurriculo().catch(() => null);
  const temEmail = Boolean(v.email_contato || c?.email_para);
  const motivos = v.motivos.filter((m) => !m.startsWith("Pede ")); // "Pede x, y" já aparece nas etiquetas
  const descricaoLonga = (v.descricao ?? "").length > 900;
  // Sem rascunho salvo: o formulário já abre com o modelo pronto (instantâneo, sem gastar a cota da IA).
  const jaEnviou = status === "enviada" || Boolean(c?.email_para && c?.enviada_em && status !== "aplicada");
  const modelo = !c?.email_corpo && !jaEnviou ? emailModelo(v) : null;
  const fu = situacaoFollowup(c);
  const cartaoFollowup = fu ? (
    <section className={`cartao cartao-followup ${fu.estado}`} aria-label="Follow-up">
      <div className="cartao-cabecalho">
        <h2><Icone nome="sino" /> Follow-up</h2>
        {fu.estado === "followup" ? <span className="etiqueta falta">Pendente</span> : null}
      </div>
      <div className="cartao-corpo">
        <Followup
          vagaId={v.id}
          modo={status === "enviada" && c?.email_para ? "email" : "link"}
          para={c?.email_para ?? null}
          situacao={fu}
          linkedin={mensagemLinkedin(v)}
          naFonte={naFonte(v.fonte)}
          iaPronta={iaConfigurada()}
          gmailPronto={gmailConfigurado()}
        />
      </div>
    </section>
  ) : null;

  return (
    <Moldura
      atual=""
      voltar={{ href: "/vagas", rotulo: "Vagas" }}
      titulo={v.titulo}
      subtitulo={
        <>
          <span className="item"><Icone nome="empresa" tamanho={15} />{v.empresa || "Empresa não informada"}</span>
          <span className="item"><Icone nome="local" tamanho={15} />{local(v)}</span>
          <span className="item"><Icone nome="relogio" tamanho={15} />Publicada {quando(v.publicada_em)}, {fonte(v.fonte)}</span>
        </>
      }
      acoes={
        <>
          {status === "nova" ? <AcoesVaga id={v.id} titulo={v.titulo} variante="botoes" /> : null}
          {v.url ? (
            <a className="botao primario" href={v.url} target="_blank" rel="noopener noreferrer">
              Abrir vaga {naFonte(v.fonte)} <Icone nome="externo" tamanho={16} />
            </a>
          ) : null}
        </>
      }
    >
      <div className="detalhe">
        <div>
          {cartaoFollowup}
          <Suspense fallback={<ResumoCarregando />}>
            <ResumoVaga vaga={v} />
          </Suspense>

          <section className="cartao" aria-label="Por que essa nota">
            <div className="cartao-cabecalho"><h2>Por que essa nota</h2></div>
            <div className="cartao-corpo">
              {motivos.length ? <ul className="motivos">{motivos.map((m) => <li key={m}>{m}</li>)}</ul> : null}
              {v.habilidades_ok.length || v.habilidades_faltando.length ? (
                <div className="etiquetas" style={{ marginTop: motivos.length ? 14 : 0 }}>
                  {v.habilidades_ok.map((h) => <span key={h} className="etiqueta ok">{habilidade(h)}</span>)}
                  {v.habilidades_faltando.map((h) => <span key={h} className="etiqueta falta">Falta {h}</span>)}
                </div>
              ) : null}
            </div>
          </section>

          {temEmail ? (
            <section className="cartao" aria-label="Email para o recrutador">
              <div className="cartao-cabecalho">
                <h2><Icone nome="email" /> Email para o recrutador</h2>
                {v.fonte === "linkedin" ? <span className="etiqueta email">Email do post</span> : null}
              </div>
              <div className="cartao-corpo">
                {v.email_origem === "site_rh" || v.email_origem === "site_contato" ? (
                  <p className="aviso" style={{ marginBottom: 14 }}>
                    A vaga não trazia email. Este é {v.email_origem === "site_rh" ? "o email de RH" : "o contato geral"} publicado no site da empresa,
                    não o do recrutador desta vaga. Vale enviar e também se candidatar pelo link.
                  </p>
                ) : null}
              <EmailCandidatura
                vagaId={v.id}
                para={c?.email_para ?? v.email_contato ?? ""}
                assunto={c?.email_assunto ?? modelo?.assunto ?? ""}
                corpo={c?.email_corpo ?? modelo?.corpo ?? ""}
                preenchidoComModelo={Boolean(modelo)}
                jaEnviada={jaEnviou}
                enviadaEm={c?.enviada_em ?? null}
                iaPronta={iaConfigurada()}
                gmailPronto={gmailConfigurado()}
                cvPronto={Boolean(cv)}
              />
              </div>
            </section>
          ) : (
            <section className="cartao" aria-label="Como se candidatar">
              <div className="cartao-cabecalho"><h2><Icone nome="externo" /> Como se candidatar</h2></div>
              <div className="cartao-corpo form-coluna">
                <p className="dica">Esta vaga não trouxe email de recrutador: a candidatura é pelo link {naFonte(v.fonte)}. Depois de aplicar, marque “Já apliquei”.</p>
                <details className="email-escondido">
                  <summary>Achei o email do recrutador por fora</summary>
                  <div style={{ marginTop: 14 }}>
                    <EmailCandidatura
                      vagaId={v.id}
                      para={c?.email_para ?? v.email_contato ?? ""}
                      assunto={c?.email_assunto ?? modelo?.assunto ?? ""}
                      corpo={c?.email_corpo ?? modelo?.corpo ?? ""}
                      preenchidoComModelo={Boolean(modelo)}
                      jaEnviada={jaEnviou}
                      enviadaEm={c?.enviada_em ?? null}
                      iaPronta={iaConfigurada()}
                      gmailPronto={gmailConfigurado()}
                      cvPronto={Boolean(cv)}
              />
                  </div>
                </details>
              </div>
            </section>
          )}

          <section className="cartao" aria-label="Descrição da vaga">
            <div className="cartao-cabecalho"><h2><Icone nome="arquivo" /> Descrição completa</h2></div>
            <div className="cartao-corpo">
              {descricaoLonga ? (
                <div className="descricao-dobra">
                  <div className="descricao">{v.descricao}</div>
                  <details>
                    <summary>
                      <span className="abrir">Mostrar descrição inteira</span>
                      <span className="fechar">Mostrar menos</span>
                    </summary>
                  </details>
                </div>
              ) : (
                <div className="descricao">{v.descricao || "A fonte não trouxe a descrição. Abra a vaga para ler."}</div>
              )}
            </div>
          </section>
        </div>

        <aside className="lado" aria-label="Nota e situação">
          <section className="cartao cartao-nota">
            <div className="cartao-cabecalho"><h2>Compatibilidade</h2>{v.lista === "vale_tentar" ? <span className="etiqueta falta">Vale tentar</span> : null}</div>
            <div className="cartao-corpo"><Nota vaga={v} grande /></div>
          </section>

          <section className="cartao cartao-candidatura">
            <div className="cartao-cabecalho"><h2>Sua candidatura</h2></div>
            <div className="cartao-corpo form-coluna">
              {v.email_contato ? (
                <div className="campo-linha"><span>{origemEmail(v.email_origem)}</span><b>{v.email_contato}</b></div>
              ) : null}
              <label style={{ marginTop: 4 }}>Situação</label>
              <StatusVaga key={status} id={v.id} status={status} />
              <form action={salvarNotas} className="form-coluna" style={{ marginTop: 8 }}>
                <input type="hidden" name="id" value={v.id} />
                <label htmlFor="notas">Anotações</label>
                <textarea id="notas" name="notas" defaultValue={c?.notas ?? ""} placeholder="Contato, data da entrevista, salário combinado…" />
                <button className="botao" type="submit">Salvar anotações</button>
              </form>
            </div>
          </section>
        </aside>
      </div>
    </Moldura>
  );
}
