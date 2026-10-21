import Link from "next/link";
import { notFound } from "next/navigation";
import Topo from "@/components/Topo";
import Nota from "@/components/Nota";
import { alterarStatus, salvarNotas } from "../../acoes";
import { buscarVaga } from "@/lib/db";
import { fonte, habilidade, local, quando } from "@/lib/formato";
import { ETAPAS, ROTULO_STATUS } from "@/lib/tipos";

export const dynamic = "force-dynamic";

export default async function PaginaVaga({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const v = await buscarVaga(decodeURIComponent(id));
  if (!v) notFound();
  const status = v.candidatura?.status ?? "nova";

  return (
    <>
      <Topo atual="" />
      <main className="conteudo">
        <Link href="/" className="voltar">← Voltar para as vagas</Link>
        <div className="detalhe">
          <div>
            <h1>{v.titulo}</h1>
            <div className="meta" style={{ fontSize: 15, marginTop: 8 }}>
              <span>{v.empresa || "Empresa não informada"}</span>
              <span>{local(v)}</span>
              <span>{fonte(v.fonte)}, publicada {quando(v.publicada_em)}</span>
            </div>

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

            <h2>Descrição da vaga</h2>
            <div className="descricao">{v.descricao || "A fonte não trouxe a descrição. Abra a vaga para ler."}</div>
          </div>

          <aside className="painel-lateral" aria-label="Ações">
            <Nota vaga={v} grande />
            <p className="status-atual">Situação: <b>{ROTULO_STATUS[status]}</b></p>
            {v.email_contato ? (
              <p className="status-atual">Email do recrutador: <b>{v.email_contato}</b></p>
            ) : null}
            {v.url ? (
              <a className="botao primario" href={v.url} target="_blank" rel="noopener noreferrer">Abrir vaga na {fonte(v.fonte)}</a>
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
            <form action={salvarNotas} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input type="hidden" name="id" value={v.id} />
              <label htmlFor="notas" className="status-atual">Anotações</label>
              <textarea id="notas" name="notas" defaultValue={v.candidatura?.notas ?? ""} placeholder="Contato, data da entrevista, salário combinado…" />
              <button className="botao" type="submit">Salvar anotações</button>
            </form>
          </aside>
        </div>
      </main>
    </>
  );
}
