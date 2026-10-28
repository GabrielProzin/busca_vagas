import Link from "next/link";
import Moldura from "@/components/Moldura";
import Icone from "@/components/Icone";
import { sair } from "@/app/acoes";
import { MODULOS, SECOES_MAIS } from "@/lib/navegacao";

// Tela "Mais" do celular: as seções que não cabem na barra de baixo, por módulo.
export default function PaginaMais() {
  return (
    <Moldura atual="/mais" titulo="Mais">
      <nav aria-label="Outras seções">
      {MODULOS.map((m) => {
        const itens = SECOES_MAIS.filter((s) => s.modulo === m.id);
        if (!itens.length) return null;
        return (
          <section key={m.id} aria-label={m.rotulo}>
            <h2 className="secao-titulo">{m.rotulo}</h2>
            <div className="cartao mais-lista">
              {itens.map((s) => (
                <Link key={s.href} href={s.href}>
                  <span className="mais-icone"><Icone nome={s.icone} tamanho={22} /></span>
                  <span className="mais-texto"><b>{s.rotulo}</b><span className="dica">{s.descricao}</span></span>
                  <Icone nome="voltar" tamanho={18} />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
      </nav>
      <form action={sair} style={{ marginTop: 16 }}>
        <button className="botao" type="submit"><Icone nome="sair" tamanho={16} /> Sair</button>
      </form>
    </Moldura>
  );
}
