/** Regressão dos cálculos patrimoniais apontados na auditoria (dados sintéticos). */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexar, patrimonioEm, resumoMes, type Base } from './calc.ts'
import type { Conta, SaldoConta, Divida, SaldoDivida, Investimento, Posicao, Movimentacao, FluxoConsolidado, Bem } from './types.ts'

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

const inv = (id: string): Investimento => ({ id, nome: id, codigo: null, categoria: 'RendaFixa', subtipo: null, instituicao: null, dataInicio: '2025-01-01', dataEncerramento: null, vencimento: null, indexador: null, condicoes: null, observacoes: null, situacao: 'ativo', nomesOriginais: [], origem: null, origemArquivo: null, criadoEm: now, atualizadoEm: now })
const pos = (ano: number, mes: number, saldo: number): Posicao => ({ id: `pos-A-${ano}-${mes}`, investimentoId: 'A', ano, mes, dataPosicao: null, saldo, quantidade: null, custo: null, situacao: 'confirmada', origem: null, origemArquivo: null, observacoes: null, criadoEm: now, atualizadoEm: now })
const fluxo = (ano: number, mes: number, aportesLiquidos: number): FluxoConsolidado => ({ id: `fc-${ano}-${mes}`, ano, mes, aportesLiquidos, proventos: null, proventosSituacao: null, resultadoInformado: null, resultadoExcluiProventos: false, retornoInformado: null, ibov: null, ajuste: null, ajusteMotivo: null, origem: 'manual', origemArquivo: null, financasIds: [], observacoes: null, criadoEm: now, atualizadoEm: now })
const mov = (tipo: Movimentacao['tipo'], valor: number): Movimentacao => ({ id: `m-${tipo}`, investimentoId: 'A', tipo, data: '2026-02-20', ano: 2026, mes: 2, valor, quantidade: null, preco: null, taxas: null, irrf: null, origemRecurso: 'externo', contaId: null, foraDaPosicao: false, observacoes: null, origem: null, origemArquivo: null, situacao: 'confirmada', financasId: null, criadoEm: now, atualizadoEm: now })

test('PAT-001: aporte informado que diverge das movimentações vira pendência, não resultado "completo"', () => {
  const b = base({ investimentos: [inv('A')], posicoes: [pos(2026, 1, 10000), pos(2026, 2, 11100)], fluxosConsolidados: [fluxo(2026, 2, 0)], movimentacoes: [mov('aplicacao', 1000)] })
  const r = resumoMes(b, indexar(b), 2026, 2)
  assert.equal(r.resultado, null)
  assert.equal(r.situacao, 'parcial')
  assert.match(r.pendencias.join(' '), /difere das movimentações/)
  // sinal invertido (resgate registrado, aporte informado como positivo) também é apontado
  const inv2 = base({ investimentos: [inv('A')], posicoes: [pos(2026, 1, 10000), pos(2026, 2, 7100)], fluxosConsolidados: [fluxo(2026, 2, 2996)], movimentacoes: [mov('resgate', 2996)] })
  assert.equal(resumoMes(inv2, indexar(inv2), 2026, 2).resultado, null)
  // quando batem, o mês continua completo e o resultado é o de sempre
  const ok = base({ investimentos: [inv('A')], posicoes: [pos(2026, 1, 10000), pos(2026, 2, 11100)], fluxosConsolidados: [fluxo(2026, 2, 1000)], movimentacoes: [mov('aplicacao', 1000)] })
  const rok = resumoMes(ok, indexar(ok), 2026, 2)
  assert.equal(rok.resultado, 100)
  assert.equal(rok.situacao, 'completo')
})

test('PAT-003: mês sem posição dos investimentos não mostra patrimônio como se eles valessem zero', () => {
  const apto: Bem = { id: 'b', nome: 'Apto', categoria: 'imovel', dataAquisicao: '2020-01-01', valorAquisicao: 300000, percentualPropriedade: 1, localizacao: null, area: null, marca: null, modelo: null, anoFabricacao: null, dividaId: null, situacao: 'ativo', dataVenda: null, valorVenda: null, observacoes: null, criadoEm: now, atualizadoEm: now }
  const b = base({ investimentos: [inv('A')], posicoes: [pos(2026, 8, 200000)], bens: [apto] })
  assert.equal(liquido(b, 2026, 8), 500000)
  assert.equal(liquido(b, 2026, 9), null)
  // sem nenhum investimento cadastrado, o patrimônio é só o que existe
  assert.equal(liquido(base({ bens: [apto] }), 2026, 9), 300000)
})

test('PAT-009: evento societário soma ou subtrai pela quantidade com sinal', async () => {
  const { quantidadeAte } = await import('./calc.ts')
  const acao: Investimento = { ...inv('X'), categoria: 'Acoes' }
  const m = (tipo: Movimentacao['tipo'], quantidade: number, data: string): Movimentacao => ({ ...mov(tipo, 0), id: `${tipo}-${data}`, investimentoId: 'X', quantidade, data, ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)) })
  const b = base({ investimentos: [acao], movimentacoes: [m('compra', 100, '2026-01-10'), m('evento', 100, '2026-02-10'), m('evento', -50, '2026-03-10')] })
  const ix = indexar(b)
  assert.equal(quantidadeAte(ix, 'X', 2026, 2), 200, 'desdobramento 1:2')
  assert.equal(quantidadeAte(ix, 'X', 2026, 3), 150, 'grupamento')
})

test('PAT-005: saldo repetido há 3 meses ou mais é apontado como desatualizado', () => {
  const b = base({ contas: [conta()], saldosConta: [saldoConta(2025, 6, 50000)] })
  assert.deepEqual(patrimonioEm(b, indexar(b), 2025, 8).defasados, [])
  assert.deepEqual(patrimonioEm(b, indexar(b), 2025, 9).defasados, [{ nome: 'CC', desde: '2025-06' }])
})
