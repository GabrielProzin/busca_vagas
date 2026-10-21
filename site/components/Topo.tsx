import Link from "next/link";
import { sair } from "@/app/acoes";

const LINKS = [
  { href: "/", rotulo: "Vagas" },
  { href: "/candidaturas", rotulo: "Candidaturas" },
  { href: "/painel", rotulo: "Painel" },
];

export default function Topo({ atual }: { atual: string }) {
  return (
    <header className="topo">
      <Link href="/" className="marca">
        busca<span>_</span>vagas
      </Link>
      <nav aria-label="Seções">
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
  );
}
