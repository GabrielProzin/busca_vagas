"""Ranking que aprende com o seu uso.

Sinais (lidos do Supabase a cada coleta):
- positivos: vagas que você aplicou, mandou email ou que andaram (respondeu, entrevista, proposta, não seguiu);
- negativos: vagas que você descartou.

Modelo: no mesmo espaço de embeddings do ranking, a direção "centro das positivas menos centro das
negativas". Cada vaga nova é projetada nessa direção; quanto mais perto das que você aplicou, mais pontos.
É simples de propósito: funciona com poucas dezenas de exemplos, não precisa de treino pesado e dá para
explicar ("parecida com a vaga X que você aplicou").

Segurança da nota:
- só liga com MIN_CADA exemplos de cada lado;
- o ajuste vai de -MAX_PONTOS a +MAX_PONTOS e a força cresce com o número de exemplos (cheia em CHEIO_EM);
- o resto da nota (currículo, habilidades, trilha) continua mandando.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import numpy as np

log = logging.getLogger(__name__)

POSITIVOS = {"aplicada", "enviada", "respondeu", "entrevista", "proposta", "recusada"}
NEGATIVOS = {"descartada"}

MAX_PONTOS = 8.0
MIN_CADA = 3
CHEIO_EM = 30


@dataclass
class Exemplo:
    id: str
    titulo: str
    descricao: str
    positivo: bool


@dataclass
class Aprendizado:
    exemplos: list[Exemplo]
    max_pontos: float = MAX_PONTOS
    min_cada: int = MIN_CADA
    cheio_em: int = CHEIO_EM
    # preenchidos em preparar()
    _vetores: np.ndarray | None = field(default=None, repr=False)
    _meio: np.ndarray | None = field(default=None, repr=False)
    _direcao: np.ndarray | None = field(default=None, repr=False)
    _escala: float = 1.0
    acerto: float | None = None

    @classmethod
    def de_linhas(cls, linhas: list[dict]) -> "Aprendizado":
        """Linhas de candidaturas com a vaga embutida: {"status": ..., "vaga": {"id","titulo","descricao"}}."""
        exemplos, vistos = [], set()
        for l in linhas:
            v = l.get("vaga") or {}
            st = l.get("status")
            if not v.get("id") or v["id"] in vistos or st not in POSITIVOS | NEGATIVOS:
                continue
            vistos.add(v["id"])
            exemplos.append(Exemplo(v["id"], v.get("titulo") or "", v.get("descricao") or "", st in POSITIVOS))
        return cls(exemplos)

    @property
    def positivos(self) -> int:
        return sum(e.positivo for e in self.exemplos)

    @property
    def negativos(self) -> int:
        return len(self.exemplos) - self.positivos

    @property
    def pode_treinar(self) -> bool:
        return self.positivos >= self.min_cada and self.negativos >= self.min_cada

    @property
    def ativo(self) -> bool:
        return self.pode_treinar and self._direcao is not None

    @property
    def confianca(self) -> float:
        return min(1.0, len(self.exemplos) / self.cheio_em)

    # ------------------------------------------------------------------ treino
    @staticmethod
    def _modelo(vetores: np.ndarray, rotulos: np.ndarray) -> tuple[np.ndarray, np.ndarray, float]:
        cp, cn = vetores[rotulos].mean(axis=0), vetores[~rotulos].mean(axis=0)
        direcao = cp - cn
        meio = (cp + cn) / 2
        escala = float(np.std((vetores - meio) @ direcao)) or 1e-6
        return meio, direcao, escala

    def preparar(self, vetores: np.ndarray) -> None:
        """Recebe um vetor (normalizado) por exemplo, na mesma ordem de self.exemplos."""
        if not self.pode_treinar:
            return
        rotulos = np.array([e.positivo for e in self.exemplos])
        self._vetores = vetores
        self._meio, self._direcao, self._escala = self._modelo(vetores, rotulos)
        # Validação "deixa um de fora": para cada exemplo, treina sem ele e vê se acerta o lado.
        acertos = 0
        for i in range(len(rotulos)):
            m = np.ones(len(rotulos), bool)
            m[i] = False
            if rotulos[m].all() or not rotulos[m].any():
                continue
            meio, direcao, _ = self._modelo(vetores[m], rotulos[m])
            acertos += bool(((vetores[i] - meio) @ direcao) > 0) == bool(rotulos[i])
        self.acerto = round(acertos / len(rotulos), 3)
        log.info("aprendizado: %d positivas, %d descartadas, acerto deixa-um-de-fora %.0f%%",
                 self.positivos, self.negativos, 100 * self.acerto)

    # ------------------------------------------------------------------ uso
    def ajuste(self, vetor: np.ndarray, ignorar_id: str | None = None) -> tuple[float, str | None]:
        """Pontos a somar na nota (+/-) e o título da vaga do seu histórico mais parecida, do mesmo lado."""
        if not self.ativo:
            return 0.0, None
        z = float((vetor - self._meio) @ self._direcao) / self._escala
        pontos = self.max_pontos * math.tanh(z / 2) * self.confianca
        lado = np.array([e.positivo == (pontos > 0) and e.id != ignorar_id for e in self.exemplos])
        sims = self._vetores @ vetor
        sims[~lado] = -np.inf
        j = int(np.argmax(sims))
        return round(pontos, 1), (self.exemplos[j].titulo if np.isfinite(sims[j]) else None)

    def resumo(self) -> dict:
        return {"positivos": self.positivos, "negativos": self.negativos, "ativo": self.ativo,
                "minimo": self.min_cada, "confianca": round(self.confianca, 2), "acerto": self.acerto,
                "max_pontos": self.max_pontos}
