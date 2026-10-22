import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { sair } from "@/app/acoes";
import { SECOES_MAIS } from "@/lib/navegacao";

// Tela "Mais" do celular: as seções que não cabem na barra de baixo.
export default function PaginaMais() {
  return (
    <Moldura atual="/mais" titulo="Mais">
      <nav className="cartao mais-lista" aria-label="Outras seções">
        {SECOES_MAIS.map((s) => (
          <Link key={s.href} href={s.href}>
            <span className="mais-icone"><Icone nome={s.icone} tamanho={22} /></span>
            <span className="mais-texto"><b>{s.rotulo}</b><span className="dica">{s.descricao}</span></span>
            <Icone nome="voltar" tamanho={18} />
          </Link>
        ))}
      </nav>
      <form action={sair} style={{ marginTop: 16 }}>
        <button className="botao" type="submit"><Icone nome="sair" tamanho={16} /> Sair</button>
      </form>
    </Moldura>
  );
}
