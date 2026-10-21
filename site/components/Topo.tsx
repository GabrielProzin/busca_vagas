import Link from "next/link";
import { sair } from "@/app/acoes";

// Ícones simples em SVG (traço), herdam a cor do texto.
const I = {
  vagas: <path d="M4 6h16M4 12h10M4 18h6" />,
  adicionar: <path d="M12 5v14M5 12h14" />,
  candidaturas: <path d="M5 4h14v16l-7-4-7 4z" />,
  painel: <path d="M5 20V10M12 20V4M19 20v-7" />,
  config: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />,
};

const LINKS = [
  { href: "/", rotulo: "Vagas", curto: "Vagas", icone: I.vagas },
  { href: "/adicionar", rotulo: "Adicionar vaga", curto: "Adicionar", icone: I.adicionar },
  { href: "/candidaturas", rotulo: "Candidaturas", curto: "Candidaturas", icone: I.candidaturas },
  { href: "/painel", rotulo: "Painel", curto: "Painel", icone: I.painel },
  { href: "/configuracoes", rotulo: "Configurações", curto: "Ajustes", icone: I.config },
];

export default function Topo({ atual }: { atual: string }) {
  return (
    <>
      <header className="topo">
        <Link href="/" className="marca">
          busca<span>_</span>vagas
        </Link>
        <nav aria-label="Seções" className="nav-topo">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={atual === l.href ? "page" : undefined}>
              {l.rotulo}
            </Link>
          ))}
        </nav>
        <form action={sair}>
          <button className="botao discreto" type="submit">Sair</button>
        </form>
      </header>
      {/* No celular, a navegação vira uma barra fixa embaixo, ao alcance do polegar. */}
      <nav aria-label="Seções" className="nav-baixo">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={atual === l.href ? "page" : undefined}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              {l.icone}
            </svg>
            <span>{l.curto}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
