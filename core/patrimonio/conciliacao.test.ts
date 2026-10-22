/** Conciliação Finanças × Patrimônio. Os dois bancos em memória, no mesmo processo. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as api from './api.ts'
import * as fin from '../financas/api.ts'
import { listar } from './db.ts'
import type { Movimentacao } from '../../shared/patrimonio/types.ts'

const lanc = (o: Record<string, unknown>) => fin.criarLancamento({ data: '2026-03-10', descricao: 'x', tipo: 'investimento', valor: 1000, grupo: null, categoria: null, subcategoria: null, conta: 'Nubank', formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, ...o } as never)

const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB Banco X', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
const conta = api.criar({ t: 'contas', item: { nome: 'Conta Nubank', tipo: 'corrente', financasNome: 'Nubank', ativo: true } }) as { id: string }
lanc({ data: '2026-01-05', tipo: 'despesa', valor: 50, descricao: 'mercado' }) // define o início do Finanças em jan/2026
const marAporte = lanc({ descricao: 'Aporte CDB' })
const marResgate = lanc({ data: '2026-03-20', tipo: 'resgate', valor: 200, descricao: 'Resgate' })
api.criar({ t: 'fluxosConsolidados', item: { ano: 2026, mes: 3, aportesLiquidos: 800, origem: 'planilha', financasIds: [] } })
api.criar({ t: 'fluxosConsolidados', item: { ano: 2026, mes: 2, aportesLiquidos: 500, origem: 'planilha', financasIds: [] } })
api.criar({ t: 'fluxosConsolidados', item: { ano: 2025, mes: 12, aportesLiquidos: 300, origem: 'planilha', financasIds: [] } }) // antes do Finanças
const lancAbr = lanc({ data: '2026-04-02', valor: 700, descricao: 'Aporte abril' })
const movAbr = api.criar({ t: 'movimentacoes', item: { investimentoId: inv.id, tipo: 'aplicacao', data: '2026-04-02', valor: 700, origemRecurso: 'externo' } }) as { id: string }
api.criar({ t: 'movimentacoes', item: { investimentoId: inv.id, tipo: 'aplicacao', data: '2025-06-01', valor: 100, origemRecurso: 'externo' } }) // antes do Finanças

test('conciliação: situação de cada mês, desde o início do Finanças', () => {
  const c = api.conciliacao()
  assert.equal(c.inicio, '2026-01')
  const sit = Object.fromEntries(c.meses.map((m) => [`${m.ano}-${m.mes}`, m.situacao]))
  assert.deepEqual(sit, { '2026-4': 'nao_importado', '2026-3': 'confere', '2026-2': 'so_patrimonio' })
  const mar = c.meses.find((m) => m.mes === 3)!
  assert.deepEqual([mar.investimentos, mar.resgates, mar.liquido, mar.aporte, mar.diferenca], [1000, 200, 800, 800, 0])
  assert.equal(c.semLancamento.length, 1, 'a movimentação de 2025 fica de fora da lista')
  assert.equal(c.semLancamentoAntes, 1)
  assert.equal(c.semLancamento[0].candidato?.id, lancAbr.id, 'mesmo mês, sentido e valor: sugere vincular')
})

test('vincular liga sem criar nada; criar movimentação a partir do Finanças usa a conta correspondente', () => {
  const antes = listar<Movimentacao>('movimentacoes').length
  api.vincularFinancas({ movimentacaoId: movAbr.id, lancamentoId: lancAbr.id })
  assert.equal(listar<Movimentacao>('movimentacoes').length, antes)
  assert.throws(() => api.vincularFinancas({ movimentacaoId: movAbr.id, lancamentoId: marAporte.id }), /já está ligada/)
  assert.equal(api.conciliacao().semLancamento.length, 0)

  const m = api.criarMovimentacaoDoFinancas({ lancamentoId: marResgate.id, investimentoId: inv.id }) as unknown as Movimentacao
  assert.deepEqual([m.tipo, m.valor, m.data, m.contaId, m.origemRecurso, m.financasId], ['resgate', 200, '2026-03-20', conta.id, 'externo', marResgate.id])
  assert.throws(() => api.criarMovimentacaoDoFinancas({ lancamentoId: marResgate.id, investimentoId: inv.id }), /já tem movimentação/)
  const mar = api.conciliacao().meses.find((x) => x.mes === 3)!
  assert.equal(mar.itens.find((i) => i.id === marResgate.id)?.movimentacaoId, m.id)
  assert.equal(mar.liquidoMovs, -200)
  assert.equal(fin.lancamentos().length, 4, 'nada foi criado no Finanças')
})
