/** Regressão dos cálculos do painel do Finanças (auditoria FIN-004, FIN-013). Dados sintéticos. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resumoMes, gastosPorCategoria, gastosPorCategoriaAno, variacaoCategorias } from './analytics.ts'
import type { Lancamento } from '@fin-shared/types'

let seq = 0
const L = (o: Partial<Lancamento>): Lancamento => ({ id: `l${++seq}`, data: '2026-03-10', ano: 2026, mes: 3, descricao: 'x', tipo: 'despesa', valor: 10, grupo: 'Variáveis', categoria: 'A', subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, parcelamentoId: null, criadoEm: '', atualizadoEm: '', ...o })

test('invariantes do mês: saldo e soma das naturezas', () => {
  const M = [L({ tipo: 'receita', valor: 5000, grupo: 'Receita' }), L({ tipo: 'deducao', valor: 800, grupo: 'Dedução' }), L({ valor: 1200, grupo: 'Fixas' }), L({ valor: 300.1, grupo: 'Variáveis' }), L({ valor: 99.9, grupo: 'Extras' }), L({ tipo: 'investimento', valor: 1000, grupo: 'Investimentos' }), L({ tipo: 'resgate', valor: 200, grupo: 'Investimentos' })]
  const r = resumoMes(M, 2026, 3)
  assert.equal(r.renda, 4200)
  assert.equal(r.gastos, 1600)
  assert.equal(r.saldo, 4200 - 1600 - 1000 + 200)
  const soma = Object.values(r.porGrupo).reduce((s, v) => s + v, 0)
  assert.equal(Math.round(soma * 100) / 100, r.gastos)
})

test('FIN-013: subcategorias homônimas de categorias diferentes não se somam', () => {
  const M = [L({ categoria: 'Pets', subcategoria: 'Outros', valor: 50 }), L({ categoria: 'Veículos', subcategoria: 'Outros', valor: 70 }), L({ categoria: 'Farmácia', subcategoria: null, valor: 30 })]
  assert.deepEqual(gastosPorCategoria(M, 2026, 3, 'subcategoria').map((i) => [i.nome, i.valor]), [['Veículos › Outros', 70], ['Pets › Outros', 50], ['Farmácia › (sem subcategoria)', 30]])
  assert.deepEqual(gastosPorCategoriaAno(M, 2026, 'subcategoria').map((i) => i.nome).sort(), ['Farmácia › (sem subcategoria)', 'Pets › Outros', 'Veículos › Outros'])
  // dentro de uma categoria (detalhe do painel), só o nome da subcategoria
  assert.deepEqual(gastosPorCategoria(M, 2026, 3, 'subcategoria', 'Pets').map((i) => i.nome), ['Outros'])
  // variação mês a mês também separa
  const ant = [L({ ano: 2026, mes: 2, data: '2026-02-10', categoria: 'Pets', subcategoria: 'Outros', valor: 50 })]
  assert.equal(variacaoCategorias([...M, ...ant], 2026, 3).find((v) => v.nome === 'Pets › Outros')?.delta, 0)
})

test('FIN-016: o painel abre no mês atual (ou no último anterior com dados), não numa parcela futura', async () => {
  const { ultimoMesComDados } = await import('./analytics.ts')
  const hoje = new Date(2026, 9, 11) // out/2026
  const M = [L({ ano: 2026, mes: 9 }), L({ ano: 2027, mes: 3, data: '2027-03-10' })]
  assert.deepEqual(ultimoMesComDados(M, hoje), { ano: 2026, mes: 9 })
  assert.deepEqual(ultimoMesComDados([L({ ano: 2026, mes: 12 })], hoje), { ano: 2026, mes: 12 }, 'só há meses futuros: abre no mais recente')
  assert.deepEqual(ultimoMesComDados([L({ ano: 2025, mes: 12 })], hoje), { ano: 2025, mes: 12 })
})
