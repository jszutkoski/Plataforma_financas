import type { Lancamento, Recorrencia, AjusteProjecao, TipoLancamento } from '@fin-shared/types'
import { doMes, mediaAnteriores, mesAnterior } from './analytics'

const r2 = (v: number) => Math.round(v * 100) / 100
const chave = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`
const proximo = (ano: number, mes: number) => (mes === 12 ? { ano: ano + 1, mes: 1 } : { ano, mes: mes + 1 })

export interface MesProjetado {
  ano: number
  mes: number
  /** receitas − deduções (recorrências e o que já está lançado no mês) */
  renda: number
  /** despesas recorrentes */
  fixas: number
  /** estimativa pela média: gastos médios − despesas recorrentes */
  variaveis: number
  /** despesas avulsas já lançadas no mês (parcelas, por exemplo) */
  jaLancadas: number
  gastos: number
  aportes: number
  resgates: number
  /** soma dos ajustes à mão (13º, férias…) */
  ajustes: number
  itensAjuste: AjusteProjecao[]
  saldo: number
  acumulado: number
}

export interface Projecao {
  meses: MesProjetado[]
  /** quantos meses entraram na média dos gastos */
  mesesBase: number
  gastosMedios: number
  /** despesas recorrentes vigentes no mês de referência (descontadas da média para não contar duas vezes) */
  fixasReferencia: number
  variaveisEstimadas: number
}

/** A recorrência vale no mês? (ativa, entre início e fim) */
export function recorrenciaVigente(r: Recorrencia, ano: number, mes: number): boolean {
  const k = chave(ano, mes)
  return r.ativo && r.inicio <= k && (!r.fim || r.fim >= k)
}

/**
 * Próximos `n` meses a partir do mês seguinte a `hoje`.
 * - Recorrências vigentes entram pelo valor cadastrado; se já foram geradas no mês, vale o lançamento.
 * - Gastos variáveis = média dos gastos dos meses anteriores ao atual (até 12) − despesas recorrentes de hoje.
 * - Despesas avulsas já lançadas no mês (parcelas) somam por cima da estimativa.
 * - Ajustes à mão (13º, férias) entram como estão: positivo entra, negativo sai.
 */
export function projetar(L: Lancamento[], R: Recorrencia[], A: AjusteProjecao[], opts: { hoje?: Date; meses?: number; base?: number } = {}): Projecao {
  const hoje = opts.hoje ?? new Date()
  const atual = { ano: hoje.getFullYear(), mes: hoje.getMonth() + 1 }
  const { media, meses: mesesBase } = mediaAnteriores(L, atual.ano, atual.mes, opts.base ?? 12)
  const gastosMedios = media?.gastos ?? 0
  const fixasReferencia = r2(R.filter((r) => r.tipo === 'despesa' && recorrenciaVigente(r, atual.ano, atual.mes)).reduce((s, r) => s + r.valor, 0))
  const variaveisEstimadas = r2(Math.max(0, gastosMedios - fixasReferencia))

  const out: MesProjetado[] = []
  let cur = proximo(atual.ano, atual.mes)
  let acumulado = 0
  for (let i = 0; i < (opts.meses ?? 6); i++) {
    const lanc = doMes(L, cur.ano, cur.mes)
    const geradas = new Set(lanc.map((l) => l.recorrenciaId).filter(Boolean))
    const soma: Record<TipoLancamento, number> = { receita: 0, deducao: 0, despesa: 0, investimento: 0, resgate: 0 }
    for (const r of R) if (recorrenciaVigente(r, cur.ano, cur.mes) && !geradas.has(r.id)) soma[r.tipo] += r.valor
    let fixasLancadas = 0, avulsas = 0
    for (const l of lanc) {
      if (l.tipo === 'despesa') { if (l.recorrenciaId) fixasLancadas += l.valor; else avulsas += l.valor }
      else soma[l.tipo] += l.valor
    }
    const itensAjuste = A.filter((a) => a.ano === cur.ano && a.mes === cur.mes)
    const ajustes = r2(itensAjuste.reduce((s, a) => s + a.valor, 0))
    const renda = r2(soma.receita - soma.deducao)
    const fixas = r2(soma.despesa + fixasLancadas)
    const gastos = r2(fixas + variaveisEstimadas + avulsas)
    const saldo = r2(renda + ajustes - gastos - soma.investimento + soma.resgate)
    acumulado = r2(acumulado + saldo)
    out.push({ ano: cur.ano, mes: cur.mes, renda, fixas, variaveis: variaveisEstimadas, jaLancadas: r2(avulsas), gastos, aportes: r2(soma.investimento), resgates: r2(soma.resgate), ajustes, itensAjuste, saldo, acumulado })
    cur = proximo(cur.ano, cur.mes)
  }
  return { meses: out, mesesBase, gastosMedios, fixasReferencia, variaveisEstimadas }
}

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
