"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Icone from "./Icone";
import { useAviso } from "./Avisos";
import { enfileirar, enviarFilaAgora, tirarDaFila } from "@/app/acoes";

export type ItemLoteTela = {
  id: string;
  titulo: string;
  empresa: string;
  nota: number;
  lista: string;
  detalhe: string;
  href: string;
  para: string;
  assunto: string;
  corpo: string;
  /** O texto veio de um rascunho salvo (não do modelo pronto). */
  rascunho: boolean;
};

// Lista de vagas novas com email: marcar, conferir/editar o email e colocar na fila.
export default function Lote({ itens, restamHoje, limite, desligado }: { itens: ItemLoteTela[]; restamHoje: number; limite: number; desligado: boolean }) {
  const [lista, setLista] = useState(itens);
  // Vêm marcadas as da lista principal; as de "vale tentar" você marca se quiser.
  const [marcadas, setMarcadas] = useState(() => new Set(itens.filter((i) => i.lista === "principal").map((i) => i.id)));
  const [aberta, setAberta] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const aviso = useAviso();
  const router = useRouter();

  const n = lista.filter((i) => marcadas.has(i.id)).length;
  const alternar = (id: string) =>
    setMarcadas((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  const editar = (id: string, campo: "para" | "assunto" | "corpo", valor: string) =>
    setLista((l) => l.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));

  function colocarNaFila() {
    const escolhidas = lista.filter((i) => marcadas.has(i.id));
    setErro(null);
    startTransition(async () => {
      const r = await enfileirar(escolhidas.map(({ id, para, assunto, corpo }) => ({ id, para, assunto, corpo })));
      if (r.erro && !r.aceitas?.length) {
        setErro(r.erro);
        return;
      }
      const aceitas = new Set(r.aceitas ?? []);
      setLista((l) => l.filter((i) => !aceitas.has(i.id)));
      if (r.erro) setErro(r.erro);
      aviso({
        texto: r.ok ?? "Na fila.",
        acao: {
          rotulo: "Desfazer",
          fazer: async () => {
            await Promise.all([...aceitas].map((id) => tirarDaFila(id)));
            router.refresh(); // a lista volta com as vagas (o texto editado fica salvo na candidatura)
          },
        },
      });
      router.refresh();
    });
  }

  if (!lista.length) {
    return (
      <section className="cartao vazio" aria-label="Vagas para enviar">
        <Icone nome="email" tamanho={32} />
        <b>Nenhuma vaga nova com email agora.</b>
        <p>As coletas trazem mais ao longo do dia. No LinkedIn, a extensão também traz posts com email.</p>
      </section>
    );
  }

  return (
    <section className="cartao lote" aria-label="Vagas para enviar">
      <div className="cartao-cabecalho lote-barra">
        <h2><Icone nome="email" /> Vagas novas com email</h2>
        <div className="lote-barra-acoes">
          <button type="button" className="botao fantasma pequeno" onClick={() => setMarcadas(n === lista.length ? new Set() : new Set(lista.map((i) => i.id)))}>
            {n === lista.length ? "Desmarcar todas" : "Marcar todas"}
          </button>
          <button type="button" className="botao primario" disabled={!n || enviando || desligado} onClick={colocarNaFila}>
            <Icone nome="lote" tamanho={16} /> {enviando ? "Colocando…" : `Colocar ${n} na fila`}
          </button>
        </div>
      </div>
      {n > restamHoje ? (
        <p className="aviso lote-limite" role="status">
          Hoje ainda cabem {restamHoje} de {limite} emails. Os outros {n - restamHoje} ficam na fila e saem amanhã, a partir das primeiras horas do horário de envio.
        </p>
      ) : null}
      {erro ? <p className="erro lote-limite" role="alert">{erro}</p> : null}
      <ul className="lote-lista">
        {lista.map((i) => (
          <li key={i.id} className={marcadas.has(i.id) ? "marcada" : undefined}>
            <label className="lote-linha">
              <input type="checkbox" checked={marcadas.has(i.id)} onChange={() => alternar(i.id)} aria-label={`Enviar para ${i.titulo}`} />
              <span className={`hoje-nota ${i.lista}`}>{i.nota}</span>
              <span className="lote-info">
                <span className="hoje-titulo">{i.titulo}</span>
                <span className="dica">{i.empresa} · {i.para}</span>
              </span>
            </label>
            <div className="lote-lado">
              {i.rascunho ? <span className="etiqueta ok">Seu rascunho</span> : null}
              <button type="button" className="botao fantasma pequeno" aria-expanded={aberta === i.id} onClick={() => setAberta(aberta === i.id ? null : i.id)}>
                {aberta === i.id ? "Fechar" : "Ver email"}
              </button>
            </div>
            {aberta === i.id ? (
              <div className="lote-email">
                <label>Para<input type="email" value={i.para} onChange={(e) => editar(i.id, "para", e.target.value)} /></label>
                <label>Assunto<input type="text" value={i.assunto} onChange={(e) => editar(i.id, "assunto", e.target.value)} /></label>
                <label>Texto<textarea rows={12} value={i.corpo} onChange={(e) => editar(i.id, "corpo", e.target.value)} /></label>
                <span className="dica">{i.detalhe} · <Link href={i.href}>abrir a vaga</Link> (lá dá para melhorar o texto com IA)</span>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Esperando = { id: string; titulo: string; para: string; desde: string; href: string };
type Falhou = { id: string; titulo: string; para: string; erro: string; href: string };

// A fila: o que está esperando (com "tirar da fila" e "enviar agora") e o que o Gmail recusou.
export function Fila({ esperando, falharam, porRodada }: { esperando: Esperando[]; falharam: Falhou[]; porRodada: number }) {
  const [ocupado, startTransition] = useTransition();
  const aviso = useAviso();
  const router = useRouter();
  if (!esperando.length && !falharam.length) return null;

  const tirar = (id: string) =>
    startTransition(async () => {
      const falha = await tirarDaFila(id);
      aviso(falha ? { texto: falha, tipo: "erro" } : { texto: "Saiu da fila e voltou para as vagas novas." });
      router.refresh();
    });
  const agora = () =>
    startTransition(async () => {
      const falha = await enviarFilaAgora();
      aviso(falha ? { texto: `Não consegui pedir o envio agora (${falha}). Ele sai na rodada de hora em hora.`, tipo: "erro" } : { texto: "Pedi o envio ao GitHub: começa em 1 ou 2 minutos." });
    });

  return (
    <section className="cartao lote-fila" aria-label="Fila de envio">
      <div className="cartao-cabecalho">
        <h2><Icone nome="relogio" /> Na fila</h2>
        {esperando.length ? (
          <button type="button" className="botao pequeno" disabled={ocupado} onClick={agora}>Enviar agora</button>
        ) : null}
      </div>
      {esperando.length ? (
        <ul className="hoje-lista">
          {esperando.map((c) => (
            <li key={c.id} className="lote-fila-item">
              <Icone nome="email" />
              <div>
                <Link href={c.href} className="hoje-titulo">{c.titulo}</Link>
                <span className="dica">{c.para} · na fila desde {c.desde}</span>
              </div>
              <button type="button" className="botao fantasma pequeno" disabled={ocupado} onClick={() => tirar(c.id)}>Tirar da fila</button>
            </li>
          ))}
        </ul>
      ) : null}
      {esperando.length > porRodada ? (
        <p className="dica cartao-corpo">Saem até {porRodada} por rodada, de hora em hora, com pausa entre eles.</p>
      ) : null}
      {falharam.length ? (
        <>
          <h3 className="lote-subtitulo">Não saíram</h3>
          <ul className="hoje-lista">
            {falharam.map((c) => (
              <li key={c.id} className="lote-fila-item">
                <Icone nome="alerta" />
                <div>
                  <Link href={c.href} className="hoje-titulo">{c.titulo}</Link>
                  <span className="dica">{c.para} · {c.erro} Ela voltou para a lista abaixo.</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
