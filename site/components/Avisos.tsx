"use client";

import { createContext, useCallback, useContext, useState } from "react";

// Avisos flutuantes ("Vaga descartada · Desfazer"). Ficam no layout, então sobrevivem à atualização da página.

type Acao = { rotulo: string; fazer: () => void | Promise<void> };
type Aviso = { id: number; texto: string; tipo?: "erro"; acao?: Acao };
type Mostrar = (a: Omit<Aviso, "id">) => void;

const Contexto = createContext<Mostrar>(() => {});

export function useAviso(): Mostrar {
  return useContext(Contexto);
}

export function ProvedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const fechar = useCallback((id: number) => setAvisos((l) => l.filter((a) => a.id !== id)), []);
  const mostrar = useCallback<Mostrar>(
    (a) => {
      const id = Date.now() + Math.random();
      setAvisos((l) => [...l.slice(-2), { ...a, id }]);
      setTimeout(() => fechar(id), a.acao ? 8000 : 5000);
    },
    [fechar],
  );
  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div className="avisos" aria-live="polite" aria-atomic="false">
        {avisos.map((a) => (
          <div key={a.id} className={`aviso-flutuante${a.tipo === "erro" ? " erro" : ""}`} role={a.tipo === "erro" ? "alert" : "status"}>
            <span>{a.texto}</span>
            {a.acao ? (
              <button
                type="button"
                className="aviso-acao"
                onClick={async () => {
                  fechar(a.id);
                  await a.acao!.fazer();
                }}
              >
                {a.acao.rotulo}
              </button>
            ) : null}
            <button type="button" className="aviso-fechar" aria-label="Fechar aviso" onClick={() => fechar(a.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}
