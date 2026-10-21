"""Monitor de uso dos serviços: cálculo de minutos, frações do limite e alerta só ao cruzar 80%."""
from __future__ import annotations

from datetime import datetime, timezone

from coletor import uso


def execucao(nome, inicio, fim, status="completed"):
    return {"name": nome, "run_started_at": inicio, "updated_at": fim, "status": status}


def test_minutos_arredondam_por_execucao():
    total, por = uso.minutos_das_execucoes([
        execucao("Coleta", "2026-10-21T10:00:00Z", "2026-10-21T10:05:10Z"),   # 5m10s -> 6
        execucao("Envio", "2026-10-21T11:00:00Z", "2026-10-21T11:00:20Z"),    # 20s -> 1
        execucao("Envio", "2026-10-21T12:00:00Z", "2026-10-21T12:00:00Z", status="in_progress"),  # ainda rodando: fora
    ])
    assert total == 7 and por == {"Coleta": 6, "Envio": 1}


def test_fracoes_do_limite():
    assert uso.fracao("github", {"minutos": 1000, "limite": 2000}) == 0.5
    assert uso.fracao("github", {"minutos": 5000, "limite": None}) == 0.0  # repositório público: sem limite
    assert uso.fracao("apify", {"usado_usd": 4.5, "limite_usd": 5}) == 0.9
    sb = {"banco_bytes": 50 * 2**20, "banco_limite": 500 * 2**20, "arquivos_bytes": 0, "arquivos_limite": 2**30}
    assert abs(uso.fracao("supabase", sb) - 0.1) < 1e-9


def test_alerta_so_quando_cruza_80(monkeypatch):
    class Sb:
        def __init__(self, antes):
            self.antes, self.gravado = antes, None

        def ler_uso(self, s):
            return self.antes

        def registrar_uso(self, s, d):
            self.gravado = d

        def rpc(self, nome, args=None):
            return 0

        def tamanho_arquivos(self):
            return 0

    alertas = []
    monkeypatch.setattr(uso.alerta, "enviar", lambda titulo, linhas: alertas.append(linhas))
    monkeypatch.setenv("APIFY_TOKEN", "x")
    monkeypatch.delenv("GITHUB_TOKEN", raising=False)
    for antes, agora, esperado in [(3.0, 4.2, 1), (4.1, 4.3, 0), (None, 4.5, 1)]:
        alertas.clear()
        sb = Sb({"usado_usd": antes, "limite_usd": 5} if antes is not None else None)
        monkeypatch.setattr(uso.Supabase, "do_ambiente", classmethod(lambda cls, sb=sb: sb))
        monkeypatch.setattr(uso, "medir_apify", lambda t, a=agora: {"usado_usd": a, "limite_usd": 5, "ciclo_inicio": None, "ciclo_fim": None})
        uso.main()
        assert len(alertas) == esperado, (antes, agora)
        assert sb.gravado["usado_usd"] == agora


def test_medir_github_soma_o_mes(monkeypatch):
    class R:
        def __init__(self, j):
            self.j = j

        def raise_for_status(self):
            pass

        def json(self):
            return self.j

    chamadas = []

    def get(url, headers=None, timeout=None, params=None):
        chamadas.append((url, params))
        if url.endswith("/actions/runs"):
            return R({"workflow_runs": [execucao("Coleta", "2026-10-02T10:00:00Z", "2026-10-02T10:03:00Z")]})
        return R({"private": True})

    monkeypatch.setattr(uso.requests, "get", get)
    d = uso.medir_github("dono/repo", "t", agora=datetime(2026, 10, 21, tzinfo=timezone.utc))
    assert d == {"privado": True, "minutos": 3, "limite": 2000, "execucoes": 1, "por_workflow": {"Coleta": 3}, "mes": "2026-10"}
    assert chamadas[1][1]["created"] == ">=2026-10-01"
