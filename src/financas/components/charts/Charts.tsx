import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ItemCategoria, PontoDiario, ResumoMes } from '@fin/lib/analytics'
import { fmtBRL, fmtCompact, fmtDataCurta, fmtPct, nomeMesCurto } from '@fin/lib/format'
import { CORES, Legenda, Tip, eixo, grade, tickBRL } from './common'

/** Barras horizontais de categorias (top N + Outros), cor fixa por posição. */
export function CategoriasBarras({ itens, total, max = 8, onClick }: { itens: ItemCategoria[]; total: number; max?: number; onClick?: (nome: string) => void }) {
  // categorias cujo saldo do período ficou negativo (só estornos) não viram barras
  const positivos = itens.filter((i) => i.valor > 0)
  const top = positivos.slice(0, max)
  const resto = positivos.slice(max)
  const dados = [...top, ...(resto.length ? [{ nome: `Demais (${resto.length})`, valor: resto.reduce((s, i) => s + i.valor, 0), grupo: null, n: resto.length }] : [])]
  if (!dados.length) return <div className="text-sm text-muted py-6 text-center">Sem despesas no período.</div>
  const h = Math.max(160, dados.length * 30 + 20)
  return (
    <div style={{ height: h }}>
      <ResponsiveContainer>
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 64, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid {...grade} horizontal={false} vertical />
          <XAxis type="number" tickFormatter={tickBRL} {...eixo} />
          <YAxis type="category" dataKey="nome" width={150} {...eixo} tick={{ fill: 'var(--ink-2)', fontSize: 12 }} />
          <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip extra={(r) => `${fmtPct(total ? Number(r.valor) / total : 0)} do total · ${r.n} lançamento(s)`} />} />
          <Bar dataKey="valor" name="Gastos" radius={[0, 4, 4, 0]} maxBarSize={18} onClick={(d) => { const nome = (d as { payload?: { nome?: string } }).payload?.nome ?? (d as { nome?: string }).nome; if (onClick && nome && !nome.startsWith('Demais')) onClick(nome) }} cursor={onClick ? 'pointer' : undefined}
            label={{ position: 'right', fill: 'var(--ink-2)', fontSize: 11, formatter: (v: unknown) => fmtCompact(Number(v)) }}>
            {dados.map((d, i) => <Cell key={d.nome} fill={i < max ? CORES.serie[i % CORES.serie.length] : CORES.outros} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Gastos por dia (barras) + acumulado (linha). */
export function DiarioChart({ pontos }: { pontos: PontoDiario[] }) {
  const temSemDia = pontos[0]?.semDia > 0
  return (
    <div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={pontos} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid {...grade} />
            <XAxis dataKey="dia" {...eixo} interval={Math.ceil(pontos.length / 16) - 1} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip titulo={(_, r) => `Dia ${fmtDataCurta(String(r?.data))}`} extra={(r) => Number(r.semDia) > 0 ? `+ ${fmtBRL(Number(r.semDia))} de lançamentos sem dia informado (contados no dia 1 do acumulado)` : null} />} />
            <Bar dataKey="gastos" name="Gastos do dia" fill={CORES.gastos} radius={[4, 4, 0, 0]} maxBarSize={14} />
            <Line dataKey="acumulado" name="Acumulado no mês" stroke={CORES.saldo} strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="monotone" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={[{ nome: 'Gastos do dia', cor: CORES.gastos }, { nome: 'Acumulado no mês', cor: CORES.saldo }]} />
      {temSemDia && <p className="text-xs text-muted mt-1">Lançamentos sem dia informado ({fmtBRL(pontos[0].semDia)}) entram apenas no acumulado, no dia 1.</p>}
    </div>
  )
}

/** Saldo ao longo do mês (renda no dia 1, gastos abatidos dia a dia). */
export function SaldoMesChart({ pontos }: { pontos: PontoDiario[] }) {
  return (
    <div style={{ height: 200 }}>
      <ResponsiveContainer>
        <LineChart data={pontos} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid {...grade} />
          <XAxis dataKey="dia" {...eixo} interval={Math.ceil(pontos.length / 16) - 1} />
          <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
          <ReferenceLine y={0} stroke="var(--axis)" />
          <Tooltip content={<Tip titulo={(_, r) => `Dia ${fmtDataCurta(String(r?.data))}`} />} />
          <Line dataKey="saldo" name="Saldo acumulado" stroke={CORES.saldo} strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="monotone" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Renda × gastos × investimentos: mês atual, anterior e média. */
export function ComparativoChart({ series }: { series: { nome: string; r: ResumoMes | null }[] }) {
  const dados = series.filter((s) => s.r).map((s) => ({ nome: s.nome, Renda: s.r!.renda, Gastos: s.r!.gastos, Investimentos: s.r!.aportes }))
  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={dados} margin={{ left: 4, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid {...grade} />
            <XAxis dataKey="nome" {...eixo} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip />} />
            <Bar dataKey="Renda" fill={CORES.renda} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="Gastos" fill={CORES.gastos} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="Investimentos" fill={CORES.invest} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={[{ nome: 'Renda líquida', cor: CORES.renda }, { nome: 'Gastos', cor: CORES.gastos }, { nome: 'Investimentos', cor: CORES.invest }]} />
    </div>
  )
}

/** Fixas × variáveis (por natureza da despesa). */
export function GruposDonut({ porGrupo, total }: { porGrupo: Record<string, number>; total: number }) {
  const dados = Object.entries(porGrupo).filter(([, v]) => v > 0).map(([nome, valor]) => ({ nome, valor }))
  if (!dados.length) return <div className="text-sm text-muted py-6 text-center">Sem despesas.</div>
  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 140, height: 140 }} className="shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={dados} dataKey="valor" nameKey="nome" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
              {dados.map((d) => <Cell key={d.nome} fill={CORES.grupo[d.nome] ?? CORES.outros} />)}
            </Pie>
            <Tooltip content={<Tip extra={(r) => fmtPct(total ? Number(r.valor) / total : 0)} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="text-sm space-y-1 min-w-0">
        {dados.map((d) => (
          <li key={d.nome} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CORES.grupo[d.nome] ?? CORES.outros }} />
            <span className="text-ink-2 truncate">{d.nome}</span>
            <span className="ml-auto tnum font-medium pl-3">{fmtBRL(d.valor)}</span>
            <span className="tnum text-muted text-xs w-10 text-right">{fmtPct(total ? d.valor / total : 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Visão anual: renda, gastos, investimentos por mês + saldo (linha). */
export function MesesChart({ meses, onClickMes }: { meses: ResumoMes[]; onClickMes?: (mes: number) => void }) {
  const dados = meses.map((m) => ({ mes: nomeMesCurto(m.mes), n: m.mes, Renda: m.temDados ? m.renda : null, Gastos: m.temDados ? m.gastos : null, Investimentos: m.temDados ? m.aportes : null, Saldo: m.temDados ? m.saldo : null }))
  return (
    <div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={dados} margin={{ left: 4, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="20%" onClick={(s) => { const idx = (s as { activeIndex?: number | string | null })?.activeIndex; const p = idx != null ? dados[Number(idx)] : undefined; if (p?.n && onClickMes) onClickMes(p.n) }}>
            <CartesianGrid {...grade} />
            <XAxis dataKey="mes" {...eixo} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip />} />
            <Bar dataKey="Renda" fill={CORES.renda} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Gastos" fill={CORES.gastos} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Investimentos" fill={CORES.invest} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Line dataKey="Saldo" stroke={CORES.saldo} strokeWidth={2} dot={{ r: 3, fill: 'var(--surface)', strokeWidth: 2 }} activeDot={{ r: 5 }} type="monotone" connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={[{ nome: 'Renda líquida', cor: CORES.renda }, { nome: 'Gastos', cor: CORES.gastos }, { nome: 'Investimentos', cor: CORES.invest }, { nome: 'Saldo do mês', cor: CORES.saldo }]} />
    </div>
  )
}

/** Acumulado no ano. */
export function AcumuladoChart({ meses }: { meses: ResumoMes[] }) {
  let r = 0, g = 0, s = 0
  const dados = meses.filter((m) => m.temDados).map((m) => { r += m.renda; g += m.gastos; s += m.saldo; return { mes: nomeMesCurto(m.mes), 'Renda acumulada': Math.round(r), 'Gastos acumulados': Math.round(g), 'Saldo acumulado': Math.round(s) } })
  return (
    <div>
      <div style={{ height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={dados} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
            <CartesianGrid {...grade} />
            <XAxis dataKey="mes" {...eixo} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <ReferenceLine y={0} stroke="var(--axis)" />
            <Tooltip content={<Tip />} />
            <Line dataKey="Renda acumulada" stroke={CORES.renda} strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="monotone" />
            <Line dataKey="Gastos acumulados" stroke={CORES.gastos} strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="monotone" />
            <Line dataKey="Saldo acumulado" stroke={CORES.saldo} strokeWidth={2} dot={false} activeDot={{ r: 4 }} type="monotone" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={[{ nome: 'Renda acumulada', cor: CORES.renda }, { nome: 'Gastos acumulados', cor: CORES.gastos }, { nome: 'Saldo acumulado', cor: CORES.saldo }]} />
    </div>
  )
}

/** Comparação entre anos (totais ou médias mensais). */
export function AnosChart({ dados }: { dados: { ano: number; Renda: number; Gastos: number; Investimentos: number }[] }) {
  return (
    <div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer>
          <BarChart data={dados} margin={{ left: 4, right: 8, top: 8, bottom: 0 }} barGap={2} barCategoryGap="25%">
            <CartesianGrid {...grade} />
            <XAxis dataKey="ano" {...eixo} />
            <YAxis tickFormatter={tickBRL} {...eixo} width={78} />
            <Tooltip cursor={{ fill: 'var(--surface-2)' }} content={<Tip />} />
            <Bar dataKey="Renda" fill={CORES.renda} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="Gastos" fill={CORES.gastos} radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="Investimentos" fill={CORES.invest} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <Legenda itens={[{ nome: 'Renda líquida', cor: CORES.renda }, { nome: 'Gastos', cor: CORES.gastos }, { nome: 'Investimentos', cor: CORES.invest }]} />
    </div>
  )
}
