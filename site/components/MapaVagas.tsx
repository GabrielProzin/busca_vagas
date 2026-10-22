"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { GrupoMapa, PontoMapa } from "@/lib/tipos";

// Gráfico de dispersão das vagas: cada ponto é uma vaga, vagas parecidas ficam perto.
// Cor = grupo; tamanho = nota; a estrela é o seu currículo. Passe o mouse (ou toque) para ver a vaga.

// Tamanho lógico do desenho: largo no computador, quase quadrado no celular (pontos maiores na tela pequena).
const GRANDE = { L: 1000, A: 640, M: 28, escala: 1 };
const PEQUENO = { L: 520, A: 560, M: 18, escala: 1.15 };

function estrela(cx: number, cy: number, r: number): string {
  const p: string[] = [];
  for (let i = 0; i < 10; i++) {
    const raio = i % 2 ? r * 0.45 : r;
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    p.push(`${(cx + raio * Math.cos(ang)).toFixed(1)},${(cy + raio * Math.sin(ang)).toFixed(1)}`);
  }
  return p.join(" ");
}

export default function MapaVagas({ pontos, grupos, cv }: { pontos: PontoMapa[]; grupos: GrupoMapa[]; cv: { x: number; y: number } | null }) {
  const [ativos, setAtivos] = useState<Set<number>>(() => new Set(grupos.map((g) => g.id)));
  const [soLista, setSoLista] = useState(false);
  const [foco, setFoco] = useState<PontoMapa | null>(null);
  const nomes = useMemo(() => new Map(grupos.map((g) => [g.id, g.nome])), [grupos]);
  const [pequeno, setPequeno] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 640px)");
    const mudar = () => setPequeno(m.matches);
    mudar();
    m.addEventListener("change", mudar);
    return () => m.removeEventListener("change", mudar);
  }, []);
  const { L, A, M, escala } = pequeno ? PEQUENO : GRANDE;
  const pos = (x: number, y: number) => ({ cx: M + x * (L - 2 * M), cy: M + (1 - y) * (A - 2 * M) });

  const visiveis = pontos.filter((p) => ativos.has(p.grupo) && (!soLista || p.lista !== "fora"));
  // Pontos da lista por cima dos "fora da lista".
  const ordenados = [...visiveis].sort((a, b) => Number(a.lista !== "fora") - Number(b.lista !== "fora"));
  const alternar = (id: number) =>
    setAtivos((s) => {
      const novo = new Set(s);
      if (novo.has(id) && novo.size > 1) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  const fp = foco ? pos(foco.x, foco.y) : null;

  return (
    <div className="mapa">
      <div className="mapa-filtros" role="group" aria-label="Filtros do mapa">
        {grupos.map((g) => (
          <button key={g.id} type="button" className={`mapa-chip g${g.id}`} aria-pressed={ativos.has(g.id)} onClick={() => alternar(g.id)}>
            <i aria-hidden /> {g.nome} <b>{g.vagas}</b>
          </button>
        ))}
        <label className="mapa-so-lista">
          <input type="checkbox" checked={soLista} onChange={(e) => setSoLista(e.target.checked)} /> Só as vagas da sua lista
        </label>
      </div>

      <div className="mapa-area" onMouseLeave={() => setFoco(null)}>
        <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={`Mapa com ${visiveis.length} vagas em ${ativos.size} grupos`}>
          {ordenados.map((p) => {
            const { cx, cy } = pos(p.x, p.y);
            const r = (4 + (Math.max(0, Math.min(100, p.nota ?? 0)) / 100) * 6) * escala;
            return (
              <circle
                key={p.id}
                cx={cx}
                cy={cy}
                r={foco?.id === p.id ? r + 3 : r}
                className={`mapa-ponto g${p.grupo} ${p.lista}`}
                onMouseEnter={() => setFoco(p)}
                onClick={() => setFoco(p)}
              />
            );
          })}
          {cv ? (() => {
            const { cx, cy } = pos(cv.x, cv.y);
            return (
              <g className="mapa-cv">
                <polygon points={estrela(cx, cy, 15 * escala)} />
                <text x={cx} y={cy - 20} textAnchor="middle">Seu currículo</text>
              </g>
            );
          })() : null}
        </svg>
        {foco && fp ? (
          <div
            className="mapa-dica"
            style={{ left: `${(fp.cx / L) * 100}%`, top: `${(fp.cy / A) * 100}%` }}
            data-lado={fp.cx > L * 0.6 ? "esquerda" : "direita"}
            role="status"
          >
            <span className={`mapa-dica-grupo g${foco.grupo}`}><i aria-hidden /> {nomes.get(foco.grupo)}</span>
            <b>{foco.titulo}</b>
            <span className="dica">{foco.empresa || "Empresa não informada"}{foco.nota !== null ? ` · nota ${Math.round(foco.nota)}` : ""}</span>
            <span className="dica">{foco.lista === "principal" ? "Na lista principal" : foco.lista === "vale_tentar" ? "Na lista vale tentar" : "Fora da sua lista (nota baixa)"}</span>
            {foco.no_site ? (
              <Link href={`/vaga/${encodeURIComponent(foco.id)}`}>Abrir a vaga →</Link>
            ) : foco.url ? (
              <a href={foco.url} target="_blank" rel="noopener noreferrer">Ver o anúncio →</a>
            ) : null}
          </div>
        ) : null}
      </div>
      <p className="dica mapa-legenda">
        Cada ponto é uma vaga; quanto maior, maior a nota. Pontos claros ficaram fora da sua lista. A distância entre os
        pontos mostra o quanto os textos das vagas se parecem.
      </p>
    </div>
  );
}
