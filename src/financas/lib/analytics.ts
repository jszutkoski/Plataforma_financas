import type { Lancamento, Grupo } from '@fin-shared/types'
import { GRUPOS_DESPESA } from '@fin-shared/types'
import { fmtBRL, fmtPct, fmtPctDelta, nomeMes } from './format'

export interface ResumoMes {
  ano: number
  mes: number
  receitaBruta: number
  deducoes: number
  renda: number
  gastos: number
  porGrupo: Record<Grupo, number>
  aportes: number
  resgates: number
  saldo: number
  pctComprometido: number
  pctInvestido: number
  n: number
  temDados: boolean
}

const r2 = (v: number) => Math.round(v * 100) / 100

/** Lançamentos do fluxo (exclui razões auxiliares). */
export const noFluxo = (L: Lancamento[]) => L.filter((l) => !l.foraDoFluxo)

export function doMes(L: Lancamento[], ano: number, mes: number): Lancamento[] {
  return L.filter((l) => !l.foraDoFluxo && l.ano === ano && l.mes === mes)
}

export function resumoMes(L: Lancamento[], ano: number, mes: number): ResumoMes {
  const M = doMes(L, ano, mes)
  const porGrupo = { Fixas: 0, Variáveis: 0, Extras: 0, Adicionais: 0 } as Record<Grupo, number>
  let receitaBruta = 0, deducoes = 0, gastos = 0, aportes = 0, resgates = 0
  for (const l of M) {
    switch (l.tipo) {
      case 'receita': receitaBruta += l.valor; break
      case 'deducao': deducoes += l.valor; break
      case 'despesa': gastos += l.valor; porGrupo[(l.grupo ?? 'Variáveis') as Grupo] = (porGrupo[(l.grupo ?? 'Variáveis') as Grupo] ?? 0) + l.valor; break
      case 'investimento': aportes += l.valor; break
      case 'resgate': resgates += l.valor; break
    }
  }
  const renda = receitaBruta - deducoes
  const saldo = renda - gastos - aportes + resgates
  return {
    ano, mes, receitaBruta: r2(receitaBruta), deducoes: r2(deducoes), renda: r2(renda), gastos: r2(gastos), porGrupo,
    aportes: r2(aportes), resgates: r2(resgates), saldo: r2(saldo),
    pctComprometido: renda > 0 ? gastos / renda : 0, pctInvestido: renda > 0 ? aportes / renda : 0,
    n: M.length, temDados: M.length > 0,
  }
}

export function anosDisponiveis(L: Lancamento[]): number[] {
  return [...new Set(noFluxo(L).map((l) => l.ano))].sort()
}

export function mesesComDados(L: Lancamento[], ano: number): number[] {
  return [...new Set(noFluxo(L).filter((l) => l.ano === ano).map((l) => l.mes))].sort((a, b) => a - b)
}

/** Último mês com dados (para seleção inicial). */
export function ultimoMesComDados(L: Lancamento[]): { ano: number; mes: number } {
  const F = noFluxo(L)
  if (!F.length) { const d = new Date(); return { ano: d.getFullYear(), mes: d.getMonth() + 1 } }
  let best = { ano: 0, mes: 0 }
  for (const l of F) if (l.ano > best.ano || (l.ano === best.ano && l.mes > best.mes)) best = { ano: l.ano, mes: l.mes }
  return best
}

export function mesAnterior(ano: number, mes: number): { ano: number; mes: number } {
  return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano, mes: mes - 1 }
}

/** Média dos até `n` meses anteriores que possuem dados. */
export function mediaAnteriores(L: Lancamento[], ano: number, mes: number, n = 12): { media: ResumoMes | null; meses: number } {
  const acc: ResumoMes[] = []
  let cur = mesAnterior(ano, mes)
  const anos = anosDisponiveis(L)
  const minAno = anos[0] ?? ano
  while (acc.length < n && cur.ano >= minAno) {
    const r = resumoMes(L, cur.ano, cur.mes)
    if (r.temDados) acc.push(r)
    cur = mesAnterior(cur.ano, cur.mes)
  }
  if (!acc.length) return { media: null, meses: 0 }
  const k = acc.length
  const avg = (f: (r: ResumoMes) => number) => r2(acc.reduce((s, r) => s + f(r), 0) / k)
  const porGrupo = { Fixas: 0, Variáveis: 0, Extras: 0, Adicionais: 0 } as Record<Grupo, number>
  for (const g of GRUPOS_DESPESA) porGrupo[g] = avg((r) => r.porGrupo[g] ?? 0)
  const renda = avg((r) => r.renda), gastos = avg((r) => r.gastos), aportes = avg((r) => r.aportes)
  return {
    meses: k,
    media: {
      ano, mes, receitaBruta: avg((r) => r.receitaBruta), deducoes: avg((r) => r.deducoes), renda, gastos, porGrupo, aportes,
      resgates: avg((r) => r.resgates), saldo: avg((r) => r.saldo), pctComprometido: renda > 0 ? gastos / renda : 0, pctInvestido: renda > 0 ? aportes / renda : 0, n: 0, temDados: true,
    },
  }
}

export interface ItemCategoria { nome: string; valor: number; grupo: Grupo | null; n: number }

export function gastosPorCategoria(L: Lancamento[], ano: number, mes: number, nivel: 'categoria' | 'subcategoria' = 'categoria', filtroCategoria?: string): ItemCategoria[] {
  const map = new Map<string, ItemCategoria>()
  for (const l of doMes(L, ano, mes)) {
    if (l.tipo !== 'despesa') continue
    if (filtroCategoria && l.categoria !== filtroCategoria) continue
    const nome = (nivel === 'categoria' ? l.categoria : l.subcategoria) ?? 'Sem categoria'
    const it = map.get(nome) ?? { nome, valor: 0, grupo: l.grupo, n: 0 }
    it.valor += l.valor; it.n++
    map.set(nome, it)
  }
  return [...map.values()].map((i) => ({ ...i, valor: r2(i.valor) })).sort((a, b) => b.valor - a.valor)
}

export function gastosPorCategoriaAno(L: Lancamento[], ano: number, nivel: 'categoria' | 'subcategoria' = 'categoria'): ItemCategoria[] {
  const map = new Map<string, ItemCategoria>()
  for (const l of noFluxo(L)) {
    if (l.ano !== ano || l.tipo !== 'despesa') continue
    const nome = (nivel === 'categoria' ? l.categoria : l.subcategoria) ?? 'Sem categoria'
    const it = map.get(nome) ?? { nome, valor: 0, grupo: l.grupo, n: 0 }
    it.valor += l.valor; it.n++
    map.set(nome, it)
  }
  return [...map.values()].map((i) => ({ ...i, valor: r2(i.valor) })).sort((a, b) => b.valor - a.valor)
}

export interface PontoDiario { dia: number; data: string; gastos: number; acumulado: number; saldo: number; semDia: number }

/** Evolução diária: gastos com dia conhecido por dia; os sem dia entram como bloco "sem dia" no dia 1. */
export function evolucaoDiaria(L: Lancamento[], ano: number, mes: number): PontoDiario[] {
  const M = doMes(L, ano, mes)
  const dias = new Date(ano, mes, 0).getDate()
  const gastosDia = new Array(dias + 1).fill(0)
  const entradasDia = new Array(dias + 1).fill(0)
  let semDia = 0
  for (const l of M) {
    const d = Number(l.data.slice(8, 10))
    const dia = l.diaConhecido && l.data.startsWith(`${ano}-${String(mes).padStart(2, '0')}`) ? d : 1
    if (l.tipo === 'despesa') {
      if (l.diaConhecido) gastosDia[dia] += l.valor
      else semDia += l.valor
    } else if (l.tipo === 'receita' || l.tipo === 'resgate') entradasDia[dia] += l.valor
    else entradasDia[dia] -= l.valor // deduções e aportes
  }
  const out: PontoDiario[] = []
  let acum = 0, saldo = 0
  for (let dia = 1; dia <= dias; dia++) {
    const g = gastosDia[dia] + (dia === 1 ? semDia : 0)
    acum += g
    saldo += entradasDia[dia] - g
    const data = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    out.push({ dia, data, gastos: r2(gastosDia[dia]), acumulado: r2(acum), saldo: r2(saldo), semDia: dia === 1 ? r2(semDia) : 0 })
  }
  return out
}

export interface VariacaoCategoria { nome: string; atual: number; anterior: number; delta: number; pct: number | null }

export function variacaoCategorias(L: Lancamento[], ano: number, mes: number, nivel: 'categoria' | 'subcategoria' = 'subcategoria'): VariacaoCategoria[] {
  const prev = mesAnterior(ano, mes)
  const a = new Map(gastosPorCategoria(L, ano, mes, nivel).map((i) => [i.nome, i.valor]))
  const b = new Map(gastosPorCategoria(L, prev.ano, prev.mes, nivel).map((i) => [i.nome, i.valor]))
  const nomes = new Set([...a.keys(), ...b.keys()])
  return [...nomes].map((nome) => {
    const atual = a.get(nome) ?? 0, anterior = b.get(nome) ?? 0
    return { nome, atual, anterior, delta: r2(atual - anterior), pct: anterior > 0 ? (atual - anterior) / anterior : null }
  }).sort((x, y) => y.delta - x.delta)
}

export interface ResumoAno {
  ano: number
  meses: ResumoMes[]
  mesesComDados: number
  totais: { renda: number; gastos: number; aportes: number; resgates: number; saldo: number; porGrupo: Record<Grupo, number> }
  medias: { renda: number; gastos: number; aportes: number; saldo: number }
}

export function resumoAno(L: Lancamento[], ano: number): ResumoAno {
  const meses = Array.from({ length: 12 }, (_, i) => resumoMes(L, ano, i + 1))
  const com = meses.filter((m) => m.temDados)
  const porGrupo = { Fixas: 0, Variáveis: 0, Extras: 0, Adicionais: 0 } as Record<Grupo, number>
  for (const m of com) for (const g of GRUPOS_DESPESA) porGrupo[g] = r2(porGrupo[g] + (m.porGrupo[g] ?? 0))
  const sum = (f: (m: ResumoMes) => number) => r2(com.reduce((s, m) => s + f(m), 0))
  const k = Math.max(com.length, 1)
  const totais = { renda: sum((m) => m.renda), gastos: sum((m) => m.gastos), aportes: sum((m) => m.aportes), resgates: sum((m) => m.resgates), saldo: sum((m) => m.saldo), porGrupo }
  return { ano, meses, mesesComDados: com.length, totais, medias: { renda: r2(totais.renda / k), gastos: r2(totais.gastos / k), aportes: r2(totais.aportes / k), saldo: r2(totais.saldo / k) } }
}

/** Subcategorias fixas presentes em pelo menos 3 dos últimos 6 meses com dados (recorrentes). */
export function gastosRecorrentes(L: Lancamento[], ano: number, mes: number): { nome: string; vezes: number; media: number }[] {
  const janela: { ano: number; mes: number }[] = []
  let cur = { ano, mes }
  const minAno = anosDisponiveis(L)[0] ?? ano
  while (janela.length < 6 && cur.ano >= minAno) {
    if (resumoMes(L, cur.ano, cur.mes).temDados) janela.push(cur)
    cur = mesAnterior(cur.ano, cur.mes)
  }
  const cont = new Map<string, { vezes: number; soma: number }>()
  for (const j of janela) {
    const vistos = new Set<string>()
    for (const l of doMes(L, j.ano, j.mes)) {
      if (l.tipo !== 'despesa' || !l.subcategoria) continue
      const k = `${l.categoria} › ${l.subcategoria}`
      const c = cont.get(k) ?? { vezes: 0, soma: 0 }
      if (!vistos.has(k)) { c.vezes++; vistos.add(k) }
      c.soma += l.valor
      cont.set(k, c)
    }
  }
  return [...cont.entries()].filter(([, c]) => c.vezes >= Math.min(3, janela.length) && janela.length >= 2)
    .map(([nome, c]) => ({ nome, vezes: c.vezes, media: r2(c.soma / c.vezes) })).sort((a, b) => b.media - a.media)
}

/** Lançamentos individuais fora do padrão: > 8% da renda do mês ou > 3× a mediana da subcategoria no histórico. */
export function despesasIncomuns(L: Lancamento[], ano: number, mes: number, renda: number): Lancamento[] {
  const hist = new Map<string, number[]>()
  for (const l of noFluxo(L)) {
    if (l.tipo !== 'despesa' || (l.ano === ano && l.mes === mes)) continue
    const k = `${l.categoria}|${l.subcategoria}`
    hist.set(k, [...(hist.get(k) ?? []), l.valor])
  }
  const mediana = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0 }
  return doMes(L, ano, mes).filter((l) => {
    if (l.tipo !== 'despesa') return false
    const h = hist.get(`${l.categoria}|${l.subcategoria}`) ?? []
    const med = mediana(h)
    // grande em relação à renda e sem histórico compatível (evita marcar aluguel, empréstimo etc.)
    const grande = renda > 0 && l.valor > renda * 0.08 && (h.length < 3 || l.valor > med * 2)
    const atipico = h.length >= 4 && med > 0 && l.valor > med * 3 && l.valor > 150
    return grande || atipico
  }).sort((a, b) => b.valor - a.valor).slice(0, 6)
}

/** Texto factual do mês. */
export function descricaoMensal(L: Lancamento[], ano: number, mes: number): string[] {
  const r = resumoMes(L, ano, mes)
  if (!r.temDados) return [`Não há lançamentos registrados em ${nomeMes(mes)} de ${ano}.`]
  const prev = mesAnterior(ano, mes)
  const rp = resumoMes(L, prev.ano, prev.mes)
  const { media, meses } = mediaAnteriores(L, ano, mes)
  const cats = gastosPorCategoria(L, ano, mes, 'categoria')
  const subs = gastosPorCategoria(L, ano, mes, 'subcategoria')
  const p: string[] = []

  // 1. visão geral
  let s = `Em ${nomeMes(mes)} de ${ano}, a renda líquida foi de ${fmtBRL(r.renda)} e os gastos somaram ${fmtBRL(r.gastos)}`
  s += r.renda > 0 ? ` (${fmtPct(r.pctComprometido)} da renda).` : '.'
  if (r.aportes > 0) s += ` Foram aportados ${fmtBRL(r.aportes)} em investimentos (${fmtPct(r.pctInvestido)} da renda).`
  if (r.resgates > 0) s += ` Houve resgate de ${fmtBRL(r.resgates)}.`
  s += ` O saldo do mês ficou ${r.saldo >= 0 ? 'positivo' : 'negativo'} em ${fmtBRL(r.saldo)}.`
  p.push(s)

  // 2. composição
  if (cats.length) {
    const top = cats.slice(0, 3).map((c) => `${c.nome} (${fmtBRL(c.valor)}, ${fmtPct(r.gastos ? c.valor / r.gastos : 0)})`)
    let t = `As categorias de maior peso foram ${top.join(', ')}.`
    const g = r.porGrupo
    const fixas = g.Fixas ?? 0, variaveis = (g.Variáveis ?? 0) + (g.Extras ?? 0) + (g.Adicionais ?? 0)
    if (fixas || variaveis) t += ` Despesas fixas representaram ${fmtPct(r.gastos ? fixas / r.gastos : 0)} do total e as variáveis (incluindo extras e adicionais) ${fmtPct(r.gastos ? variaveis / r.gastos : 0)}.`
    if (subs[0]) t += ` O item individual mais relevante foi ${subs[0].nome}, com ${fmtBRL(subs[0].valor)}.`
    p.push(t)
  }

  // 3. comparação com mês anterior
  if (rp.temDados) {
    const dg = r.gastos - rp.gastos
    let t = `Em relação a ${nomeMes(prev.mes)}${prev.ano !== ano ? ` de ${prev.ano}` : ''}, os gastos ${dg >= 0 ? 'aumentaram' : 'diminuíram'} ${fmtBRL(Math.abs(dg))}`
    t += rp.gastos > 0 ? ` (${fmtPctDelta(dg / rp.gastos)})` : ''
    const dr = r.renda - rp.renda
    t += ` e a renda líquida ${Math.abs(dr) < 1 ? 'se manteve' : dr > 0 ? `subiu ${fmtBRL(dr)}` : `caiu ${fmtBRL(-dr)}`}.`
    const vars = variacaoCategorias(L, ano, mes, 'subcategoria').filter((v) => Math.abs(v.delta) >= 100)
    const sobe = vars.filter((v) => v.delta > 0).slice(0, 3), desce = vars.filter((v) => v.delta < 0).slice(-3).reverse()
    if (sobe.length) t += ` Maiores aumentos: ${sobe.map((v) => `${v.nome} (+${fmtBRL(v.delta)})`).join(', ')}.`
    if (desce.length) t += ` Maiores reduções: ${desce.map((v) => `${v.nome} (${fmtBRL(v.delta)})`).join(', ')}.`
    p.push(t)
  } else {
    p.push('Não há dados do mês anterior para comparação.')
  }

  // 4. comparação com média
  if (media && meses >= 2) {
    const dg = r.gastos - media.gastos
    p.push(`Comparado à média dos ${meses} meses anteriores com dados (${fmtBRL(media.gastos)} em gastos e ${fmtBRL(media.renda)} de renda), os gastos deste mês ficaram ${fmtBRL(Math.abs(dg))} ${dg >= 0 ? 'acima' : 'abaixo'}${media.gastos > 0 ? ` (${fmtPctDelta(dg / media.gastos)})` : ''}.`)
  }

  // 5. incomuns e recorrentes
  const inc = despesasIncomuns(L, ano, mes, r.renda)
  if (inc.length) p.push(`Despesas fora do padrão habitual: ${inc.slice(0, 4).map((l) => `${l.descricao} (${fmtBRL(l.valor)}, ${l.subcategoria ?? l.categoria})`).join('; ')}.`)
  const rec = gastosRecorrentes(L, ano, mes).slice(0, 6)
  if (rec.length) p.push(`Gastos recorrentes nos últimos meses: ${rec.map((x) => `${x.nome.split(' › ')[1]} (média ${fmtBRL(x.media)})`).join(', ')}.`)

  // 6. observações de qualidade
  const semDia = doMes(L, ano, mes).filter((l) => l.tipo === 'despesa' && !l.diaConhecido).length
  const total = doMes(L, ano, mes).filter((l) => l.tipo === 'despesa').length
  if (total && semDia / total > 0.5) p.push(`Observação: ${semDia} de ${total} despesas deste mês não têm dia informado (lançadas no 1º dia). A evolução diária reflete apenas os lançamentos com data completa.`)
  return p
}
