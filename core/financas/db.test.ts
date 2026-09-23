/** Testes do núcleo de dados (banco em memória). Execute com: npm test */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { db, inserirLancamento, atualizarLancamento, validarLancamento, listarLancamentos, garantirCategoria, listarCategorias, gerarParcelamento, prepararBancoNovo } from './db.ts'

test('validação rejeita entradas inválidas', () => {
  assert.deepEqual(validarLancamento({}), ['Data inválida (use AAAA-MM-DD).', 'Descrição obrigatória.', 'Tipo inválido.', 'Valor deve ser um número maior que zero.'])
  assert.deepEqual(validarLancamento({ data: '2026-02-30', descricao: 'x', tipo: 'despesa', valor: 1 }), ['Data inválida (use AAAA-MM-DD).'])
  assert.deepEqual(validarLancamento({ data: '2024-02-29', descricao: 'x', tipo: 'despesa', valor: 1 }), [])
  assert.deepEqual(validarLancamento({ data: '2026-01-10', descricao: 'x', tipo: 'despesa', valor: 10, parcela: 3, totalParcelas: 2 }), ['Número da parcela maior que o total de parcelas.'])
})

test('inserir/atualizar deriva competência e arredonda valor', () => {
  const l = inserirLancamento({ data: '2026-03-15', descricao: ' Mercado ', tipo: 'despesa', valor: 10.005, grupo: null, categoria: 'Alimentação', subcategoria: 'Supermercado', conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null })
  assert.equal(l.ano, 2026); assert.equal(l.mes, 3); assert.equal(l.valor, 10.01); assert.equal(l.descricao, 'Mercado'); assert.equal(l.grupo, 'Variáveis'); assert.equal(l.origem, 'manual')
  const u = atualizarLancamento(l.id, { ...l, data: '2026-04-02', ano: 2026, mes: 3 })
  assert.equal(u?.mes, 3, 'competência manual preservada')
  db.prepare('DELETE FROM lancamentos WHERE id = ?').run(l.id)
})

test('garantirCategoria cria árvore sem duplicar', () => {
  db.exec('DELETE FROM categorias')
  garantirCategoria('despesa', 'Fixas', 'Habitação', 'Aluguel')
  garantirCategoria('despesa', 'Fixas', 'Habitação', 'Aluguel')
  garantirCategoria('despesa', 'Fixas', 'Habitação', 'Luz')
  const cats = listarCategorias().filter((c) => c.tipo === 'despesa')
  const hab = cats.find((c) => c.nome === 'Habitação' && c.parentId == null)!
  assert.ok(hab)
  assert.deepEqual(cats.filter((c) => c.parentId === hab.id).map((c) => c.nome).sort(), ['Aluguel', 'Luz'])
})

test('banco novo recebe as categorias padrão (e não as recria)', () => {
  db.exec('DELETE FROM categorias')
  const r = prepararBancoNovo()
  assert.ok(r.categorias > 0)
  const raiz = listarCategorias().filter((c) => c.parentId == null)
  assert.ok(raiz.some((c) => c.tipo === 'receita'))
  assert.ok(raiz.some((c) => c.tipo === 'despesa'))
  assert.deepEqual(prepararBancoNovo(), { categorias: 0 }, 'banco com categorias não é tocado')
})

test('parcelamento divide o total e distribui nos meses seguintes', () => {
  db.exec('DELETE FROM lancamentos')
  const base = { data: '2026-01-15', descricao: 'Geladeira', tipo: 'despesa' as const, valor: 0, grupo: null, categoria: 'Casa', subcategoria: null, conta: null,
    formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: 'manual', origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null }
  const r = gerarParcelamento(base, 1000, 3, '2026-01-15')
  assert.equal(r.criados, 3)
  const L = listarLancamentos().filter((l) => l.parcelamentoId === r.parcelamentoId)
  assert.deepEqual(L.map((l) => l.data), ['2026-01-15', '2026-02-15', '2026-03-15'])
  assert.equal(Math.round(L.reduce((a, l) => a + l.valor, 0) * 100) / 100, 1000)
  assert.deepEqual(L.map((l) => l.parcela), [1, 2, 3])
  db.exec('DELETE FROM lancamentos')
})
