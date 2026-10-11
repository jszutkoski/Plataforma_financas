/** Regressão FIN-004: a natureza (grupo) da despesa é sempre válida e segue a categoria. Banco em memória. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as api from './api.ts'

const lanc = (o: Record<string, unknown>) => ({ data: '2026-03-10', descricao: 'x', tipo: 'despesa' as const, valor: 10, grupo: null, categoria: null, subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, ...o })

test('despesa sem natureza herda a da categoria; natureza inválida não é gravada', () => {
  api.iniciar()
  api.criarCategoria({ nome: 'Plano de saúde', tipo: 'despesa', grupo: 'Fixas' })
  assert.equal(api.criarLancamento(lanc({ categoria: 'Plano de saúde' })).grupo, 'Fixas')
  assert.equal(api.criarLancamento(lanc({ categoria: 'Plano de saúde', grupo: 'Extras' })).grupo, 'Extras', 'escolha explícita válida é respeitada')
  assert.equal(api.criarLancamento(lanc({ categoria: 'Plano de saúde', grupo: 'Receita' })).grupo, 'Fixas', 'grupo de outro tipo não vale para despesa')
  assert.equal(api.criarLancamento(lanc({ categoria: 'Inexistente' })).grupo, 'Variáveis')
})

test('trocar o tipo de receita para despesa não carrega o grupo "Receita"', () => {
  const r = api.criarLancamento(lanc({ tipo: 'receita', descricao: 'Salário', valor: 5000 }))
  assert.equal(r.grupo, 'Receita')
  const d = api.atualizarLanc({ id: r.id, input: { ...r, tipo: 'despesa', ano: undefined, mes: undefined } })
  assert.equal(d.grupo, 'Variáveis')
  const v = api.atualizarLanc({ id: r.id, input: { ...d, tipo: 'receita', grupo: 'Fixas', ano: undefined, mes: undefined } })
  assert.equal(v.grupo, 'Receita')
})
