"""Uso dos serviços grátis: mede o que dá para medir e guarda no banco (página "Uso dos serviços" do site).

Roda no fim de cada coleta. Mede:
- GitHub Actions: minutos usados no mês (soma das execuções do repositório) e se o repositório é privado
  (privado: 2.000 min/mês grátis; público: sem limite);
- Supabase: tamanho do banco (grátis até 500 MB) e dos arquivos (grátis até 1 GB);
- Apify: dólares usados no ciclo do mês (crédito grátis de US$ 5).

Gemini e Gmail são contados por quem usa (site e coletor), em uso_diario. A Vercel não tem como ser medida sem
um token de conta, então o site só mostra os limites dela.

Passou de 80% de algum limite: manda um alerta por email (uma vez, quando cruza a linha).
Uso:  python -m coletor.uso
"""
from __future__ import annotations

import logging
import math
import os
from datetime import datetime, timezone

import requests

from . import alerta
from .armazenamento import Supabase

log = logging.getLogger("uso")

LIMITE_GITHUB_PRIVADO = 2000  # minutos/mês de Actions no plano grátis (repositório privado)
LIMITE_BANCO = 500 * 1024 * 1024  # Supabase grátis: 500 MB de banco
LIMITE_ARQUIVOS = 1024 * 1024 * 1024  # Supabase grátis: 1 GB de arquivos
ALERTA = 0.8  # avisa por email ao passar de 80%

_GH = "https://api.github.com"


def _data(texto: str | None) -> datetime | None:
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00")) if texto else None
    except ValueError:
        return None


def minutos_das_execucoes(execucoes: list[dict]) -> tuple[int, dict[str, int]]:
    """Minutos no estilo da cobrança do GitHub (cada execução arredonda para cima) e o total por workflow."""
    total, por_workflow = 0, {}
    for e in execucoes:
        inicio, fim = _data(e.get("run_started_at")), _data(e.get("updated_at"))
        if not inicio or not fim or e.get("status") != "completed":
            continue
        m = max(1, math.ceil((fim - inicio).total_seconds() / 60))
        total += m
        nome = e.get("name") or "?"
        por_workflow[nome] = por_workflow.get(nome, 0) + m
    return total, por_workflow


def medir_github(repo: str, token: str, agora: datetime | None = None) -> dict:
    agora = agora or datetime.now(timezone.utc)
    h = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    info = requests.get(f"{_GH}/repos/{repo}", headers=h, timeout=30)
    info.raise_for_status()
    privado = bool(info.json().get("private"))
    inicio_mes = agora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    execucoes: list[dict] = []
    for pagina in range(1, 30):
        r = requests.get(f"{_GH}/repos/{repo}/actions/runs", headers=h, timeout=30, params={
            "created": f">={inicio_mes:%Y-%m-%d}", "per_page": 100, "page": pagina})
        r.raise_for_status()
        lote = r.json().get("workflow_runs", [])
        execucoes += lote
        if len(lote) < 100:
            break
    minutos, por_workflow = minutos_das_execucoes(execucoes)
    return {"privado": privado, "minutos": minutos, "limite": LIMITE_GITHUB_PRIVADO if privado else None,
            "execucoes": len(execucoes), "por_workflow": por_workflow, "mes": f"{inicio_mes:%Y-%m}"}


def medir_supabase(sb: Supabase) -> dict:
    return {"banco_bytes": int(sb.rpc("tamanho_banco") or 0), "banco_limite": LIMITE_BANCO,
            "arquivos_bytes": sb.tamanho_arquivos(), "arquivos_limite": LIMITE_ARQUIVOS}


def medir_apify(token: str) -> dict:
    r = requests.get("https://api.apify.com/v2/users/me/limits", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    r.raise_for_status()
    d = r.json().get("data") or {}
    ciclo = d.get("monthlyUsageCycle") or {}
    return {"usado_usd": round(float((d.get("current") or {}).get("monthlyUsageUsd") or 0), 4),
            "limite_usd": float((d.get("limits") or {}).get("maxMonthlyUsageUsd") or 5),
            "ciclo_inicio": ciclo.get("startAt"), "ciclo_fim": ciclo.get("endAt")}


def fracao(servico: str, d: dict) -> float:
    """Quanto do limite grátis já foi usado (0 a 1). 0 quando não há limite (ex.: repositório público)."""
    if servico == "github":
        return d["minutos"] / d["limite"] if d.get("limite") else 0.0
    if servico == "supabase":
        return max(d["banco_bytes"] / d["banco_limite"], d["arquivos_bytes"] / d["arquivos_limite"])
    if servico == "apify":
        return d["usado_usd"] / d["limite_usd"] if d.get("limite_usd") else 0.0
    return 0.0


_NOMES = {"github": "GitHub Actions", "supabase": "Supabase", "apify": "Apify (posts do LinkedIn)"}


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sb = Supabase.do_ambiente()
    if not sb:
        log.info("sem Supabase: nada a medir")
        return
    medidas = []
    repo, gh = os.getenv("GITHUB_REPOSITORY"), os.getenv("GITHUB_TOKEN")
    if repo and gh:
        medidas.append(("github", lambda: medir_github(repo, gh)))
    medidas.append(("supabase", lambda: medir_supabase(sb)))
    if os.getenv("APIFY_TOKEN"):
        medidas.append(("apify", lambda: medir_apify(os.environ["APIFY_TOKEN"])))

    cruzaram = []
    for servico, medir in medidas:
        try:
            dados = medir()
        except Exception as e:  # um serviço fora do ar não impede medir os outros
            log.warning("uso: não medi %s: %s", servico, e)
            continue
        f = fracao(servico, dados)
        try:
            antes = sb.ler_uso(servico)
            sb.registrar_uso(servico, dados)
        except Exception as e:
            log.warning("uso: não gravei %s (rode o SQL novo do supabase/schema.sql): %s", servico, e)
            continue
        if f >= ALERTA and (not antes or fracao(servico, antes) < ALERTA):
            cruzaram.append(f"{_NOMES[servico]}: {f:.0%} do limite grátis usado.")
        resumo = {"github": lambda: f"{dados['minutos']} min no mês" + (f" de {dados['limite']}" if dados["limite"] else " (repositório público, sem limite)"),
                  "supabase": lambda: f"banco {dados['banco_bytes'] / 1e6:.1f} MB de 500; arquivos {dados['arquivos_bytes'] / 1e6:.2f} MB de 1024",
                  "apify": lambda: f"US$ {dados['usado_usd']:.2f} de {dados['limite_usd']:.2f} no ciclo"}[servico]()
        texto = f"{_NOMES[servico]}: {resumo}"
        log.info(texto)
        if os.getenv("GITHUB_ACTIONS") == "true":
            print(f"::notice title=uso::{texto}", flush=True)
    if cruzaram:
        try:
            alerta.enviar("Um serviço grátis passou de 80% do limite", [*cruzaram, "", "Veja os detalhes na página Uso dos serviços do site."])
        except Exception as e:
            log.warning("uso: alerta não enviado: %s", e)


if __name__ == "__main__":
    main()
