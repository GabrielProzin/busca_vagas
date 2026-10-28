"use client";

import { useActionState, useState } from "react";
import { analisarCV, type EstadoAnalise } from "@/app/acoes";
import Seletor, { type Opcao } from "./Seletor";
import Icone from "./Icone";

type Props = {
  /** Vagas da lista para "Para uma vaga" (as melhores primeiro). */
  vagas: Opcao[];
  /** Abre já em "Para uma vaga" com esta vaga escolhida (link "Analisar meu CV para esta vaga"). */
  vagaInicial?: string;
  iaLigada: boolean;
};

// Nova análise do currículo: geral ou para uma vaga, com o currículo do perfil ou uma versão colada.
export default function FormAnaliseCV({ vagas, vagaInicial, iaLigada }: Props) {
  const [estado, acao, analisando] = useActionState<EstadoAnalise, FormData>(analisarCV, null);
  const [tipo, setTipo] = useState<"geral" | "vaga">(vagaInicial ? "vaga" : "geral");
  const [fonte, setFonte] = useState<"perfil" | "colado">("perfil");
  const [vaga, setVaga] = useState(vagaInicial ?? vagas[0]?.valor ?? "colar");
  const opcoesVaga: Opcao[] = [...vagas, { valor: "colar", rotulo: "Colar o texto de outra vaga" }];

  return (
    <form action={acao} className="form-analise">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="fonte" value={fonte} />
      <input type="hidden" name="vaga_id" value={tipo === "vaga" ? vaga : ""} />

      <div className="form-analise-topo">
        <div className="segmentado" role="radiogroup" aria-label="Tipo de análise">
          <button type="button" role="radio" aria-checked={tipo === "geral"} onClick={() => setTipo("geral")}>Geral</button>
          <button type="button" role="radio" aria-checked={tipo === "vaga"} onClick={() => setTipo("vaga")}>Para uma vaga</button>
        </div>
        <div className="segmentado" role="radiogroup" aria-label="Currículo analisado">
          <button type="button" role="radio" aria-checked={fonte === "perfil"} onClick={() => setFonte("perfil")}>Currículo do perfil</button>
          <button type="button" role="radio" aria-checked={fonte === "colado"} onClick={() => setFonte("colado")}>Colar outra versão</button>
        </div>
      </div>

      {fonte === "colado" ? (
        <div className="form-analise-campos">
          <label>
            Nome da versão (opcional)
            <input type="text" name="versao" maxLength={60} placeholder="Ex.: versão em inglês, v3 com projetos" />
          </label>
          <label>
            Texto do currículo
            <textarea name="texto" required minLength={300} maxLength={15000} placeholder="Cole o currículo inteiro. Títulos com ## e tópicos com - ajudam a avaliar a estrutura." />
          </label>
        </div>
      ) : (
        <p className="dica">Usa o currículo em texto do perfil (o mesmo da nota das vagas).</p>
      )}

      {tipo === "vaga" ? (
        <div className="form-analise-campos">
          <div className="campo-rotulo">
            <span>Vaga</span>
            <Seletor estilo="campo" opcoes={opcoesVaga} valor={vaga} onEscolher={setVaga} rotuloAcessivel="Vaga para analisar" />
          </div>
          {vaga === "colar" ? (
            <label>
              Texto da vaga
              <textarea name="vaga_texto" required minLength={80} maxLength={15000} placeholder="Cole o título e a descrição da vaga." />
            </label>
          ) : null}
          <label>
            Perguntas do formulário (opcional, uma por linha)
            <textarea name="perguntas" className="baixo" placeholder={"Por que você quer essa vaga?\nConte sobre um projeto com dados de que se orgulha.\nQual sua pretensão salarial?"} />
          </label>
          {!iaLigada ? <p className="aviso">Sem a chave da IA, as respostas do formulário não saem; a conexão e as lacunas usam o catálogo de habilidades.</p> : null}
        </div>
      ) : null}

      <div className="email-rodape">
        <span className="dica">{iaLigada ? "Leva uns 10 segundos. Usa 1 pedido da IA (2 com perguntas)." : "Sem IA, a nota usa 3 dos 4 critérios."}</span>
        <button className="botao primario" type="submit" disabled={analisando}>
          <Icone nome="ia" tamanho={16} /> {analisando ? "Analisando…" : "Analisar"}
        </button>
      </div>
      {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
    </form>
  );
}
