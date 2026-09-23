/** Testes do núcleo de dados e dos cálculos (banco de teste; nenhum dado real é necessário). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contar, listar, gerarBackup, restaurarBackup, salvar, excluir, TABELAS, type NomeTabela, db } from './db.ts'
import { indexar, resumoMes, resumoAno, saldoCarteira, type Base } from '../../shared/patrimonio/calc.ts'

function carregar(): Base {
  const b: Record<string, unknown[]> = {}
  for (const n of Object.keys(TABELAS) as NomeTabela[]) b[n] = listar(n)
  return b as unknown as Base
}

function limpar() {
  for (const t of Object.values(TABELAS)) db.exec(`DELETE FROM ${t.nome}`)
}

/** Carteira de exemplo: um CDB com posição em dez/25 e jan/26, e um aporte de 1.000 em jan/26. */
function base() {
  limpar()
  salvar('investimentos', { id: 'inv-1', nome: 'CDB Banco X', codigo: null, categoria: 'renda_fixa', subtipo: 'CDB', instituicao: 'Banco X', dataInicio: '2025-12-01', situacao: 'ativo', origem: 'manual', origemArquivo: null })
  salvar('posicoes', { id: 'pos-1', investimentoId: 'inv-1', ano: 2025, mes: 12, dataPosicao: '2025-12-31', saldo: 10000, situacao: 'confirmada', origem: 'manual' })
  salvar('posicoes', { id: 'pos-2', investimentoId: 'inv-1', ano: 2026, mes: 1, dataPosicao: '2026-01-31', saldo: 11100, situacao: 'confirmada', origem: 'manual' })
  salvar('fluxosConsolidados', { id: 'flx-2026-01', ano: 2026, mes: 1, aportesLiquidos: 1000, proventos: null, resultadoExcluiProventos: false, origem: 'manual' })
}

test('salvar/listar/excluir mantêm a base consistente', () => {
  base()
  assert.equal(contar('investimentos'), 1)
  assert.equal(contar('posicoes'), 2)
  salvar('contas', { id: 'cta-1', nome: 'Corretora', instituicao: null, tipo: 'corretora', financasNome: null, ativo: true, observacoes: null })
  assert.equal(listar('contas').length, 1)
  excluir('contas', 'cta-1')
  assert.equal(contar('contas'), 0)
})

test('saldo da carteira soma as posições do mês', () => {
  base()
  const b = carregar(); const ix = indexar(b)
  assert.equal(saldoCarteira(b, ix, 2025, 12).valor, 10000)
  assert.equal(saldoCarteira(b, ix, 2026, 1).valor, 11100)
  assert.equal(saldoCarteira(b, ix, 2026, 3).valor, null, 'mês sem posição não é estimado')
})

test('resultado do mês desconta o aporte da variação do saldo', () => {
  base()
  const b = carregar(); const ix = indexar(b)
  const jan = resumoMes(b, ix, 2026, 1)
  assert.equal(jan.aportesLiquidos, 1000)
  assert.equal(jan.resultado, 100, '11.100 − 10.000 − 1.000 de aporte')
  assert.equal(resumoAno(b, ix, 2026).mesesComResultado, 1)
})

test('backup e restauração preservam toda a base', () => {
  base()
  const antes = gerarBackup()
  salvar('contas', { id: 'cta-teste', nome: 'Conta teste', instituicao: null, tipo: 'corrente', financasNome: null, ativo: true, observacoes: null })
  const n = restaurarBackup(antes, 'substituir')
  assert.equal(n.investimentos, 1)
  assert.equal(contar('contas'), 0, 'substituir apaga o que não está no backup')
  const depois = gerarBackup()
  for (const k of Object.keys(TABELAS)) assert.equal((depois as unknown as Record<string, unknown[]>)[k].length, (antes as unknown as Record<string, unknown[]>)[k].length, k)
  assert.equal(restaurarBackup(antes, 'mesclar').investimentos, 0, 'mesclar não duplica')
  limpar()
})
