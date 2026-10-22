/** Projeção e tendência por categoria. Dados sintéticos. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { projetar, serieCategoria, totaisPorAno } from './projecao.ts'
import type { Lancamento, Recorrencia } from '@fin-shared/types'

let seq = 0
const L = (o: Partial<Lancamento>): Lancamento => ({ id: `l${++seq}`, data: '2026-03-10', ano: 2026, mes: 3, descricao: 'x', tipo: 'despesa', valor: 10, grupo: 'Variáveis', categoria: 'A', subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, parcelamentoId: null, criadoEm: '', atualizadoEm: '', ...o })
const R = (o: Partial<Recorrencia>): Recorrencia => ({ id: `r${++seq}`, descricao: 'x', valor: 100, tipo: 'despesa', grupo: 'Fixas', categoria: null, subcategoria: null, conta: null, formaPagamento: null, dia: 5, inicio: '2026-01', fim: null, observacoes: null, ativo: true, ...o })

// histórico: jul, ago e set/2026 com 3.000 de gastos cada (1.000 deles aluguel); "hoje" = out/2026
const hist = [7, 8, 9].flatMap((mes) => [L({ mes, valor: 1000, categoria: 'Habitação' }), L({ mes, valor: 2000, categoria: 'Alimentação' })])
const hoje = new Date(2026, 9, 15)

test('projeção: recorrências + média dos variáveis, sem contar o aluguel duas vezes', () => {
  const rec = [R({ tipo: 'receita', valor: 6000 }), R({ tipo: 'deducao', valor: 1000 }), R({ valor: 1000 }), R({ tipo: 'investimento', valor: 500 }), R({ valor: 50, fim: '2026-11' })]
  const p = projetar(hist, rec, [], { hoje, meses: 3 })
  assert.equal(p.mesesBase, 3)
  assert.equal(p.gastosMedios, 3000)
  assert.equal(p.fixasReferencia, 1050)
  assert.equal(p.variaveisEstimadas, 1950)
  const [nov, dez] = p.meses
  assert.deepEqual([nov.ano, nov.mes, dez.mes], [2026, 11, 12])
  assert.equal(nov.renda, 5000)
  assert.equal(nov.fixas, 1050)
  assert.equal(dez.fixas, 1000, 'recorrência com fim em nov não entra em dez')
  assert.equal(nov.saldo, 5000 - 1050 - 1950 - 500)
  assert.equal(dez.acumulado, nov.saldo + dez.saldo)
})

test('projeção: recorrência já gerada vale pelo lançamento; parcela avulsa soma; ajuste à mão entra', () => {
  const aluguel = R({ valor: 1000 })
  const L2 = [...hist, L({ ano: 2026, mes: 11, valor: 1100, recorrenciaId: aluguel.id }), L({ ano: 2026, mes: 11, valor: 300, descricao: 'TV 2/3' })]
  const p = projetar(L2, [aluguel], [{ id: 'a', ano: 2026, mes: 12, descricao: '13º', valor: 4000 }], { hoje, meses: 2 })
  const [nov, dez] = p.meses
  assert.equal(nov.fixas, 1100, 'não soma a recorrência de novo')
  assert.equal(nov.jaLancadas, 300)
  assert.equal(nov.gastos, 1100 + p.variaveisEstimadas + 300)
  assert.equal(dez.ajustes, 4000)
  assert.equal(dez.saldo, 4000 - 1000 - p.variaveisEstimadas)
})

test('tendência: meses sem gasto entram como zero; média móvel de 3 meses; total por ano', () => {
  const s = serieCategoria(hist, 'Alimentação', null, { ano: 2026, mes: 10 }, 6)
  assert.deepEqual(s.map((x) => x.valor), [0, 0, 2000, 2000, 2000, 0])
  assert.deepEqual(s.map((x) => x.media3), [null, null, 666.67, 1333.33, 2000, 1333.33])
  assert.deepEqual(totaisPorAno(hist, 'Habitação', null), [{ ano: 2026, total: 3000, meses: 3 }])
  assert.deepEqual(serieCategoria(hist, 'Alimentação', 'Feira', { ano: 2026, mes: 9 }, 2).map((x) => x.valor), [0, 0])
})
