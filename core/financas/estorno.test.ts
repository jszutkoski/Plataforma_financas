/** Regressão FIN-003: estorno como despesa negativa. Banco em memória. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as api from './api.ts'

const lanc = (o: Record<string, unknown>) => ({ data: '2026-03-10', descricao: 'x', tipo: 'despesa' as const, valor: 10, grupo: null, categoria: null, subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, ...o })

test('despesa aceita valor negativo (estorno); os demais tipos e o zero não', () => {
  assert.equal(api.criarLancamento(lanc({ descricao: 'Estorno', valor: -49.9 })).valor, -49.9)
  assert.throws(() => api.criarLancamento(lanc({ valor: 0 })), /diferente de zero/)
  assert.throws(() => api.criarLancamento(lanc({ tipo: 'receita', valor: -10 })), /maior que zero/)
  assert.throws(() => api.parcelamento({ base: lanc({}), valorTotal: -300, totalParcelas: 3, dataInicio: '2026-03-10' }), /valor positivo/)
})

const rec = (o: Record<string, unknown>) => ({ id: '', descricao: 'Aluguel', valor: 1000, tipo: 'despesa' as const, grupo: 'Fixas' as const, categoria: null, subcategoria: null, conta: null, formaPagamento: null, dia: 5, inicio: '2026-01', fim: null, observacoes: null, ativo: true, ...o })

test('FIN-018: recorrências inválidas são recusadas na criação e na edição', () => {
  assert.throws(() => api.criarRecorrencia(rec({ tipo: 'xyz' })), /Tipo inválido/)
  assert.throws(() => api.criarRecorrencia(rec({ dia: 40 })), /Dia do mês/)
  assert.throws(() => api.criarRecorrencia(rec({ inicio: '2026-13' })), /Início inválido/)
  assert.throws(() => api.criarRecorrencia(rec({ inicio: '2026-05', fim: '2026-01' })), /fim não pode/)
  const r = api.criarRecorrencia(rec({}))
  assert.throws(() => api.atualizarRecorrencia({ id: r.id, r: { ...r, valor: -5 } }), /maior que zero/)
  assert.equal(api.atualizarRecorrencia({ id: r.id, r: { ...r, valor: 1100 } }).valor, 1100)
})

test('FIN-019: duplicar uma parcela não cria uma "parcela 2/3" solta', () => {
  const p = api.parcelamento({ base: lanc({ descricao: 'TV' }), valorTotal: 300, totalParcelas: 3, dataInicio: '2026-06-15' })
  const parcela = api.lancamentos().find((l) => l.parcelamentoId === p.parcelamentoId && l.parcela === 2)!
  const copia = api.duplicarLancamento({ id: parcela.id, data: '2026-10-11' })
  assert.deepEqual([copia.parcela, copia.totalParcelas, copia.parcelamentoId], [null, null, null])
})
