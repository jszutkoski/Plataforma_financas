import { useEffect, useState } from 'react'
import { MESES } from '@fin-shared/types'
import { hojeISO } from '@fin/lib/format'

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Calendário sempre visível (sem abrir pop-up): um clique escolhe o dia. Os botões ficam fora do Tab; pelo teclado, use o campo de data. */
export function Calendario({ valor, onChange }: { valor: string; onChange: (iso: string) => void }) {
  const ref = /^\d{4}-\d{2}/.test(valor) ? valor : hojeISO()
  const [vis, setVis] = useState({ ano: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) })
  // ao digitar a data no campo, o calendário acompanha o mês
  useEffect(() => { setVis({ ano: Number(ref.slice(0, 4)), mes: Number(ref.slice(5, 7)) }) }, [ref.slice(0, 7)]) // eslint-disable-line react-hooks/exhaustive-deps
  const andar = (n: number) => setVis(({ ano, mes }) => { const t = ano * 12 + mes - 1 + n; return { ano: Math.floor(t / 12), mes: (t % 12) + 1 } })
  const hoje = hojeISO()
  const inicio = new Date(vis.ano, vis.mes - 1, 1).getDay()
  const dias = new Date(vis.ano, vis.mes, 0).getDate()
  const celulas: (number | null)[] = [...Array(inicio).fill(null), ...Array.from({ length: dias }, (_, i) => i + 1)]
  return (
    <div className="rounded-lg border p-2 select-none" style={{ borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <button type="button" tabIndex={-1} className="btn-ghost !px-2 !py-0.5" onClick={() => andar(-1)} aria-label="Mês anterior">‹</button>
        <span className="text-sm font-medium">{MESES[vis.mes - 1]} {vis.ano}</span>
        <button type="button" tabIndex={-1} className="btn-ghost !px-2 !py-0.5" onClick={() => andar(1)} aria-label="Próximo mês">›</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {SEMANA.map((d, i) => <div key={i} className="text-[11px] text-muted py-0.5">{d}</div>)}
        {celulas.map((d, i) => {
          if (d == null) return <div key={`v${i}`} />
          const dia = iso(vis.ano, vis.mes, d)
          const sel = dia === valor
          return (
            <button type="button" tabIndex={-1} key={dia} onClick={() => onChange(dia)} aria-pressed={sel}
              className={`text-sm tnum rounded-md py-1 ${sel ? 'bg-renda text-white font-semibold' : 'hover:bg-surface-2'} ${!sel && dia === hoje ? 'ring-1 ring-current text-renda' : ''}`}>{d}</button>
          )
        })}
      </div>
      <div className="flex justify-end mt-1 text-xs">
        <button type="button" tabIndex={-1} className="text-renda underline" onClick={() => onChange(hoje)}>hoje</button>
      </div>
    </div>
  )
}
