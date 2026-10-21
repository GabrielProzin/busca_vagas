"""Nota de compatibilidade vaga x currículo, com motivos explicáveis.

nota (0-100) = 45% semântica + 40% habilidades + 15% trilha do cargo (+5 se o título diz júnior)
               + ajuste do seu histórico (-8 a +8, ver aprendizado.py; só depois de alguns usos)

- Semântica: cada frase da vaga é comparada com cada frase do currículo usando
  embeddings multilíngues (fastembed, roda local, sem API). Para cada frase da vaga
  fica o melhor par no currículo; a nota é a média das 8 frases mais bem atendidas.
  Sem fastembed instalado, cai para TF-IDF de caracteres (bom para testes).
- Habilidades: o que a vaga pede e você tem (com peso) contra o que a vaga exige
  e não está no seu currículo. Requisito marcado como "diferencial" não penaliza.
- Trilha: Analista/BI > Engenharia > Ciência > genérico (pesos no YAML).
"""
from __future__ import annotations

import logging
import re
from dataclasses import dataclass

import numpy as np

from .aprendizado import Aprendizado
from .modelos import Vaga
from .texto import compilar, frases_relevantes, normalizar

log = logging.getLogger(__name__)

MODELO = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
_DIFERENCIAL = re.compile(r"diferencia|desejave|desejado|plus\b|nice to have|sera um bonus|e um bonus|conhecimento basico")


class Embedder:
    """fastembed (ONNX, CPU) quando disponível; TF-IDF como reserva."""

    def __init__(self, forcar_tfidf: bool = False):
        self.backend = "tfidf"
        self._modelo = None
        if not forcar_tfidf:
            try:
                import os

                from fastembed import TextEmbedding

                self._modelo = TextEmbedding(model_name=MODELO, cache_dir=os.getenv("FASTEMBED_CACHE_PATH"))
                self.backend = "fastembed"
            except Exception as e:  # sem rede para baixar o modelo, sem pacote etc.
                log.warning("embeddings: usando TF-IDF (%s)", e)
        # Faixa de similaridade que vira 0..1. Calibrado nas primeiras execuções reais.
        self.faixa = (0.30, 0.72) if self.backend == "fastembed" else (0.05, 0.45)

    def codificar(self, textos: list[str]) -> np.ndarray:
        if self.backend == "fastembed":
            m = np.array(list(self._modelo.embed(textos, batch_size=64)), dtype=np.float32)
        else:
            from sklearn.feature_extraction.text import TfidfVectorizer

            vec = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True)
            m = vec.fit_transform([normalizar(t) for t in textos]).toarray().astype(np.float32)
        norma = np.linalg.norm(m, axis=1, keepdims=True)
        return m / np.clip(norma, 1e-9, None)


@dataclass
class Habilidade:
    nome: str
    peso: float
    padrao: re.Pattern


class Ranker:
    def __init__(self, perfil: dict, curriculo_md: str, cfg: dict, embedder: Embedder | None = None):
        self.habilidades = [Habilidade(k, float(v["peso"]), compilar(v["padroes"]))
                            for k, v in perfil["habilidades"].items()]
        self.pesadas = [(p, compilar([p])) for p in cfg.get("requisitos_ausentes_pesados", [])]
        self.nota_minima = float(cfg.get("nota_minima", 45))
        self.trilha_peso = {t["nome"]: float(t["peso"]) for t in cfg["trilhas"]}
        self.emb = embedder or Embedder()
        # Frases do currículo: bullets e linhas de resumo/projetos (títulos de seção ficam de fora).
        self.cv_frases = [l.strip("- ").strip() for l in curriculo_md.splitlines()
                          if len(l.strip("- #").strip()) >= 30 and not l.startswith("#")]

    # ------------------------------------------------------------------ habilidades
    def _habilidades(self, v: Vaga) -> tuple[float, list[str], list[str], list[str]]:
        texto = normalizar(f"{v.titulo}\n{v.descricao}\n{' '.join(v.tags)}")
        ok = [h for h in self.habilidades if h.padrao.search(texto)]
        frases = [normalizar(f) for f in re.split(r"[\n.;]", texto)]
        faltando, diferenciais = [], []
        for nome, padrao in self.pesadas:
            ocorrencias = [f for f in frases if padrao.search(f)]
            if not ocorrencias:
                continue
            rotulo = nome.replace("\\b", "")
            (diferenciais if all(_DIFERENCIAL.search(f) for f in ocorrencias) else faltando).append(rotulo)
        soma = sum(h.peso for h in ok)
        if soma == 0:
            score = 0.25
        else:
            proporcao = soma / (soma + 2.5 * len(faltando))
            amplitude = min(1.0, soma / 9)
            score = 0.5 * proporcao + 0.5 * amplitude
        return score, [h.nome for h in sorted(ok, key=lambda h: -h.peso)], faltando, diferenciais

    # ------------------------------------------------------------------ ranking
    def ranquear(self, vagas: list[Vaga], aprendizado: Aprendizado | None = None) -> None:
        if not vagas:
            return
        frases_por_vaga = [frases_relevantes(f"{v.titulo}.\n{v.descricao}") or [v.titulo] for v in vagas]
        # Vagas do seu histórico entram no mesmo lote: no TF-IDF o vocabulário precisa ser o mesmo.
        exemplos = aprendizado.exemplos if aprendizado and aprendizado.pode_treinar else []
        frases_ex = [frases_relevantes(f"{e.titulo}.\n{e.descricao}") or [e.titulo or "vaga"] for e in exemplos]
        todas = (self.cv_frases + [f for fs in frases_por_vaga for f in fs] + [v.titulo for v in vagas]
                 + [f for fs in frases_ex for f in fs] + [e.titulo or "vaga" for e in exemplos])
        log.info("ranking: %d frases (%d do currículo, %d do histórico) via %s", len(todas), len(self.cv_frases),
                 sum(map(len, frases_ex)), self.emb.backend)
        matriz = self.emb.codificar(todas)
        cv = matriz[: len(self.cv_frases)]
        lo, hi = self.emb.faixa
        pos = len(self.cv_frases)
        blocos_vagas = []
        for frases in frases_por_vaga:
            blocos_vagas.append(matriz[pos: pos + len(frases)])
            pos += len(frases)
        titulos_vagas = matriz[pos: pos + len(vagas)]
        pos += len(vagas)
        blocos_ex = []
        for frases in frases_ex:
            blocos_ex.append(matriz[pos: pos + len(frases)])
            pos += len(frases)
        titulos_ex = matriz[pos: pos + len(exemplos)]
        if exemplos:
            aprendizado.preparar(np.stack([_vetor_vaga(t, b) for t, b in zip(titulos_ex, blocos_ex)]))

        for v, frases, jm, tv in zip(vagas, frases_por_vaga, blocos_vagas, titulos_vagas):
            sims = jm @ cv.T  # (frases_vaga, frases_cv)
            melhor = sims.max(axis=1)
            top = np.sort(melhor)[::-1][:8]
            sem_bruto = float(top.mean())
            sem = float(np.clip((sem_bruto - lo) / (hi - lo), 0, 1))

            hab, ok, faltando, diferenciais = self._habilidades(v)
            trilha = self.trilha_peso.get(v.trilha or "", 0.6)
            nota = 100 * (0.45 * sem + 0.40 * hab + 0.15 * trilha) + (5 if v.nivel == "junior" else 0)
            ajuste, parecida = aprendizado.ajuste(_vetor_vaga(tv, jm), v.id) if aprendizado else (0.0, None)
            v.nota = round(min(100.0, max(0.0, nota + ajuste)), 1)
            v.habilidades_ok = ok
            v.habilidades_faltando = faltando
            v.componentes = {"semantica": round(sem, 3), "semantica_bruta": round(sem_bruto, 3),
                             "habilidades": round(hab, 3), "trilha": trilha, "backend": self.emb.backend}
            if aprendizado and aprendizado.ativo:
                v.componentes["historico"] = ajuste

            motivos = []
            if ok:
                motivos.append("Pede " + ", ".join(n.replace("_", " ") for n in ok[:6]) + " — está no seu currículo")
            i, j = np.unravel_index(int(np.argmax(sims)), sims.shape)
            if sims[i, j] > lo:
                motivos.append(f"Trecho mais parecido: “{frases[i][:110]}” ↔ “{self.cv_frases[j][:110]}”")
            if faltando:
                motivos.append("Exige e não está no CV: " + ", ".join(faltando))
            if diferenciais:
                motivos.append("Diferencial que você não tem: " + ", ".join(diferenciais))
            if v.nivel == "junior":
                motivos.append("Título indica júnior")
            if abs(ajuste) >= 1 and parecida:
                lado = "aplicou" if ajuste > 0 else "descartou"
                motivos.append(f"Parecida com vagas que você {lado}, como “{parecida[:90]}” ({ajuste:+.0f} na nota)")
            v.motivos = motivos

            if v.nota < self.nota_minima:
                v.lista, v.motivo_descarte = "descartada", f"nota {v.nota} < {self.nota_minima}"
            elif faltando:
                v.lista = "vale_tentar"
            else:
                v.lista = "principal"


def _vetor_vaga(titulo: np.ndarray, frases: np.ndarray) -> np.ndarray:
    """Um vetor por vaga: metade título, metade média das frases da descrição."""
    v = titulo + frases.mean(axis=0)
    return v / max(float(np.linalg.norm(v)), 1e-9)
