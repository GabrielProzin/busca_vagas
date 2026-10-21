"""Sessão HTTP com retry e pausa educada entre chamadas."""
from __future__ import annotations

import logging
import os
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

log = logging.getLogger(__name__)

# Identifica o robô para os sites (com o repositório de quem roda, quando estiver no GitHub Actions).
_REPO = os.getenv("GITHUB_REPOSITORY")
USER_AGENT = f"busca_vagas/0.1 (+https://github.com/{_REPO})" if _REPO else "busca_vagas/0.1"


class Http:
    def __init__(self, pausa: float = 0.6, timeout: float = 25):
        self.s = requests.Session()
        retry = Retry(total=3, backoff_factor=1.5, status_forcelist=(429, 500, 502, 503, 504),
                      allowed_methods=("GET", "POST"), respect_retry_after_header=True)
        self.s.mount("https://", HTTPAdapter(max_retries=retry))
        self.s.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json, text/html;q=0.9"})
        self.pausa = pausa
        self.timeout = timeout
        self._ultima = 0.0

    def get(self, url: str, **kw) -> requests.Response:
        espera = self.pausa - (time.monotonic() - self._ultima)
        if espera > 0:
            time.sleep(espera)
        kw.setdefault("timeout", self.timeout)
        r = self.s.get(url, **kw)
        self._ultima = time.monotonic()
        return r
