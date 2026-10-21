"""Backup do busca_vagas, cifrado, guardado fora do Supabase (artefato do GitHub Actions, 14 dias).

O que entra: todas as candidaturas, as vagas ligadas a elas (as fontes apagam vagas antigas),
o histórico de coletas e o currículo em PDF. As vagas sem ação suas ficam de fora: a coleta traz de novo.

Por que cifrado: o repositório é público e qualquer conta do GitHub baixa artefatos de repositório público.
O arquivo é cifrado com AES-256-GCM e uma chave derivada (scrypt) da senha BACKUP_SENHA, que só existe
nos Secrets do GitHub e com você. Sem a senha, o arquivo não serve para nada (nem para você: guarde-a).

Uso:
  python -m coletor.backup gerar saida_backup/busca_vagas.bvbk      # lê o banco e grava o arquivo cifrado
  python -m coletor.backup verificar saida_backup/busca_vagas.bvbk  # decifra e confere com o banco
  python -m coletor.backup restaurar ARQUIVO [--de-verdade]         # sem a flag, só mostra o que faria
"""
from __future__ import annotations

import argparse
import base64
import gzip
import json
import logging
import os
import sys
from datetime import datetime, timezone

import requests
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.scrypt import Scrypt

from .armazenamento import Supabase

log = logging.getLogger(__name__)

MAGICO = b"BVBK1"
BUCKET, ARQUIVO_CV = "privado", "curriculo.pdf"


# ------------------------------------------------------------------ cifra
def _chave(senha: str, sal: bytes) -> bytes:
    return Scrypt(salt=sal, length=32, n=2**15, r=8, p=1).derive(senha.encode("utf-8"))


def cifrar(dados: bytes, senha: str) -> bytes:
    if len(senha) < 16:
        raise ValueError("BACKUP_SENHA precisa ter pelo menos 16 caracteres")
    sal, nonce = os.urandom(16), os.urandom(12)
    return MAGICO + sal + nonce + AESGCM(_chave(senha, sal)).encrypt(nonce, gzip.compress(dados), MAGICO)


def decifrar(arquivo: bytes, senha: str) -> bytes:
    if not arquivo.startswith(MAGICO):
        raise ValueError("arquivo não é um backup do busca_vagas")
    sal, nonce, corpo = arquivo[5:21], arquivo[21:33], arquivo[33:]
    return gzip.decompress(AESGCM(_chave(senha, sal)).decrypt(nonce, corpo, MAGICO))


# ------------------------------------------------------------------ leitura do banco
def _raiz(sb: Supabase) -> str:
    return sb.base[: -len("/rest/v1")]


def _tudo(sb: Supabase, tabela: str, params: dict) -> list[dict]:
    linhas, passo = [], 1000
    while True:
        r = requests.get(f"{sb.base}/{tabela}", headers={**sb.h, "Range": f"{len(linhas)}-{len(linhas) + passo - 1}"},
                         params=params, timeout=60)
        r.raise_for_status()
        lote = r.json()
        linhas += lote
        if len(lote) < passo:
            return linhas


def _vagas(sb: Supabase, ids: list[str]) -> list[dict]:
    vagas = []
    for i in range(0, len(ids), 100):
        lote = ",".join('"' + x.replace('"', "") + '"' for x in ids[i:i + 100])
        vagas += _tudo(sb, "vagas", {"select": "*", "id": f"in.({lote})"})
    return vagas


def ler_banco(sb: Supabase) -> dict:
    candidaturas = _tudo(sb, "candidaturas", {"select": "*", "order": "vaga_id"})
    vagas = _vagas(sb, [c["vaga_id"] for c in candidaturas])
    execucoes = _tudo(sb, "execucoes", {"select": "*", "order": "id"})
    cv = None
    r = requests.get(f"{_raiz(sb)}/storage/v1/object/{BUCKET}/{ARQUIVO_CV}", headers=sb.h, timeout=60)
    if r.ok:
        cv = base64.b64encode(r.content).decode()
    return {"versao": 1, "gerado_em": datetime.now(timezone.utc).isoformat(), "candidaturas": candidaturas,
            "vagas": vagas, "execucoes": execucoes, "curriculo_pdf_base64": cv}


def resumo(d: dict) -> dict:
    return {"candidaturas": len(d["candidaturas"]), "vagas": len(d["vagas"]), "execucoes": len(d["execucoes"]),
            "curriculo": bool(d.get("curriculo_pdf_base64"))}


# ------------------------------------------------------------------ comandos
def gerar(sb: Supabase, destino: str, senha: str) -> dict:
    d = ler_banco(sb)
    os.makedirs(os.path.dirname(destino) or ".", exist_ok=True)
    with open(destino, "wb") as f:
        f.write(cifrar(json.dumps(d, ensure_ascii=False, default=str).encode("utf-8"), senha))
    return resumo(d)


def verificar(sb: Supabase, arquivo: str, senha: str) -> dict:
    """Teste de restauração sem tocar no banco: decifra o arquivo e confere com o que está no banco agora."""
    with open(arquivo, "rb") as f:
        d = json.loads(decifrar(f.read(), senha))
    atual = resumo(ler_banco(sb))
    no_arquivo = resumo(d)
    if no_arquivo["candidaturas"] < atual["candidaturas"] or no_arquivo["vagas"] < atual["vagas"]:
        raise SystemExit(f"backup incompleto: arquivo {no_arquivo}, banco {atual}")
    ids_vagas = {v["id"] for v in d["vagas"]}
    sem_vaga = [c["vaga_id"] for c in d["candidaturas"] if c["vaga_id"] not in ids_vagas]
    if sem_vaga:
        raise SystemExit(f"backup com candidaturas sem a vaga: {sem_vaga[:5]}")
    return no_arquivo


def restaurar(sb: Supabase, arquivo: str, senha: str, de_verdade: bool) -> dict:
    """Devolve os dados ao banco (upsert: não apaga nada que já esteja lá)."""
    with open(arquivo, "rb") as f:
        d = json.loads(decifrar(f.read(), senha))
    info = resumo(d)
    if not de_verdade:
        return {"simulacao": True, **info}
    cab = {**sb.h, "Prefer": "resolution=merge-duplicates,return=minimal"}
    for tabela, chave, linhas in (("vagas", "id", d["vagas"]), ("candidaturas", "vaga_id", d["candidaturas"])):
        for i in range(0, len(linhas), 200):
            r = requests.post(f"{sb.base}/{tabela}", headers=cab, params={"on_conflict": chave},
                              data=json.dumps(linhas[i:i + 200], default=str), timeout=60)
            r.raise_for_status()
    if d.get("curriculo_pdf_base64"):
        r = requests.post(f"{_raiz(sb)}/storage/v1/object/{BUCKET}/{ARQUIVO_CV}",
                          headers={**sb.h, "Content-Type": "application/pdf", "x-upsert": "true"},
                          data=base64.b64decode(d["curriculo_pdf_base64"]), timeout=60)
        r.raise_for_status()
    return {"simulacao": False, **info}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("comando", choices=["gerar", "verificar", "restaurar"])
    ap.add_argument("arquivo")
    ap.add_argument("--de-verdade", action="store_true", help="restaurar: grava no banco (sem isso, só simula)")
    a = ap.parse_args()
    senha = os.getenv("BACKUP_SENHA") or ""
    sb = Supabase.do_ambiente()
    if not sb or not senha:
        print("::warning title=backup::BACKUP_SENHA ou Supabase não configurados; backup não foi feito", flush=True)
        sys.exit(0 if a.comando == "gerar" else 1)
    if a.comando == "gerar":
        r = gerar(sb, a.arquivo, senha)
    elif a.comando == "verificar":
        r = verificar(sb, a.arquivo, senha)
    else:
        r = restaurar(sb, a.arquivo, senha, a.de_verdade)
    print(f"::notice title=backup::{a.comando}: {r}", flush=True)


if __name__ == "__main__":
    main()
