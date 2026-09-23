import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtBRL, fmtCompact, fmtPct, nomeMesCurto } from '@pat/lib/format'
import { useStore } from '@pat/lib/store'
import { CORES, Legenda, Tip, eixo, grade, tickBRL } from './common'
import type { ResumoMes } from '@pat-shared/calc'

export interface PontoSerie { chave: string; rotulo: string; [serie: string]: number | string | null }
export interface SerieDef { key: string; nome: string; cor: string; tracejada?: boolean; tipo?: 'line' | 'area' }

const rotuloMes = (chave: string) => { const [a, m] = chave.split('-'); return `${nomeMesCurto(Number(m))}/${a.slice(2)}` }

/** Linhas mensais; meses sem dado ficam em branco (sem interpolar). Séries tracejadas = referência/estimativa. */
export function EvolucaoChart({ pontos, series, altura = 260 }: { pontos: PontoSerie[]; series: SerieDef[]; altura?: number }) {
  const { oculto } = useStore()
  if (!pontos.length) return <div className="text-sm text-muted py-6 text-center">Sem dados no intervalo.</div>
  const passo = Math.max(1, Math.ceil(pontos.length / 12))
  return (
    <div>
      <div style={{ height: altura }} className={oculto ? 'oculto' : ''}>
        <ResponsiveContainer>
          <ComposedChart data={pontos} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
            <CartesianGrid {...grade} />
            <XAxis dataKey="chave" tickFormatter={rotuloMes} {...eixo} interval={passo - 1} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <Tooltip content={<Tip titulo={(l) => rotuloMes(String(l))} />} />
            {series.map((s) => (
              <Line key={s.key} dataKey={s.key} name={s.nome} stroke={s.cor} strokeWidth={s.tracejada ? 1.5 : 2} strokeDasharray={s.tracejada ? '4 4' : undefined} dot={pontos.length < 40 ? { r: 2 } : false} activeDot={{ r: 4 }} type="monotone" connectNulls={false} isAnimationActive={false} />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={series.map((s) => ({ nome: s.nome + (s.tracejada ? ' (referência)' : ''), cor: s.cor }))} />
    </div>
  )
}

export function Donut({ itens, total, cores }: { itens: { nome: string; valor: number; nota?: string }[]; total?: number; cores?: string[] }) {
  const { oculto } = useStore()
  const t = total ?? itens.reduce((s, i) => s + i.valor, 0)
  const dados = itens.filter((i) => i.valor > 0)
  if (!dados.length) return <div className="text-sm text-muted py-6 text-center">Sem valores para compor.</div>
  const pal = cores ?? CORES.serie
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 140, height: 140 }} className="shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="var(--surface)" strokeWidth={2} isAnimationActive={false}>
              {dados.map((d, i) => <Cell key={d.nome} fill={pal[i % pal.length]} />)}
            </Pie>
            {!oculto && <Tooltip content={<Tip extra={(r) => fmtPct(t ? Number(r.valor) / t : 0)} />} />}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="text-sm space-y-1 min-w-0 flex-1">
        {dados.map((d, i) => (
          <li key={d.nome} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: pal[i % pal.length] }} />
            <span className="text-ink-2 truncate" title={d.nota}>{d.nome}{d.nota && <span className="text-muted"> *</span>}</span>
            <span className={`ml-auto tnum font-medium pl-3 ${oculto ? 'oculto' : ''}`}>{fmtBRL(d.valor)}</span>
            <span className="tnum text-muted text-xs w-12 text-right">{fmtPct(t ? d.valor / t : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function BarrasHorizontais({ itens, max = 10 }: { itens: { nome: string; valor: number }[]; max?: number }) {
  const { oculto } = useStore()
  const top = itens.slice(0, max)
  const resto = itens.slice(max)
  const dados = [...top, ...(resto.length ? [{ nome: `Demais (${resto.length})`, valor: resto.reduce((s, i) => s + i.valor, 0) }] : [])]
  if (!dados.length) return <div className="text-sm text-muted py-6 text-center">Sem dados.</div>
  return (
    <div style={{ height: Math.max(120, dados.length * 30 + 20) }} className={oculto ? 'oculto' : ''}>
      <ResponsiveContainer>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid {...grade} horizontal={false} vertical />
          <XAxis type="number" tickFormatter={tickBRL} {...eixo} />
          <YAxis type="category" dataKey="nome" width={150} {...eixo} tick={{ fill: 'var(--ink-2)', fontSize: 12 }} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip />} />
          <Bar dataKey="valor" name="Valor" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} label={{ position: 'right', fill: 'var(--ink-2)', fontSize: 11, formatter: (v: unknown) => fmtCompact(Number(v)) }}>
            {dados.map((d, i) => <Cell key={d.nome} fill={i < max ? CORES.serie[i % CORES.serie.length] : CORES.outros} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Resultado apurado e aporte líquido de cada mês do ano. */
export function ResultadoMensalChart({ meses }: { meses: ResumoMes[] }) {
  const { oculto } = useStore()
  const dados = meses.map((m) => ({ nome: nomeMesCurto(m.mes), Resultado: m.resultado, 'Aporte líquido': m.aportesLiquidos, sit: m.situacao }))
  return (
    <div>
      <div style={{ height: 220 }} className={oculto ? 'oculto' : ''}>
        <ResponsiveContainer>
          <BarChart data={dados} margin={{ left: 4, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid {...grade} />
            <XAxis dataKey="nome" {...eixo} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip extra={(r) => (r.sit === 'completo' ? null : r.sit === 'parcial' ? 'dados parciais' : 'sem registros')} />} />
            <Bar dataKey="Resultado" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
              {dados.map((d, i) => <Cell key={i} fill={(d.Resultado ?? 0) >= 0 ? CORES.invest : CORES.gastos} />)}
            </Bar>
            <Bar dataKey="Aporte líquido" fill={CORES.renda} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={[{ nome: 'Resultado apurado (positivo)', cor: CORES.invest }, { nome: 'Resultado apurado (negativo)', cor: CORES.gastos }, { nome: 'Aporte líquido (dinheiro novo)', cor: CORES.renda }]} />
    </div>
  )
}

export function ComparativoBarras({ series }: { series: { nome: string; valores: Record<string, number | null> }[] }) {
  const { oculto } = useStore()
  const chaves = Object.keys(series[0]?.valores ?? {})
  const dados = series.map((s) => ({ nome: s.nome, ...s.valores }))
  return (
    <div>
      <div style={{ height: 220 }} className={oculto ? 'oculto' : ''}>
        <ResponsiveContainer>
          <BarChart data={dados} margin={{ left: 4, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid {...grade} />
            <XAxis dataKey="nome" {...eixo} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip />} />
            {chaves.map((k, i) => <Bar key={k} dataKey={k} fill={CORES.serie[i % CORES.serie.length]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={chaves.map((k, i) => ({ nome: k, cor: CORES.serie[i % CORES.serie.length] }))} />
    </div>
  )
}
