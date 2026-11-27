/** Tendência por categoria. Dados sintéticos. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serieCategoria, totaisPorAno } from './tendencia.ts'
import type { Lancamento } from '@fin-shared/types'

let seq = 0
const L = (o: Partial<Lancamento>): Lancamento => ({ id: `l${++seq}`, data: '2026-03-10', ano: 2026, mes: 3, descricao: 'x', tipo: 'despesa', valor: 10, grupo: 'Variáveis', categoria: 'A', subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, parcelamentoId: null, criadoEm: '', atualizadoEm: '', ...o })

// histórico: jul, ago e set/2026 com 3.000 de gastos cada
const hist = [7, 8, 9].flatMap((mes) => [L({ mes, valor: 1000, categoria: 'Habitação' }), L({ mes, valor: 2000, categoria: 'Alimentação' })])

test('tendência: meses sem gasto entram como zero; média móvel de 3 meses; total por ano', () => {
  const s = serieCategoria(hist, 'Alimentação', null, { ano: 2026, mes: 10 }, 6)
  assert.deepEqual(s.map((x) => x.valor), [0, 0, 2000, 2000, 2000, 0])
  assert.deepEqual(s.map((x) => x.media3), [null, null, 666.67, 1333.33, 2000, 1333.33])
  assert.deepEqual(totaisPorAno(hist, 'Habitação', null), [{ ano: 2026, total: 3000, meses: 3 }])
  assert.deepEqual(serieCategoria(hist, 'Alimentação', 'Feira', { ano: 2026, mes: 9 }, 2).map((x) => x.valor), [0, 0])
})
