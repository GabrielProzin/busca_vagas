import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import ContadorEnvio from "@/components/ContadorEnvio";
import { enviadosHoje, lerUso, listarCandidaturas, listarExecucoes, listarVagas } from "@/lib/db";
import { montarUso } from "@/lib/uso";
import { idUrl, origemEmail } from "@/lib/formato";
import { situacaoFollowup } from "@/lib/followup";
import { passosConfiguracao } from "@/lib/configuracao";
import { PERFIL } from "@/lib/gerado/perfil";
import { ETAPAS, ehNova, type Vaga } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// Hoje: o que pede ação agora, numa tela só. Cada bloco leva direto para onde se resolve.

const fuso = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", timeZone: fuso });
const fmtCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: fuso });

function horaSP(): number {
  return Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hourCycle: "h23", timeZone: fuso }).format(new Date()));
}

// Coletas: ~8:00, ~11:00, ~14:00, ~18:30 e ~22:00 (as de 11:00 e 18:30 são as completas).
function proximaColeta(): string {
  const h = horaSP();
  return h < 8 ? "8:00" : h < 11 ? "11:00" : h < 14 ? "14:00" : h < 18 ? "18:30" : h < 22 ? "22:00" : "8:00";
}

function saudacao(): string {
  const hora = horaSP();
  const primeiro = PERFIL.nomeCurto.split(" ")[0];
  return `${hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite"}, ${primeiro}`;
}

export default async function PaginaHoje() {
  let vagas: Vaga[] = [];
  let candidaturas: Vaga[] = [];
  let falhou = false;
  try {
    [vagas, candidaturas] = await Promise.all([listarVagas(), listarCandidaturas()]);
  } catch (e) {
    console.error("hoje:", e);
    falhou = true;
  }
  const [passos, hoje, uso, ultimas] = await Promise.all([
    passosConfiguracao().catch(() => []), enviadosHoje().catch(() => 0), lerUso(), listarExecucoes(1).catch(() => []),
  ]);
  // Algum plano grátis passou de 80%: avisa no topo (o detalhe fica em Uso dos serviços).
  const apertados = montarUso({ servicos: uso?.servicos ?? [], diario: uso?.diario ?? [], ultimaColeta: ultimas[0]?.iniciada_em ?? null, emailsCandidaturaHoje: hoje })
    .filter((c) => (c.fracao ?? 0) >= 0.8);
  const essenciais = passos.filter((p) => p.essencial && !p.ok);
  const instalar = essenciais.some((p) => p.link === "/instalar");

  const novas = vagas.filter(ehNova);
  const comEmail = novas.filter((v) => v.email_contato).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0));
  const chegaramHoje = novas.filter((v) => Date.now() - Date.parse(v.primeira_vez_em) < 864e5).length;

  const comFollowup = candidaturas
    .map((v) => ({ v, fu: situacaoFollowup(v.candidatura) }))
    .filter((x) => x.fu);
  const pendentes = comFollowup.filter((x) => x.fu!.estado !== "aguardando").sort((a, b) => b.fu!.dias - a.fu!.dias);
  const proximo = comFollowup.filter((x) => x.fu!.estado === "aguardando").sort((a, b) => Date.parse(a.fu!.proxima) - Date.parse(b.fu!.proxima))[0];

  // Envio: fila e o que o Gmail trouxe de volta (respostas e devoluções) nos últimos 7 dias.
  const naFila = vagas.filter((v) => v.candidatura?.status === "nova" && v.candidatura.fila_em).length;
  const semana = Date.now() - 7 * 864e5;
  const porId = new Map([...vagas, ...candidaturas].map((v) => [v.id, v]));
  const eventos = [...porId.values()]
    .flatMap((v) => {
      const c = v.candidatura;
      const lista: { v: Vaga; tipo: "resposta" | "devolvido"; quando: number }[] = [];
      if (c?.resposta_em && Date.parse(c.resposta_em) > semana) lista.push({ v, tipo: "resposta", quando: Date.parse(c.resposta_em) });
      if (c?.devolvido_em && Date.parse(c.devolvido_em) > semana) lista.push({ v, tipo: "devolvido", quando: Date.parse(c.devolvido_em) });
      return lista;
    })
    .sort((a, b) => b.quando - a.quando);

  const porEtapa = Object.fromEntries(ETAPAS.map((e) => [e.status, candidaturas.filter((v) => v.candidatura?.status === e.status).length]));
  const avancando = candidaturas.filter((v) => ["respondeu", "entrevista", "proposta"].includes(v.candidatura?.status ?? ""));

  return (
    <Moldura
      atual="/"
      titulo={saudacao()}
      subtitulo={<span className="primeira-maiuscula">{fmtDia.format(new Date())}</span>}
      acoes={
        <Link className="botao" href="/adicionar">
          <Icone nome="adicionar" tamanho={16} /> Adicionar vaga
        </Link>
      }
    >
      {essenciais.length ? (
        <Link href={instalar ? "/instalar" : "/configuracoes"} className="faixa aviso">
          <Icone nome="alerta" /> {essenciais.length === 1 ? "Falta 1 passo" : `Faltam ${essenciais.length} passos`} para o sistema ficar completo:{" "}
          {essenciais.map((p) => p.rotulo.charAt(0).toLowerCase() + p.rotulo.slice(1)).join(", ")}. {instalar ? "Terminar a instalação →" : "Ver em Configurações →"}
        </Link>
      ) : null}
      {apertados.length ? (
        <Link href="/uso" className="faixa aviso">
          <Icone nome="medidor" /> {apertados.map((c) => `${c.nome} em ${Math.round((c.fracao ?? 0) * 100)}%`).join(", ")} do plano grátis. Ver Uso dos serviços →
        </Link>
      ) : null}
      {falhou ? (
        <div className="faixa aviso" role="status"><Icone nome="alerta" /> Não consegui ler o banco agora. Tente recarregar em instantes.</div>
      ) : null}

      <div className="hoje-grade">
        <div className="hoje-coluna">
        <section className="cartao hoje-email" aria-label="Vagas novas com email">
          <div className="cartao-cabecalho">
            <h2><Icone nome="email" /> Vagas novas com email</h2>
            <span className="contador">{comEmail.length}</span>
          </div>
          {comEmail.length ? (
            <>
              <ul className="hoje-lista">
                {comEmail.slice(0, 5).map((v) => (
                  <li key={v.id}>
                    <span className={`hoje-nota ${v.lista ?? ""}`}>{Math.round(v.nota ?? 0)}</span>
                    <div>
                      <Link href={idUrl(v.id)} className="hoje-titulo">{v.titulo}</Link>
                      <span className="dica">{v.empresa || "Empresa não informada"} · {origemEmail(v.email_origem)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="cartao-rodape">
                <Link href="/vagas?email=1">Ver todas com email →</Link>
              </div>
            </>
          ) : (
            <div className="cartao-corpo dica">
              Nenhuma vaga nova com email agora. No LinkedIn, abra uma busca de posts e clique na extensão para trazer mais
              (<Link href="/adicionar">buscas prontas</Link>).
            </div>
          )}
        </section>

        <section className="cartao hoje-andamento" aria-label="Em andamento">
          <div className="cartao-cabecalho"><h2><Icone nome="candidaturas" /> Em andamento</h2></div>
          <div className="cartao-corpo">
            <div className="hoje-etapas">
              {ETAPAS.filter((e) => e.status !== "recusada").map((e) => (
                <Link key={e.status} href="/candidaturas" className="hoje-etapa">
                  <strong>{porEtapa[e.status] ?? 0}</strong>
                  <span>{e.status === "aplicada" ? "Aplicada" : e.rotulo}</span>
                </Link>
              ))}
            </div>
            {avancando.length ? (
              <ul className="hoje-lista compacta">
                {avancando.slice(0, 4).map((v) => (
                  <li key={v.id}>
                    <span className="etiqueta ok">{ETAPAS.find((e) => e.status === v.candidatura?.status)?.rotulo}</span>
                    <Link href={idUrl(v.id)} className="hoje-titulo">{v.titulo}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dica" style={{ marginTop: 12 }}>Quando uma empresa responder, mova o cartão no quadro: ela aparece aqui.</p>
            )}
          </div>
        </section>
        </div>
        <div className="hoje-coluna">
        <section className="cartao hoje-triagem" aria-label="Triagem">
          <div className="cartao-cabecalho"><h2><Icone nome="triagem" /> Para triar</h2></div>
          <div className="cartao-corpo hoje-numero">
            <strong>{novas.length}</strong>
            <span>{novas.length === 1 ? "vaga nova esperando decisão" : "vagas novas esperando decisão"}{chegaramHoje ? `, ${chegaramHoje} chegaram nas últimas 24h` : ""}.</span>
            {novas.length ? (
              <Link className="botao primario" href="/triagem">Começar triagem</Link>
            ) : (
              <span className="dica">Tudo triado. A próxima coleta roda por volta das {proximaColeta()}.</span>
            )}
          </div>
        </section>

        <section className="cartao hoje-envio" aria-label="Envio de emails">
          <div className="cartao-cabecalho"><h2><Icone nome="lote" /> Envio de emails</h2></div>
          <div className="cartao-corpo">
            <ContadorEnvio hoje={hoje} limite={PERFIL.envio.limiteDiario} naFila={naFila} />
            {eventos.length ? (
              <ul className="hoje-lista compacta">
                {eventos.slice(0, 5).map(({ v, tipo }) => (
                  <li key={v.id + tipo}>
                    <span className={`etiqueta ${tipo === "resposta" ? "ok" : "devolvido"}`}>{tipo === "resposta" ? "Respondeu" : "Email voltou"}</span>
                    <Link href={idUrl(v.id)} className="hoje-titulo">{v.titulo}</Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="dica" style={{ marginTop: 10 }}>Respostas e emails devolvidos aparecem aqui: o sistema lê o seu Gmail de hora em hora.</p>
            )}
          </div>
          <div className="cartao-rodape"><Link href="/lote">Envio em lote →</Link></div>
        </section>

        <section className="cartao hoje-follow" aria-label="Follow-ups">
          <div className="cartao-cabecalho">
            <h2><Icone nome="sino" /> Follow-ups</h2>
            {pendentes.length ? <span className="contador quente">{pendentes.length}</span> : null}
          </div>
          {pendentes.length ? (
            <ul className="hoje-lista">
              {pendentes.slice(0, 5).map(({ v, fu }) => (
                <li key={v.id}>
                  <span className={`hoje-selo ${fu!.estado}`}>{fu!.dias}d</span>
                  <div>
                    <Link href={idUrl(v.id)} className="hoje-titulo">{v.titulo}</Link>
                    <span className="dica">
                      {v.empresa || "Empresa não informada"} · {fu!.estado === "followup" ? "fazer follow-up" : "talvez mover para Não seguiu"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="cartao-corpo dica">
              Nenhum follow-up pendente.
              {proximo ? <> O próximo é <Link href={idUrl(proximo.v.id)}>{proximo.v.titulo}</Link>, a partir de {fmtCurta.format(new Date(proximo.fu!.proxima))}.</> : null}
            </div>
          )}
        </section>

        </div>
      </div>
    </Moldura>
  );
}
