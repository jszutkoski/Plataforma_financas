import { MESES_CURTO } from '@fin-shared/types'

interface Props { anos: number[]; ano: number; mes: number | null; mesesComDados: number[]; onAno: (a: number) => void; onMes: (m: number | null) => void; modo: 'mensal' | 'anual'; onModo: (m: 'mensal' | 'anual') => void }

export function PeriodoSelector({ anos, ano, mes, mesesComDados, onAno, onMes, modo, onModo }: Props) {
  const lista = anos.includes(ano) ? anos : [...anos, ano].sort()
  const idx = lista.indexOf(ano)
  return (
    <div className="card p-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          <button className="btn-ghost !px-2 !py-1" onClick={() => idx > 0 && onAno(lista[idx - 1])} disabled={idx <= 0} aria-label="Ano anterior">‹</button>
          <select className="input !w-auto !py-1 font-semibold" value={ano} onChange={(e) => onAno(Number(e.target.value))} aria-label="Ano">
            {lista.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn-ghost !px-2 !py-1" onClick={() => idx < lista.length - 1 && onAno(lista[idx + 1])} disabled={idx >= lista.length - 1} aria-label="Próximo ano">›</button>
        </div>
        <div className="ml-auto flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }} role="tablist">
          <button role="tab" aria-selected={modo === 'mensal'} className={`px-3 py-1 text-sm ${modo === 'mensal' ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => onModo('mensal')}>Mensal</button>
          <button role="tab" aria-selected={modo === 'anual'} className={`px-3 py-1 text-sm ${modo === 'anual' ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => onModo('anual')}>Anual</button>
        </div>
      </div>
      <div className="grid grid-cols-6 sm:grid-cols-12 gap-1">
        {MESES_CURTO.map((m, i) => {
          const n = i + 1
          const tem = mesesComDados.includes(n)
          const ativo = modo === 'mensal' && mes === n
          return (
            <button key={m} onClick={() => { onModo('mensal'); onMes(n) }} aria-pressed={ativo}
              className={`rounded-md py-1 text-xs font-medium transition-colors ${ativo ? 'bg-renda text-white' : tem ? 'bg-surface-2 text-ink hover:bg-renda/15' : 'text-muted hover:bg-surface-2'}`}
              title={tem ? `${m}: com dados` : `${m}: sem lançamentos`}>{m}{!tem && <span className="sr-only"> (sem dados)</span>}</button>
          )
        })}
      </div>
    </div>
  )
}
