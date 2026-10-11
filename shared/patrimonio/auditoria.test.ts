/** Regressão dos cálculos patrimoniais apontados na auditoria (dados sintéticos). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexar, patrimonioEm, type Base } from './calc.ts'
import type { Conta, SaldoConta, Divida, SaldoDivida } from './types.ts'

const now = '2026-01-01T00:00:00.000Z'
const base = (p: Partial<Base>): Base => ({ investimentos: [], posicoes: [], posicoesConsolidadas: [], movimentacoes: [], fluxosConsolidados: [], contas: [], saldosConta: [], bens: [], avaliacoesBem: [], dividas: [], saldosDivida: [], fechamentos: [], ...p })
const conta = (extra: Partial<Conta> = {}): Conta => ({ id: 'c', nome: 'CC', instituicao: null, tipo: 'corrente', financasNome: null, ativo: true, observacoes: null, criadoEm: now, atualizadoEm: now, ...extra })
const saldoConta = (ano: number, mes: number, saldo: number): SaldoConta => ({ id: `sc-${ano}-${mes}`, contaId: 'c', ano, mes, data: null, saldo, situacao: 'confirmada', origem: null, observacoes: null, criadoEm: now, atualizadoEm: now })
const divida = (extra: Partial<Divida> = {}): Divida => ({ id: 'd', nome: 'Empréstimo', instituicao: null, tipo: null, dataInicio: '2025-01-01', vencimento: null, bemId: null, situacao: 'ativa', observacoes: null, criadoEm: now, atualizadoEm: now, ...extra })
const saldoDivida = (data: string, saldoDevedor: number): SaldoDivida => ({ id: `sd-${data}`, dividaId: 'd', data, ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)), saldoDevedor, origem: null, observacoes: null, criadoEm: now })
const liquido = (b: Base, ano: number, mes: number) => patrimonioEm(b, indexar(b), ano, mes).liquido

test('PAT-002: quitar a dívida não altera os meses anteriores à quitação', () => {
  const comum = { contas: [conta()], saldosConta: [saldoConta(2025, 6, 50000)], saldosDivida: [saldoDivida('2025-06-30', 30000)] }
  assert.equal(liquido(base({ ...comum, dividas: [divida()] }), 2025, 6), 20000)
  const quitada = base({ ...comum, dividas: [divida({ situacao: 'quitada', dataQuitacao: '2026-02-10' })] })
  assert.equal(liquido(quitada, 2025, 6), 20000, 'histórico preservado')
  assert.equal(liquido(quitada, 2026, 1), 20000, 'ainda devia em jan/2026')
  assert.equal(liquido(quitada, 2026, 2), 50000, 'quitada em fev/2026')
  // sem data informada: vale até o último saldo registrado
  const semData = base({ ...comum, dividas: [divida({ situacao: 'quitada' })] })
  assert.equal(liquido(semData, 2025, 6), 20000)
  assert.equal(liquido(semData, 2025, 7), 50000)
})

test('PAT-002: desativar a conta não apaga o saldo dos meses em que ela existia', () => {
  const b = (c: Conta) => base({ contas: [c], saldosConta: [saldoConta(2025, 6, 50000)] })
  assert.equal(liquido(b(conta({ ativo: false, dataEncerramento: '2025-09-15' })), 2025, 6), 50000)
  assert.equal(liquido(b(conta({ ativo: false, dataEncerramento: '2025-09-15' })), 2025, 9), null)
  assert.equal(liquido(b(conta({ ativo: false })), 2025, 6), 50000)
  assert.equal(liquido(b(conta({ ativo: false })), 2025, 7), null)
})
