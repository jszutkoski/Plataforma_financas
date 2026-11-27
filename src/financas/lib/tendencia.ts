import type { Lancamento } from '@fin-shared/types'
import { mesAnterior } from './analytics'

const r2 = (v: number) => Math.round(v * 100) / 100
const chave = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`

export interface PontoTendencia { ano: number; mes: number; valor: number; media3: number | null }

/**
 * Gastos mensais de uma categoria (ou subcategoria) nos `n` meses até `ate`, com média móvel de 3 meses.
 * Meses sem gasto entram como zero (não somem do gráfico).
 */
export function serieCategoria(L: Lancamento[], categoria: string, subcategoria: string | null, ate: { ano: number; mes: number }, n = 24): PontoTendencia[] {
  const meses: { ano: number; mes: number }[] = []
  let cur = ate
  for (let i = 0; i < n; i++) { meses.unshift(cur); cur = mesAnterior(cur.ano, cur.mes) }
  const soma = new Map<string, number>()
  for (const l of L) {
    if (l.foraDoFluxo || l.tipo !== 'despesa' || l.categoria !== categoria) continue
    if (subcategoria != null && l.subcategoria !== subcategoria) continue
    const k = chave(l.ano, l.mes)
    soma.set(k, (soma.get(k) ?? 0) + l.valor)
  }
  const valores = meses.map((m) => r2(soma.get(chave(m.ano, m.mes)) ?? 0))
  return meses.map((m, i) => ({ ...m, valor: valores[i], media3: i >= 2 ? r2((valores[i] + valores[i - 1] + valores[i - 2]) / 3) : null }))
}

/** Total por ano de uma categoria/subcategoria (todos os anos com dados). */
export function totaisPorAno(L: Lancamento[], categoria: string, subcategoria: string | null): { ano: number; total: number; meses: number }[] {
  const porAno = new Map<number, { total: number; meses: Set<number> }>()
  for (const l of L) {
    if (l.foraDoFluxo || l.tipo !== 'despesa' || l.categoria !== categoria) continue
    if (subcategoria != null && l.subcategoria !== subcategoria) continue
    const a = porAno.get(l.ano) ?? { total: 0, meses: new Set<number>() }
    a.total += l.valor; a.meses.add(l.mes)
    porAno.set(l.ano, a)
  }
  return [...porAno.entries()].sort(([a], [b]) => a - b).map(([ano, a]) => ({ ano, total: r2(a.total), meses: a.meses.size }))
}
