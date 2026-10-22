/** Busca global. Dados sintéticos. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buscar } from './busca.ts'
import type { Lancamento, Categoria } from '@fin-shared/types'
import type { Investimento } from '@pat-shared/types'

let seq = 0
const L = (o: Partial<Lancamento>): Lancamento => ({ id: `l${++seq}`, data: '2026-03-10', ano: 2026, mes: 3, descricao: 'x', tipo: 'despesa', valor: 10, grupo: 'Variáveis', categoria: null, subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, parcelamentoId: null, criadoEm: '', atualizadoEm: '', ...o })
const cats: Categoria[] = [{ id: 1, nome: 'Saúde', tipo: 'despesa', grupo: 'Variáveis', parentId: null, ordem: 1 }, { id: 2, nome: 'Farmácia', tipo: 'despesa', grupo: 'Variáveis', parentId: 1, ordem: 1 }]
const fontes = {
  telas: [{ rotulo: 'Projeção', to: '/financas/projecao', secao: 'Finanças' }],
  categorias: cats,
  investimentos: [{ id: 'i1', nome: 'Tesouro Selic 2029', codigo: null, instituicao: 'Nubank', situacao: 'ativo' } as Investimento],
  lancamentos: [L({ descricao: 'Drogaria São João', categoria: 'Saúde', subcategoria: 'Farmácia', valor: 1234.56, data: '2026-02-01' }), L({ descricao: 'Unimed', valor: 855.43, data: '2026-03-01' }), L({ descricao: 'Tinta', foraDoFluxo: true, ledger: 'Reforma', valor: 120 })],
}

test('sem acento, várias palavras, categoria com caminho e destino certo', () => {
  const r = buscar('saude farmacia', fontes)
  assert.deepEqual(r.itens.map((i) => [i.grupo, i.titulo]), [['Categorias', 'Saúde › Farmácia'], ['Lançamentos', 'Drogaria São João']])
  assert.equal(r.itens[0].destino, '/financas/tendencias?cat=Sa%C3%BAde&sub=Farm%C3%A1cia')
  assert.equal(r.itens[1].destino, `/financas/lancamentos?id=${fontes.lancamentos[0].id}`)
})

test('valor em formato brasileiro casa com o valor exato; custo de projeto leva para Projetos', () => {
  assert.deepEqual(buscar('1.234,56', fontes).itens.map((i) => i.titulo), ['Drogaria São João'])
  assert.deepEqual(buscar('855.43', fontes).itens.map((i) => i.titulo), ['Unimed'])
  const t = buscar('reforma', fontes).itens
  assert.deepEqual(t.map((i) => [i.titulo, i.destino]), [['Tinta', '/financas/projetos']])
})

test('telas e investimentos; busca vazia não lista nada', () => {
  assert.deepEqual(buscar('projeç', fontes).itens.map((i) => i.grupo), ['Telas'])
  assert.equal(buscar('selic', fontes).itens[0].destino, '/patrimonio/investimentos?id=i1')
  assert.deepEqual(buscar('   ', fontes).itens, [])
})
