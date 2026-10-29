"use client";

import { startTransition, useActionState, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  acaoAtualizar, acaoCriarTabelas, acaoLerCurriculo, acaoPrimeiraColeta, acaoSalvarGemini, acaoSalvarGitHub, acaoSalvarGmail, acaoSalvarPerfil,
  type EstadoLeitura, type EstadoPassoAcao,
} from "@/app/instalar/acoes";
import type { PerfilNovo } from "@/lib/montarPerfil";
import BotaoCopiar from "./BotaoCopiar";
import Icone from "./Icone";

// Partes do assistente de instalação (/instalar). Tudo é validado de novo no servidor (app/instalar/acoes.ts).

/** Um passo que abre e fecha. Abre sozinho quando vira a vez dele e nunca fecha sozinho (para não esconder um aviso). */
export function Passo({ n, titulo, resumo, ok, vez, bloqueado, children }: {
  n: number; titulo: string; resumo: string; ok: boolean; vez: boolean; bloqueado?: string | null; children: ReactNode;
}) {
  const [aberto, setAberto] = useState(vez);
  useEffect(() => {
    if (vez) setAberto(true);
  }, [vez]);
  return (
    <li className={`inst-passo${ok ? " pronto" : ""}${vez ? " vez" : ""}`}>
      <details open={aberto} onToggle={(e) => setAberto(e.currentTarget.open)}>
        <summary>
          <span className="inst-num" aria-hidden>{ok ? <Icone nome="check" tamanho={15} /> : n}</span>
          <span className="inst-titulo">
            <b>{titulo}</b>
            <small>{resumo}</small>
          </span>
          <span className={`etiqueta${ok ? " ok" : ""}`}>{ok ? "pronto" : bloqueado ? "depois" : "falta"}</span>
          <Icone nome="abaixo" tamanho={16} className="inst-seta" />
        </summary>
        <div className="inst-corpo">
          {bloqueado && !ok ? <p className="aviso"><Icone nome="alerta" tamanho={15} /> {bloqueado}</p> : children}
        </div>
      </details>
    </li>
  );
}

function Mensagem({ estado }: { estado: EstadoPassoAcao }) {
  if (estado?.erro) return <p className="erro" role="alert">{estado.erro}</p>;
  if (estado?.ok) return <p className="aviso ok" role="status"><Icone nome="check" tamanho={15} /> {estado.ok}</p>;
  return null;
}

/** Formulário que não perde o que foi digitado quando o servidor devolve erro (envio pelo onSubmit). */
function Form({ acao, children, className }: { acao: (d: FormData) => void; children: ReactNode; className?: string }) {
  return (
    <form
      className={className ?? "inst-form"}
      autoComplete="off"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget);
        startTransition(() => acao(dados));
      }}
    >
      {children}
    </form>
  );
}

function Link({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} <Icone nome="externo" tamanho={13} />
    </a>
  );
}

/** Vídeo curto, sem som e em repetição, com o passo a passo na tela de verdade (public/tutorial). */
function VerComoFazer({ video, titulo }: { video: string; titulo: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <details className="inst-tutorial" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary><Icone nome="triagem" tamanho={15} /> Ver como fazer</summary>
      {aberto ? (
        <video src={`/tutorial/${video}.mp4`} poster={`/tutorial/${video}.jpg`} autoPlay muted loop playsInline controls aria-label={titulo} />
      ) : null}
    </details>
  );
}

// ------------------------------------------------------------------ 1. banco
export function PassoBanco({ ok, podeCriar, sql, editor }: { ok: boolean; podeCriar: boolean; sql: string; editor: string | null }) {
  const [estado, acao, rodando] = useActionState<EstadoPassoAcao, FormData>(acaoCriarTabelas, null);
  if (ok) return <><Mensagem estado={estado} /><p className="dica">O banco tem todas as tabelas. Quando o PerfilUp ganhar tabelas novas, elas são criadas sozinhas na atualização.</p></>;
  return (
    <>
      {podeCriar ? (
        <form action={acao} className="inst-form">
          <p>O banco foi criado junto com o site. Falta só criar as tabelas: um clique.</p>
          <div><button className="botao primario" disabled={rodando}>{rodando ? "Criando…" : "Criar as tabelas"}</button></div>
        </form>
      ) : (
        <p>Abra o {editor ? <Link href={editor}>SQL Editor do seu Supabase</Link> : "SQL Editor do seu Supabase"}, cole o SQL abaixo e clique em Run. Ele só cria o que falta e nunca apaga nada.</p>
      )}
      <Mensagem estado={estado} />
      {!podeCriar || estado?.erro ? (
        <div className="inst-sql">
          <textarea readOnly value={sql} aria-label="SQL do banco" rows={6} />
          <BotaoCopiar texto={sql} rotulo="Copiar o SQL" />
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ 2. Gemini
export function PassoGemini({ ok, fixo }: { ok: boolean; fixo: boolean }) {
  const [estado, acao, testando] = useActionState<EstadoPassoAcao, FormData>(acaoSalvarGemini, null);
  if (fixo) return <p className="dica">A chave está nas variáveis da Vercel (GEMINI_API_KEY). Para trocar, mude por lá.</p>;
  return (
    <>
      <ol className="inst-roteiro">
        <li>Abra o <Link href="https://aistudio.google.com/apikey">Google AI Studio</Link> e entre com a sua conta Google.</li>
        <li>Clique em <b>Create API key</b> (é grátis, sem cartão).</li>
        <li>Copie a chave e cole aqui.</li>
      </ol>
      <VerComoFazer video="gemini" titulo="Como criar a chave do Gemini no Google AI Studio" />
      <Form acao={acao}>
        <label>
          Chave do Gemini {ok ? <small className="dica">(já salva; cole outra só se quiser trocar)</small> : null}
          <input type="password" name="chave" required placeholder="AIza…" spellCheck={false} />
        </label>
        <div><button className="botao primario" disabled={testando}>{testando ? "Testando…" : "Testar e salvar"}</button></div>
      </Form>
      <Mensagem estado={estado} />
    </>
  );
}

// ------------------------------------------------------------------ 3. Gmail
export function PassoGmail({ ok, fixo, usuario, telefone }: { ok: boolean; fixo: boolean; usuario: string | null; telefone: string | null }) {
  const [estado, acao, testando] = useActionState<EstadoPassoAcao, FormData>(acaoSalvarGmail, null);
  if (fixo) return <p className="dica">O Gmail está nas variáveis da Vercel ({usuario}). Para trocar, mude por lá.</p>;
  return (
    <>
      <ol className="inst-roteiro">
        <li>Ligue a <Link href="https://myaccount.google.com/signinoptions/twosv">verificação em duas etapas</Link> da sua conta Google (sem ela, a senha de app não aparece).</li>
        <li>Abra <Link href="https://myaccount.google.com/apppasswords">Senhas de app</Link>, dê o nome <b>PerfilUp</b> e clique em Criar.</li>
        <li>Copie as 16 letras e cole aqui. Não é a senha normal do Gmail: esta só serve para enviar email e pode ser apagada quando quiser.</li>
      </ol>
      <Form acao={acao}>
        <div className="inst-duas">
          <label>
            Seu Gmail
            <input type="email" name="usuario" required defaultValue={usuario ?? ""} placeholder="voce@gmail.com" />
          </label>
          <label>
            Senha de app {ok ? <small className="dica">(já salva)</small> : null}
            <input type="password" name="senha" required placeholder="abcd efgh ijkl mnop" spellCheck={false} />
          </label>
        </div>
        <label>
          Telefone para a assinatura dos emails <small className="dica">(opcional; não vai para o repositório)</small>
          <input type="tel" name="telefone" defaultValue={telefone ?? ""} placeholder="(62) 99999-0000" />
        </label>
        <div><button className="botao primario" disabled={testando}>{testando ? "Testando…" : "Testar e salvar"}</button></div>
      </Form>
      <Mensagem estado={estado} />
    </>
  );
}

// ------------------------------------------------------------------ 4. GitHub
export function PassoGitHub({ ok, repo, link }: { ok: boolean; repo: string; link: string }) {
  const [estado, acao, testando] = useActionState<EstadoPassoAcao, FormData>(acaoSalvarGitHub, null);
  const nome = repo.split("/")[1] ?? "seu repositório";
  return (
    <>
      <p>A coleta de vagas roda no GitHub, 5 vezes por dia. Com um token, este site liga tudo por lá para você: guarda as chaves no Actions, liga a coleta e salva o seu perfil.</p>
      <ol className="inst-roteiro">
        <li>Clique em <Link href={link}>Criar o token no GitHub</Link>. Ele já vem com o nome, a validade (1 ano) e as permissões marcadas.</li>
        <li>Em <b>Repository access</b>, escolha <b>Only select repositories</b> e marque <b>{nome}</b>. Assim o token só mexe nesse repositório.</li>
        <li>Clique em <b>Generate token</b>, copie e cole aqui.</li>
      </ol>
      <VerComoFazer video="github" titulo="Como criar o token do GitHub" />
      <Form acao={acao}>
        <label>
          Token do GitHub {ok ? <small className="dica">(já salvo; cole outro só se quiser trocar)</small> : null}
          <input type="password" name="token" required placeholder="github_pat_…" spellCheck={false} />
        </label>
        <div><button className="botao primario" disabled={testando}>{testando ? "Ligando…" : "Conferir e ligar"}</button></div>
      </Form>
      <Mensagem estado={estado} />
      {estado?.extra ? (
        <div className="inst-guardar" role="note">
          <p><b>Anote a senha dos backups</b> num lugar seguro (um gerenciador de senhas, por exemplo). Ela abre o backup do seu banco que o GitHub guarda a cada coleta. Ela também fica guardada aqui, cifrada.</p>
          <div className="inst-segredo"><code>{estado.extra}</code><BotaoCopiar texto={estado.extra} rotulo="Copiar" /></div>
        </div>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ 5. perfil
export function PassoPerfil({ ok, nome }: { ok: boolean; nome: string }) {
  const [leitura, ler, lendo] = useActionState<EstadoLeitura, FormData>(acaoLerCurriculo, null);
  const [salvo, salvar, salvando] = useActionState<EstadoPassoAcao, FormData>(acaoSalvarPerfil, null);
  const perfil = leitura?.perfil;
  return (
    <>
      {ok && !perfil ? <p className="dica">Perfil de <b>{nome}</b> salvo no repositório. Para refazer a partir de outro PDF, envie abaixo.</p> : null}
      {!perfil ? (
        <>
          <p>Envie o seu currículo em PDF. A IA lê e monta o seu perfil: habilidades (que dão a nota das vagas), pontos fortes (que viram argumento nos emails) e o texto do currículo. Você confere tudo antes de salvar.</p>
          <form action={ler} className="inst-form">
            <label>
              Currículo em PDF (até 3,8 MB)
              <input type="file" name="pdf" accept="application/pdf,.pdf" required />
            </label>
            <div><button className="botao primario" disabled={lendo}>{lendo ? "Lendo o currículo… (uns 20 segundos)" : "Ler o currículo"}</button></div>
          </form>
          {leitura?.erro ? <p className="erro" role="alert">{leitura.erro}</p> : null}
          <p className="dica">O PDF também fica salvo como anexo dos emails. Telefone, email e endereço são tirados do texto, porque o repositório pode ser público.</p>
        </>
      ) : salvo?.ok ? (
        <Mensagem estado={salvo} />
      ) : (
        <RevisaoPerfil perfil={perfil} acao={salvar} salvando={salvando} estado={salvo} />
      )}
    </>
  );
}

function RevisaoPerfil({ perfil, acao, salvando, estado }: { perfil: PerfilNovo; acao: (d: FormData) => void; salvando: boolean; estado: EstadoPassoAcao }) {
  return (
    <Form acao={acao} className="inst-form inst-revisao">
      <p className="aviso ok" role="status"><Icone nome="ia" tamanho={15} /> Li o seu currículo. Confira e corrija o que precisar.</p>
      <input type="hidden" name="base" value={JSON.stringify(perfil)} />
      <div className="inst-duas">
        <label>Nome completo<input type="text" name="nome" defaultValue={perfil.nome} required /></label>
        <label>Como assina os emails<input type="text" name="nome_curto" defaultValue={perfil.nome_curto} /></label>
        <label>Cargo<input type="text" name="cargo" defaultValue={perfil.cargo} required placeholder="Analista de Dados" /></label>
        <label>Cidade<input type="text" name="cidade" defaultValue={perfil.cidade} placeholder="Goiânia, GO" /></label>
      </div>
      <label>Título (cargo e ferramentas principais)<input type="text" name="titulo" defaultValue={perfil.titulo} /></label>
      <label>
        Completa a frase do email: “o trabalho tem muito a ver com ___”
        <input type="text" name="experiencia_resumo" defaultValue={perfil.experiencia_resumo} />
      </label>
      <div className="inst-tres">
        <label>LinkedIn<input type="text" name="linkedin" defaultValue={perfil.links.linkedin ?? ""} placeholder="https://linkedin.com/in/…" /></label>
        <label>GitHub<input type="text" name="github" defaultValue={perfil.links.github ?? ""} placeholder="https://github.com/…" /></label>
        <label>Portfólio<input type="text" name="portfolio" defaultValue={perfil.links.portfolio ?? ""} placeholder="https://…" /></label>
      </div>

      <fieldset className="inst-bloco">
        <legend>Habilidades ({perfil.habilidades.length})</legend>
        <p className="dica">Desmarque o que você não tem. As com ★★★ pesam mais na nota das vagas.</p>
        <div className="inst-habs">
          {perfil.habilidades.map((h) => (
            <label key={h.nome} className="prefs-chip">
              <input type="checkbox" name="hab" value={JSON.stringify(h)} defaultChecked />
              <span>{h.nome.replace(/_/g, " ")} <small aria-label={`peso ${h.peso}`}>{"★".repeat(h.peso)}</small></span>
            </label>
          ))}
        </div>
        <label>
          Faltou alguma? Separe por vírgula
          <input type="text" name="hab_novas" placeholder="Spark, Databricks" />
        </label>
      </fieldset>

      <fieldset className="inst-bloco">
        <legend>Pontos fortes para os emails</legend>
        <p className="dica">A IA escolhe o que combina com cada vaga. Ajuste o jeito de falar; não deixe nada que não seja verdade.</p>
        {perfil.destaques.map((d, i) => (
          <div key={i} className="inst-destaque">
            <label className="prefs-check"><input type="checkbox" name={`dest_manter_${i}`} defaultChecked /> Usar</label>
            <textarea name={`dest_frase_${i}`} defaultValue={d.frase} rows={2} aria-label={`Ponto forte ${i + 1}`} />
          </div>
        ))}
      </fieldset>

      <details className="inst-bloco">
        <summary>Texto do currículo (usado na nota e na análise de CV)</summary>
        <textarea name="curriculo_md" defaultValue={perfil.curriculo_md} rows={14} aria-label="Texto do currículo" />
      </details>

      <div><button className="botao primario" disabled={salvando}>{salvando ? "Salvando no GitHub…" : "Salvar o meu perfil"}</button></div>
      <Mensagem estado={estado} />
    </Form>
  );
}

// ------------------------------------------------------------------ 7. primeira coleta
export function PassoColeta({ ok, estadoGitHub, url }: { ok: boolean; estadoGitHub: string | null; url: string | null }) {
  const [estado, acao, iniciando] = useActionState<EstadoPassoAcao, FormData>(acaoPrimeiraColeta, null);
  const andando = estadoGitHub === "na_fila" || estadoGitHub === "rodando";
  if (ok) {
    return (
      <>
        <p>A primeira coleta terminou. Daqui para a frente ela roda sozinha 5 vezes por dia.</p>
        <div><a className="botao primario" href="/">Ver as vagas de hoje</a></div>
      </>
    );
  }
  return (
    <>
      <p>Busca vagas em todas as fontes, dá a nota de cada uma pelo seu perfil e guarda no banco. Leva de 5 a 10 minutos.</p>
      {andando ? (
        <p className="aviso" role="status">
          <Icone nome="relogio" tamanho={15} /> {estadoGitHub === "na_fila" ? "Na fila do GitHub…" : "Coletando…"} Esta página se atualiza sozinha.
          {url ? <> <Link href={url}>Acompanhar no GitHub</Link></> : null}
        </p>
      ) : (
        <form action={acao} className="inst-form">
          <div><button className="botao primario" disabled={iniciando}>{iniciando ? "Iniciando…" : estadoGitHub === "falhou" ? "Tentar de novo" : "Rodar a primeira coleta"}</button></div>
        </form>
      )}
      {estadoGitHub === "falhou" ? (
        <p className="erro">A última coleta falhou.{url ? <> <Link href={url}>Ver o erro no GitHub</Link>.</> : null} Se for no passo “Testes”, confira o perfil salvo.</p>
      ) : null}
      <Mensagem estado={estado} />
      {andando || estado?.ok ? <Recarregar segundos={15} /> : null}
    </>
  );
}

/** Recarrega os dados da página de tempos em tempos (andamento da coleta ou da atualização). */
export function Recarregar({ segundos }: { segundos: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [router, segundos]);
  return null;
}

// ------------------------------------------------------------------ atualizações (Configurações)
export function BotaoAtualizar() {
  const [estado, acao, iniciando] = useActionState<EstadoPassoAcao, FormData>(acaoAtualizar, null);
  return (
    <form action={acao} className="form-coluna">
      <div><button className="botao primario" disabled={iniciando || Boolean(estado?.ok)}>{iniciando ? "Iniciando…" : "Atualizar agora"}</button></div>
      <Mensagem estado={estado} />
      {estado?.ok ? <Recarregar segundos={30} /> : null}
    </form>
  );
}
