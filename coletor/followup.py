"""Quando uma candidatura pede follow-up. A mesma regra está em site/lib/followup.ts.

- Só vale para quem está em "Aplicada" ou "Email enviado" (ninguém respondeu ainda).
- 15 dias depois do envio (ou do último follow-up) sem resposta -> pede follow-up.
- Depois de 2 follow-ups sem resposta, 15 dias depois sugere mover para "Não seguiu".
"""
from __future__ import annotations

from datetime import datetime, timezone

DIAS = 15
MAXIMO = 2
ABERTOS = ("aplicada", "enviada")


def _data(texto: str | None) -> datetime | None:
    if not texto:
        return None
    try:
        return datetime.fromisoformat(texto.replace("Z", "+00:00"))
    except ValueError:
        return None


def situacao(c: dict, agora: datetime | None = None) -> tuple[str, int] | None:
    """("followup" | "encerrar", dias sem resposta) ou None se ainda não é hora."""
    if c.get("status") not in ABERTOS:
        return None
    base = _data(c.get("followup_em")) or _data(c.get("enviada_em")) or _data(c.get("atualizada_em"))
    if not base:
        return None
    dias = ((agora or datetime.now(timezone.utc)) - base).days
    if dias < DIAS:
        return None
    return ("encerrar" if (c.get("followups") or 0) >= MAXIMO else "followup"), dias
