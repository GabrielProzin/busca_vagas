"""Formato único de vaga, independente da fonte."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime


@dataclass
class Vaga:
    fonte: str
    id_origem: str
    titulo: str
    empresa: str
    url: str
    descricao: str = ""
    cidade: str | None = None
    estado: str | None = None
    modalidade: str | None = None  # remoto | hibrido | presencial | None
    publicada_em: datetime | None = None
    emails: list[str] = field(default_factory=list)
    termo_busca: str | None = None
    tags: list[str] = field(default_factory=list)
    site_empresa: str | None = None
    email_origem: str | None = None  # vaga (estava no texto) | site_rh | site_contato

    # Preenchidos pelos filtros/ranking
    trilha: str | None = None
    nivel: str | None = None  # junior | nao_informado
    nota: float | None = None
    lista: str | None = None  # principal | vale_tentar | descartada
    motivo_descarte: str | None = None
    motivos: list[str] = field(default_factory=list)
    habilidades_ok: list[str] = field(default_factory=list)
    habilidades_faltando: list[str] = field(default_factory=list)
    componentes: dict = field(default_factory=dict)

    @property
    def id(self) -> str:
        return f"{self.fonte}:{self.id_origem}"

    @property
    def email_contato(self) -> str | None:
        return self.emails[0] if self.emails else None

    def para_dict(self) -> dict:
        d = asdict(self)
        d["id"] = self.id
        d["email_contato"] = self.email_contato
        if self.emails and not self.email_origem:
            d["email_origem"] = "vaga"
        d["publicada_em"] = self.publicada_em.isoformat() if self.publicada_em else None
        return d
