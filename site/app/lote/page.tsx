import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import Lote, { Fila, type ItemLoteTela } from "@/components/Lote";
import { enviadosHoje, filaPronta, listarFila, listarVagas } from "@/lib/db";
import { emailModelo } from "@/lib/ia";
import { dominioExcluido } from "@/lib/captura";
import { fonte, idUrl, origemEmail } from "@/lib/formato";
import { PERFIL } from "@/lib/gerado/perfil";
import { ehNova, type Vaga } from "@/lib/tipos";

export const dynamic = "force-dynamic";

// Envio em lote: as vagas novas com email, cada uma com o email pronto; as escolhidas vão para a fila,
// que o GitHub Actions envia em segundo plano (horário, pausa entre emails e limite diário).

const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

export default async function PaginaLote() {
  let vagas: Vaga[] = [];
  let falhou = false;
  try {
    vagas = await listarVagas();
  } catch (e) {
    console.error("lote:", e);
    falhou = true;
  }
  const [hoje, fila, pronta] = await Promise.all([
    enviadosHoje().catch(() => 0),
    listarFila().catch(() => ({ esperando: [], falharam: [] })),
    filaPronta(),
  ]);
  const e = PERFIL.envio;
  const restam = Math.max(0, e.limiteDiario - hoje);

  const comEmail = vagas.filter((v) => ehNova(v) && v.email_contato).sort((a, b) => (b.nota ?? 0) - (a.nota ?? 0));
  const excluidas = comEmail.filter((v) => dominioExcluido(v.email_contato!)).length;
  const itens: ItemLoteTela[] = comEmail
    .filter((v) => !dominioExcluido(v.email_contato!))
    .map((v) => {
      const c = v.candidatura;
      const rascunho = Boolean(c?.email_assunto && c?.email_corpo);
      const email = rascunho ? { assunto: c!.email_assunto!, corpo: c!.email_corpo! } : emailModelo(v);
      return {
        id: v.id,
        titulo: v.titulo,
        empresa: v.empresa || "Empresa não informada",
        nota: Math.round(v.nota ?? 0),
        lista: v.lista ?? "principal",
        detalhe: `${fonte(v.fonte)} · ${origemEmail(v.email_origem)}`,
        href: idUrl(v.id),
        para: c?.email_para || v.email_contato!,
        assunto: email.assunto,
        corpo: email.corpo,
        rascunho,
      };
    });

  return (
    <Moldura
      atual="/lote"
      titulo="Envio em lote"
      subtitulo="Escolha as vagas, confira os emails e coloque na fila. O envio acontece em segundo plano, com o currículo em anexo."
    >
      {!pronta ? (
        <Link href="/configuracoes" className="faixa aviso">
          <Icone nome="alerta" /> O banco ainda não tem as colunas da fila. Rode de novo o supabase/schema.sql no Supabase (não apaga nada).
        </Link>
      ) : null}
      {falhou ? <div className="faixa aviso" role="status"><Icone nome="alerta" /> Não consegui ler o banco agora. Tente recarregar.</div> : null}

      <section className="lote-numeros" aria-label="Envio de hoje">
        <div><strong>{hoje}<small>/{e.limiteDiario}</small></strong><span>emails enviados hoje</span></div>
        <div><strong>{fila.esperando.length}</strong><span>na fila</span></div>
        <div><strong>{e.horario[0]}h–{e.horario[1]}h</strong><span>horário de envio</span></div>
        <div><strong>{e.intervalo[0] / 60}–{e.intervalo[1] / 60} min</strong><span>entre um email e outro</span></div>
      </section>

      <Fila
        esperando={fila.esperando.map((c) => ({ id: c.vaga_id, titulo: c.vaga?.titulo ?? c.vaga_id, para: c.email_para ?? "", desde: c.fila_em ? fmt.format(new Date(c.fila_em)) : "", href: idUrl(c.vaga_id) }))}
        falharam={fila.falharam.map((c) => ({ id: c.vaga_id, titulo: c.vaga?.titulo ?? c.vaga_id, para: c.email_para ?? "", erro: c.fila_erro ?? "", href: idUrl(c.vaga_id) }))}
        porRodada={e.porRodada}
      />

      {/* key: quando a lista muda no servidor (fila, desfazer), o componente recomeça com ela */}
      <Lote key={itens.map((i) => i.id).join(",")} itens={itens} restamHoje={Math.max(0, restam - fila.esperando.length)} limite={e.limiteDiario} desligado={!pronta} />
      {excluidas ? <p className="dica" style={{ marginTop: 10 }}>{excluidas} vaga(s) com email de domínio excluído não aparecem aqui (dominios_email_excluidos).</p> : null}
      {e.automatico ? (
        <p className="dica" style={{ marginTop: 10 }}>Modo automático ligado: vagas novas da lista principal com nota {e.automaticoNota}+ entram na fila sozinhas a cada coleta.</p>
      ) : null}
    </Moldura>
  );
}
