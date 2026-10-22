// Ícones de traço (24x24), desenhados aqui para não depender de biblioteca. Herdam a cor do texto.
const CAMINHOS = {
  vagas: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" /></>,
  adicionar: <><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M12 8v8M8 12h8" /></>,
  candidaturas: <path d="M21 3 10 14M21 3l-6.5 18-4-8.5L2 8.5z" />,
  painel: <path d="M5 20V11M11 20V5M17 20v-6M3 20h18" />,
  config: <><path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
  externo: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  busca: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></>,
  empresa: <path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M3 21h18M8 8h3M8 12h3M8 16h3" />,
  local: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  relogio: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  email: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  sair: <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />,
  fonte: <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />,
  ia: <><path d="M11 3.5 12.6 8l4.4 1.5-4.4 1.6L11 15.5 9.4 11 5 9.5 9.4 8z" /><path d="M18 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>,
  alerta: <><path d="M12 4 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17.2v.1" /></>,
  voltar: <path d="M15 18l-6-6 6-6" />,
  arquivo: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  mais: <><circle cx="5.5" cy="12" r="1.3" /><circle cx="12" cy="12" r="1.3" /><circle cx="18.5" cy="12" r="1.3" /></>,
  abaixo: <path d="m6 9 6 6 6-6" />,
  arrastar: <><circle cx="9" cy="6" r="1.2" /><circle cx="15" cy="6" r="1.2" /><circle cx="9" cy="12" r="1.2" /><circle cx="15" cy="12" r="1.2" /><circle cx="9" cy="18" r="1.2" /><circle cx="15" cy="18" r="1.2" /></>,
  linkedin: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10v7M8 7v.1M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></>,
  inicio: <><path d="M4 11.5 12 4.5l8 7" /><path d="M6.5 9.5V20h11V9.5" /><path d="M10 20v-5.5h4V20" /></>,
  triagem: <><rect x="5" y="4" width="14" height="16" rx="2.5" /><path d="M9 9h6M9 13h4" /><path d="m14.5 16.5 1.5 1.5 3-3" /></>,
  copiar: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></>,
  lote: <><rect x="3" y="8" width="15" height="12" rx="2" /><path d="m3.5 10 7 5 7-5M7 5h12a2 2 0 0 1 2 2v9" /></>,
  medidor: <><path d="M4 18a8 8 0 1 1 16 0" /><path d="m12 18 4-5M7 18h0M17 18h0" /></>,
  mapa: <><circle cx="6" cy="16" r="2" /><circle cx="10" cy="8" r="2" /><circle cx="17" cy="12" r="2" /><circle cx="18" cy="5" r="1.5" /><circle cx="14" cy="19" r="1.5" /></>,
  estudar: <><path d="M3 9.5 12 5l9 4.5-9 4.5z" /><path d="M7 11.5V16c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5v-4.5M21 9.5V15" /></>,
  sino: <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0" />,
} as const;

export type NomeIcone = keyof typeof CAMINHOS;

export default function Icone({ nome, tamanho = 18, className }: { nome: NomeIcone; tamanho?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={tamanho}
      height={tamanho}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
