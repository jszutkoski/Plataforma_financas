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
