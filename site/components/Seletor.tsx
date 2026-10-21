"use client";

import { useEffect, useId, useRef, useState } from "react";
import Icone from "./Icone";

export type Opcao = { valor: string; rotulo: string };

type Props = {
  opcoes: Opcao[];
  valor: string;
  onEscolher: (valor: string) => void;
  /** Texto pequeno antes do valor no botão (ex.: "Cargo"). */
  prefixo?: string;
  /** Rótulo para leitores de tela. */
  rotuloAcessivel: string;
  /** "chip" (filtro arredondado), "campo" (largura total) ou "icone" (só um botão ⋯). */
  estilo?: "chip" | "campo" | "icone";
  titulo?: string;
  desabilitado?: boolean;
  alinhar?: "esquerda" | "direita";
};

// Menu suspenso próprio: o <select> nativo fica ilegível no modo escuro do Windows e não segue o visual do site.
export default function Seletor({ opcoes, valor, onEscolher, prefixo, rotuloAcessivel, estilo = "chip", titulo, desabilitado, alinhar = "esquerda" }: Props) {
  const [aberto, setAberto] = useState(false);
  const [foco, setFoco] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  const id = useId();
  const atual = opcoes.find((o) => o.valor === valor);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  useEffect(() => {
    if (aberto) (lista.current?.children[foco] as HTMLElement | undefined)?.focus();
  }, [aberto, foco]);

  function abrir() {
    setFoco(Math.max(0, opcoes.findIndex((o) => o.valor === valor)));
    setAberto(true);
  }

  function escolher(v: string) {
    setAberto(false);
    if (v !== valor) onEscolher(v);
  }

  function teclado(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setAberto(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((f) => (f + 1) % opcoes.length); }
    if (e.key === "ArrowUp") { e.preventDefault(); setFoco((f) => (f - 1 + opcoes.length) % opcoes.length); }
    if (e.key === "Tab") setAberto(false);
  }

  return (
    <div className={`seletor seletor-${estilo}`} ref={raiz} onKeyDown={teclado}>
      <button
        type="button"
        className="seletor-gatilho"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        aria-controls={id}
        aria-label={estilo === "icone" ? rotuloAcessivel : undefined}
        title={titulo}
        disabled={desabilitado}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        onKeyDown={(e) => { if ((e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") && !aberto) { e.preventDefault(); abrir(); } }}
      >
        {estilo === "icone" ? (
          <Icone nome="mais" />
        ) : (
          <>
            {prefixo ? <span className="seletor-prefixo">{prefixo}</span> : null}
            <span className="seletor-valor">{atual?.rotulo ?? "Escolher"}</span>
            <Icone nome="abaixo" tamanho={14} />
          </>
        )}
      </button>
      {aberto ? (
        <ul className={`seletor-menu ${alinhar}`} role="listbox" id={id} aria-label={rotuloAcessivel} ref={lista}>
          {estilo === "icone" && titulo ? <li className="seletor-titulo" role="presentation">{titulo}</li> : null}
          {opcoes.map((o, i) => (
            <li
              key={o.valor}
              role="option"
              aria-selected={o.valor === valor}
              tabIndex={-1}
              className={i === foco ? "focado" : undefined}
              onMouseEnter={() => setFoco(i)}
              onClick={() => escolher(o.valor)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); escolher(o.valor); } }}
            >
              <span>{o.rotulo}</span>
              {o.valor === valor ? <Icone nome="check" tamanho={15} /> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
