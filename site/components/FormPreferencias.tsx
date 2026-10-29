"use client";

import { startTransition, useActionState, useState } from "react";
import { salvarPreferenciasBusca, type EstadoPreferencias } from "@/app/acoes";
import { NIVEIS, UFS, type Preferencias } from "@/lib/preferencias";
import Seletor from "./Seletor";
import Icone from "./Icone";

const MODOS = [
  { id: "remoto", rotulo: "Remoto", dica: "De qualquer lugar do Brasil" },
  { id: "hibrido", rotulo: "Híbrido", dica: "Só nas cidades da lista abaixo" },
  { id: "presencial", rotulo: "Presencial", dica: "Só nas cidades da lista abaixo" },
] as const;

// Tela Preferências: o que entra na lista de vagas. Tudo é validado de novo no servidor (lib/preferencias.ts).
// O estado da ação fica aqui fora; o formulário de dentro recomeça (key) quando as preferências salvas mudam,
// para mostrar os valores novos sem perder a mensagem de "salvo".
export default function PainelPreferencias({ prefs, salvasEm }: { prefs: Preferencias; salvasEm: string | null }) {
  const [estado, acao, salvando] = useActionState<EstadoPreferencias, FormData>(salvarPreferenciasBusca, null);
  return <FormPreferencias key={salvasEm ?? "padrao"} prefs={prefs} salvas={Boolean(salvasEm)} estado={estado} acao={acao} salvando={salvando} />;
}

type PropsForm = {
  prefs: Preferencias;
  salvas: boolean;
  estado: EstadoPreferencias;
  acao: (dados: FormData) => void;
  salvando: boolean;
};

function FormPreferencias({ prefs, salvas, estado, acao, salvando }: PropsForm) {
  const [uf, setUf] = useState(prefs.estado || "");
  const [mod, setMod] = useState(prefs.modalidades);
  const precisaCidade = mod.hibrido || mod.presencial;

  return (
    // Envio pelo onSubmit (e não por action): assim o React não limpa o que a pessoa digitou quando o servidor
    // devolve um erro de validação.
    <form
      className="form-prefs"
      onSubmit={(e) => {
        e.preventDefault();
        const dados = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => acao(dados));
      }}
    >
      <input type="hidden" name="estado" value={uf} />

      <fieldset className="cartao prefs-bloco">
        <legend><Icone nome="local" /> Onde você aceita trabalhar</legend>
        <div className="prefs-modos">
          {MODOS.map((m) => (
            <label key={m.id} className="prefs-modo">
              <input
                type="checkbox"
                name={m.id}
                checked={mod[m.id]}
                onChange={(e) => setMod({ ...mod, [m.id]: e.target.checked })}
              />
              <span><b>{m.rotulo}</b><small>{m.dica}</small></span>
            </label>
          ))}
        </div>
        <div className={`prefs-cidades${precisaCidade ? "" : " desligado"}`}>
          <label>
            Cidades para híbrido e presencial (uma por linha)
            <textarea name="cidades" defaultValue={prefs.cidades.join("\n")} placeholder={"Goiânia\nAparecida de Goiânia"} readOnly={!precisaCidade} aria-disabled={!precisaCidade} />
          </label>
          <div className="prefs-lado">
            <div className="campo-rotulo">
              <span>Estado</span>
              <Seletor estilo="campo" rotuloAcessivel="Estado" valor={uf} onEscolher={setUf} opcoes={[{ valor: "", rotulo: "Sem estado" }, ...UFS.map((u) => ({ valor: u, rotulo: u }))]} />
              <small className="dica">Vagas que citam outro estado ficam de fora.</small>
            </div>
            <label>
              Como a sua região aparece nos textos
              <input type="text" name="regiao" maxLength={40} defaultValue={prefs.regiao} placeholder="Goiânia" />
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className="cartao prefs-bloco">
        <legend><Icone nome="ranking" /> Nível e experiência</legend>
        <div className="prefs-niveis" role="group" aria-label="Níveis aceitos">
          {NIVEIS.map((n) => (
            <label key={n.id} className="prefs-chip">
              <input type="checkbox" name={`nivel_${n.id}`} defaultChecked={prefs.niveis.includes(n.id)} />
              <span>{n.rotulo}</span>
            </label>
          ))}
        </div>
        <p className="dica">Cargos de liderança (coordenador, gerente, head…) ficam sempre de fora.</p>
        <label className="prefs-anos">
          Descartar vagas que pedem mais de
          <input type="number" name="max_anos" min={0} max={15} defaultValue={prefs.max_anos} inputMode="numeric" />
          anos de experiência
        </label>
      </fieldset>

      <fieldset className="cartao prefs-bloco">
        <legend><Icone nome="busca" /> O que buscar e o que evitar</legend>
        <div className="prefs-duas">
          <label>
            Cargos e termos de busca (um por linha)
            <textarea name="termos_busca" defaultValue={prefs.termos_busca.join("\n")} placeholder={"analista de dados\nengenheiro de dados"} />
            <small className="dica">Cada termo vira uma busca nas plataformas.</small>
          </label>
          <label>
            Palavras que eliminam a vaga pelo título (uma por linha)
            <textarea name="palavras_bloqueadas" defaultValue={prefs.palavras_bloqueadas.join("\n")} placeholder={"marketing\nvendas"} />
            <small className="dica">Somam às do arquivo de configuração (desenvolvedor, suporte…).</small>
          </label>
        </div>
        <label className="prefs-check">
          <input type="checkbox" name="aceita_ingles" defaultChecked={prefs.aceita_ingles} />
          <span>Aceitar vagas com a descrição em inglês</span>
        </label>
      </fieldset>

      <div className="prefs-rodape">
        <span className="dica">Valem a partir da próxima coleta. As vagas já na lista que ficarem fora do local saem dela.</span>
        <div className="linha-botoes">
          {salvas ? (
            <button type="submit" name="acao" value="padrao" className="botao fantasma" disabled={salvando} formNoValidate>
              Voltar ao padrão
            </button>
          ) : null}
          <button type="submit" name="acao" value="salvar" className="botao primario" disabled={salvando}>
            <Icone nome="check" tamanho={16} /> {salvando ? "Salvando…" : "Salvar preferências"}
          </button>
        </div>
      </div>
      {estado?.erro ? <p className="erro" role="alert">{estado.erro}</p> : null}
      {estado?.ok ? <p className="faixa ok" role="status"><Icone nome="check" /> {estado.ok}</p> : null}
    </form>
  );
}
