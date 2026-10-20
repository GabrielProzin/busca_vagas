"""Grava o resultado no Supabase (se configurado) e sempre em JSON local."""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

import requests

from .modelos import Vaga

log = logging.getLogger(__name__)

_COLUNAS_VAGA = ["id", "fonte", "titulo", "empresa", "url", "descricao", "cidade", "estado", "modalidade",
                 "publicada_em", "email_contato", "emails", "trilha", "nivel", "nota", "lista", "motivos",
                 "habilidades_ok", "habilidades_faltando", "componentes", "termo_busca"]


def salvar_json(vagas: list[Vaga], execucao: dict, pasta: str = "saida") -> Path:
    Path(pasta).mkdir(exist_ok=True)
    caminho = Path(pasta) / f"vagas_{datetime.now(timezone.utc):%Y-%m-%d}.json"
    caminho.write_text(json.dumps({"execucao": execucao, "vagas": [v.para_dict() for v in vagas]},
                                  ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return caminho


class Supabase:
    def __init__(self, url: str, chave: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": chave, "Content-Type": "application/json"}
        # Chaves antigas (JWT "service_role") também vão no Authorization; as novas (sb_secret_...) só no apikey.
        if not chave.startswith("sb_"):
            self.h["Authorization"] = f"Bearer {chave}"

    @classmethod
    def do_ambiente(cls) -> "Supabase | None":
        url, chave = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        return cls(url, chave) if url and chave else None

    def upsert_vagas(self, vagas: list[Vaga]) -> None:
        agora = datetime.now(timezone.utc).isoformat()
        linhas = []
        for v in vagas:
            d = v.para_dict()
            linha = {k: d[k] for k in _COLUNAS_VAGA}
            linha["atualizada_em"] = agora
            linhas.append(linha)
        # "primeira_vez_em" fica de fora do payload, então o upsert preserva o valor original.
        for i in range(0, len(linhas), 200):
            r = requests.post(f"{self.base}/vagas", headers={**self.h, "Prefer": "resolution=merge-duplicates"},
                              params={"on_conflict": "id"}, data=json.dumps(linhas[i:i + 200], default=str), timeout=60)
            r.raise_for_status()
        log.info("supabase: %d vagas gravadas", len(linhas))

    def registrar_execucao(self, execucao: dict) -> None:
        r = requests.post(f"{self.base}/execucoes", headers=self.h, data=json.dumps(execucao, default=str), timeout=30)
        r.raise_for_status()
