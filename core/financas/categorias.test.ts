/** Regressão das categorias (auditoria FIN-009, FIN-010, FIN-011). Banco em arquivo temporário. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

// banco "antigo" com duas raízes "Compras Online" (o UNIQUE com parent_id NULL não impedia)
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-cat-'))
const arquivo = path.join(dir, 'financas.db')
const velho = new DatabaseSync(arquivo)
velho.exec(`CREATE TABLE categorias (id INTEGER PRIMARY KEY AUTOINCREMENT, nome TEXT NOT NULL, tipo TEXT NOT NULL, grupo TEXT,
  parent_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE, ordem INTEGER NOT NULL DEFAULT 0, UNIQUE(nome, tipo, parent_id));
  INSERT INTO categorias (id, nome, tipo, grupo, parent_id) VALUES (1, 'Compras Online', 'despesa', 'Extras', NULL), (2, 'Amazon', 'despesa', 'Extras', 1), (3, 'Shopee', 'despesa', 'Extras', 1),
    (4, 'Compras Online', 'despesa', 'Variáveis', NULL), (5, 'Shopee', 'despesa', 'Variáveis', 4), (6, 'Aliexpress', 'despesa', 'Variáveis', 4);`)
velho.close()
process.env.FINANCAS_DB = arquivo
const api = await import('./api.ts')
const raizes = (nome: string) => api.categorias().filter((c) => c.parentId == null && c.tipo === 'despesa' && c.nome === nome)
const filhas = (id: number) => api.categorias().filter((c) => c.parentId === id).map((c) => c.nome).sort()

test('FIN-009: raízes duplicadas existentes são unificadas na abertura, sem perder subcategorias', () => {
  const r = raizes('Compras Online')
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 1, 'fica a mais antiga')
  assert.deepEqual(filhas(1), ['Aliexpress', 'Amazon', 'Shopee'])
})

test('FIN-009: criar outra raiz com o mesmo nome e tipo é recusado', () => {
  assert.throws(() => api.criarCategoria({ nome: 'Compras Online', tipo: 'despesa', grupo: 'Extras' }), /Já existe/)
  assert.ok(api.criarCategoria({ nome: 'Compras Online', tipo: 'receita' }), 'mesmo nome em outro tipo é permitido')
})

test('FIN-010: renomear categoria ou subcategoria atualiza as recorrências', () => {
  const pets = api.criarCategoria({ nome: 'Pets', tipo: 'despesa', grupo: 'Extras' })
  const racao = api.criarCategoria({ nome: 'Ração', tipo: 'despesa', grupo: 'Extras', parentId: pets.id })
  api.criarRecorrencia({ id: '', descricao: 'Ração mensal', valor: 200, tipo: 'despesa', grupo: 'Extras', categoria: 'Pets', subcategoria: 'Ração', conta: null, formaPagamento: null, dia: 5, inicio: '2026-01', fim: null, observacoes: null, ativo: true })
  api.atualizarCategoria({ id: pets.id, nome: 'Animais' })
  api.atualizarCategoria({ id: racao.id, nome: 'Ração e areia' })
  const [r] = api.recorrencias()
  assert.deepEqual([r.categoria, r.subcategoria], ['Animais', 'Ração e areia'])
  const l = api.lancamentos().length
  api.gerarRecorrencias({ ano: 2026, mes: 5 })
  const novo = api.lancamentos().slice(l)[0] ?? api.lancamentos().find((x) => x.recorrenciaId === r.id)!
  assert.deepEqual([novo.categoria, novo.subcategoria], ['Animais', 'Ração e areia'])
})

test('FIN-011: restaurar (mesclar) um backup de outro banco encaixa as subcategorias pelo nome', () => {
  // ids do backup colidem com ids daqui que são outras categorias
  const outra = { versao: 1 as const, geradoEm: '', lancamentos: [], contas: [], recorrencias: [], categorias: [
    { id: 1, nome: 'Viagem', tipo: 'despesa' as const, grupo: 'Adicionais' as const, parentId: null, ordem: 1 },
    { id: 2, nome: 'Hotel', tipo: 'despesa' as const, grupo: 'Adicionais' as const, parentId: 1, ordem: 1 },
    { id: 3, nome: 'Compras Online', tipo: 'despesa' as const, grupo: 'Extras' as const, parentId: null, ordem: 2 },
    { id: 4, nome: 'Mercado Livre', tipo: 'despesa' as const, grupo: 'Extras' as const, parentId: 3, ordem: 1 },
  ] }
  api.restaurar({ b: outra, modo: 'mesclar' })
  const viagem = raizes('Viagem')
  assert.equal(viagem.length, 1)
  assert.deepEqual(filhas(viagem[0].id), ['Hotel'])
  assert.deepEqual(filhas(1), ['Aliexpress', 'Amazon', 'Mercado Livre', 'Shopee'], 'Mercado Livre entrou na Compras Online existente, não em outra')
  assert.equal(raizes('Compras Online').length, 1)
})
