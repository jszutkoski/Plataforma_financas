import { fmtBRL, fmtCompact } from '@pat/lib/format'

export const CORES = {
  renda: 'var(--renda)', gastos: 'var(--gastos)', invest: 'var(--invest)', saldo: 'var(--saldo)', resgate: 'var(--resgate)',
  serie: ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)', 'var(--s7)', 'var(--s8)'], outros: 'var(--outros)',
  grupo: { Fixas: 'var(--s7)', 'Variáveis': 'var(--s2)', Extras: 'var(--s4)', Adicionais: 'var(--s5)' } as Record<string, string>,
}
export const eixo = { stroke: 'var(--axis)', tick: { fill: 'var(--muted)', fontSize: 11 }, tickLine: false, axisLine: false } as const
export const grade = { stroke: 'var(--grid)', strokeDasharray: '0', vertical: false } as const
export const tickBRL = (v: number) => fmtCompact(v)

interface TipProps { active?: boolean; payload?: { name?: string; value?: number | string; color?: string; dataKey?: string; payload?: Record<string, unknown> }[]; label?: string | number }

/** Tooltip padrão: título + linhas "nome: R$". */
export function Tip({ active, payload, label, titulo, extra }: TipProps & { titulo?: (label: string | number | undefined, row?: Record<string, unknown>) => string; extra?: (row: Record<string, unknown>) => string | null }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload ?? {}
  return (
    <div className="viz-tooltip">
      <div className="font-medium mb-1">{titulo ? titulo(label, row) : label}</div>
      {payload.filter((p) => p.value != null && p.value !== 0 || payload.length === 1).map((p, i) => (
        <div key={i} className="flex items-center gap-2 tnum">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="ml-auto font-medium">{fmtBRL(Number(p.value))}</span>
        </div>
      ))}
      {extra && extra(row) && <div className="text-muted mt-1">{extra(row)}</div>}
    </div>
  )
}

export function Legenda({ itens }: { itens: { nome: string; cor: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 mt-2" aria-label="Legenda">
      {itens.map((i) => <li key={i.nome} className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: i.cor }} />{i.nome}</li>)}
    </ul>
  )
}
