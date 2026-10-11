/**
 * Regressão de persistência (auditoria FIN-001, FIN-012): banco em ARQUIVO temporário, para provar que
 * o que a operação diz ter gravado continua lá quando o banco é aberto de novo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fin-persist-'))
process.env.FINANCAS_DB = path.join(dir, 'financas.db')
const api = await import('./api.ts')
const { db } = await import('./db.ts')
api.iniciar()

/** Lê o arquivo por outra conexão: só enxerga o que foi efetivamente confirmado. */
const contarNoArquivo = (sql: string, ...p: (string | number)[]): number => {
  const outra = new DatabaseSync(process.env.FINANCAS_DB!, { readOnly: true })
  try { return Number((outra.prepare(sql).get(...p) as { n: number }).n) } finally { outra.close() }
}
const lanc = (descricao: string) => ({ data: '2026-03-10', descricao, tipo: 'despesa' as const, valor: 10, grupo: null, categoria: null, subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null })

test('erro dentro de uma transação não deixa a conexão presa (FIN-001)', () => {
  api.criarConta({ nome: 'Nubank' })
  const inter = api.criarConta({ nome: 'Inter' })
  assert.throws(() => api.atualizarConta({ id: inter.id, nome: 'Nubank' }), /Já existe uma conta/)
  assert.equal(db.isTransaction, false)
  // gravações seguintes são confirmadas de verdade
  api.criarLancamento(lanc('depois do erro'))
  api.lote({ itens: [lanc('lote depois do erro')], origemArquivo: 't.csv' })
  assert.equal(contarNoArquivo("SELECT COUNT(*) AS n FROM lancamentos WHERE descricao LIKE '%depois do erro'"), 2)
})

test('falha ao gerar recorrências desfaz o mês inteiro e libera a conexão', () => {
  api.criarRecorrencia({ id: '', descricao: 'Aluguel', valor: 1000, tipo: 'despesa', grupo: 'Fixas', categoria: 'Moradia', subcategoria: null, conta: null, formaPagamento: null, dia: 5, inicio: '2026-01', fim: null, observacoes: null, ativo: true })
  db.prepare("INSERT INTO recorrencias (id, descricao, valor, tipo, dia, inicio, ativo) VALUES ('rec-ruim', 'Ruim', 5, 'tipo-invalido', 1, '2026-01', 1)").run()
  assert.throws(() => api.gerarRecorrencias({ ano: 2026, mes: 4 }))
  assert.equal(db.isTransaction, false)
  assert.equal(contarNoArquivo('SELECT COUNT(*) AS n FROM lancamentos WHERE ano = 2026 AND mes = 4'), 0, 'nada do mês foi gravado pela metade')
  db.prepare("DELETE FROM recorrencias WHERE id = 'rec-ruim'").run()
  assert.equal(api.gerarRecorrencias({ ano: 2026, mes: 4 }).criados, 1)
})

test('reordenar categorias grava a nova ordem', () => {
  const raizes = api.categorias().filter((c) => c.parentId == null && c.tipo === 'despesa').map((c) => c.id)
  api.reordenarCategorias({ ids: [raizes[1], raizes[0], ...raizes.slice(2)] })
  const depois = api.categorias().filter((c) => c.parentId == null && c.tipo === 'despesa').map((c) => c.id)
  assert.deepEqual(depois.slice(0, 2), [raizes[1], raizes[0]])
})

test('restaurar (substituir) e apagar tudo guardam antes uma cópia do banco (FIN-012)', () => {
  const antes = api.lancamentos().length
  const b = api.backup()
  const r = api.restaurar({ b: { ...b, lancamentos: [] }, modo: 'substituir' })
  assert.ok(r.copia && fs.existsSync(r.copia))
  assert.equal(contarNoArquivo('SELECT COUNT(*) AS n FROM lancamentos'), 0)
  const copia = new DatabaseSync(r.copia!, { readOnly: true })
  assert.equal(Number((copia.prepare('SELECT COUNT(*) AS n FROM lancamentos').get() as { n: number }).n), antes, 'a cópia tem os dados de antes')
  copia.close()
  const l = api.limpar({ confirmar: 'APAGAR TUDO' })
  assert.ok(l.copia && fs.existsSync(l.copia))
  const arq = api.backupArquivo()
  assert.ok(fs.existsSync(arq.arquivo))
})
