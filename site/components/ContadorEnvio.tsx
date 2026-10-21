// Emails enviados hoje / limite do dia, em destaque, com barra. Fica laranja perto do limite e vermelho no limite.
export default function ContadorEnvio({ hoje, limite, naFila }: { hoje: number; limite: number; naFila?: number }) {
  const pct = Math.min(100, Math.round((hoje / Math.max(1, limite)) * 100));
  const nivel = hoje >= limite ? "cheio" : pct >= 75 ? "perto" : "";
  const restam = Math.max(0, limite - hoje);
  return (
    <div className={`contador-envio ${nivel}`} role="group" aria-label={`${hoje} de ${limite} emails enviados hoje`}>
      <div className="contador-envio-topo">
        <span className="contador-envio-rotulo">Emails enviados hoje</span>
        <strong className="contador-envio-numero">
          {hoje}<span>/{limite}</span>
        </strong>
      </div>
      <span className="contador-envio-barra" aria-hidden><i style={{ width: `${Math.max(pct, hoje ? 3 : 0)}%` }} /></span>
      <span className="contador-envio-pe">
        {hoje >= limite ? "Limite de hoje atingido: o resto sai amanhã." : `Ainda cabem ${restam} hoje.`}
        {naFila !== undefined ? ` ${naFila} na fila.` : ""}
      </span>
    </div>
  );
}
