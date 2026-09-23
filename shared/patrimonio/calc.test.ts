import { test } from 'node:test'
import assert from 'node:assert/strict'
import { indexar, resumoMes, resumoAno, linhasAtivosMes, patrimonioEm, saldoCarteira, type Base } from './calc.ts'
import type { Investimento, Posicao, Movimentacao, Bem, AvaliacaoBem, Divida, SaldoDivida, Fechamento } from './types.ts'

const now = '2026-01-01T00:00:00.000Z'
const inv = (id: string, extra: Partial<Investimento> = {}): Investimento => ({
  id, nome: id, codigo: null, categoria: 'Acoes', subtipo: null, instituicao: null, dataInicio: '2024-01-01', dataEncerramento: null, vencimento: null, indexador: null,
  condicoes: null, observacoes: null, situacao: 'ativo', nomesOriginais: [], origem: null, origemArquivo: null, criadoEm: now, atualizadoEm: now, ...extra,
})
const pos = (investimentoId: string, ano: number, mes: number, saldo: number | null, extra: Partial<Posicao> = {}): Posicao => ({
  id: `pos-${investimentoId}-${ano}-${mes}`, investimentoId, ano, mes, dataPosicao: null, saldo, quantidade: null, custo: null, situacao: 'confirmada', origem: null, origemArquivo: null, observacoes: null, criadoEm: now, atualizadoEm: now, ...extra,
})
const mov = (id: string, investimentoId: string, tipo: Movimentacao['tipo'], data: string, valor: number, extra: Partial<Movimentacao> = {}): Movimentacao => ({
  id, investimentoId, tipo, data, ano: Number(data.slice(0, 4)), mes: Number(data.slice(5, 7)), valor, quantidade: null, preco: null, taxas: null, irrf: null,
  origemRecurso: 'externo', contaId: null, foraDaPosicao: false, observacoes: null, origem: null, origemArquivo: null, situacao: 'confirmada', financasId: null, criadoEm: now, atualizadoEm: now, ...extra,
})
const fech = (ano: number, mes: number, confirmadas = true): Fechamento => ({ id: `fech-${ano}-${mes}`, ano, mes, status: 'confirmado', movimentacoesConfirmadas: confirmadas, observacoes: null, confirmadoEm: now, criadoEm: now, atualizadoEm: now })
const base = (p: Partial<Base>): Base => ({ investimentos: [], posicoes: [], posicoesConsolidadas: [], movimentacoes: [], fluxosConsolidados: [], contas: [], saldosConta: [], bens: [], avaliacoesBem: [], dividas: [], saldosDivida: [], fechamentos: [], ...p })

test('aporte não vira rendimento: 10.000 + 2.000 aporte → 12.300 = resultado 300', () => {
  const b = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 10000), pos('a', 2024, 2, 12300)], movimentacoes: [mov('m1', 'a', 'aplicacao', '2024-02-10', 2000)], fechamentos: [fech(2024, 2)] })
  const r = resumoMes(b, indexar(b), 2024, 2)
  assert.equal(r.resultado, 300)
  assert.equal(r.aportesLiquidos, 2000)
  assert.equal(r.variacaoSaldo, 2300)
  assert.ok(Math.abs(r.rentabilidade! - 300 / 12000) < 1e-9)
})

test('resgate corrige o resultado para cima; saldo final informado não é somado de novo', () => {
  const b = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 10000), pos('a', 2024, 2, 9000)], movimentacoes: [mov('m1', 'a', 'resgate', '2024-02-10', 1500)], fechamentos: [fech(2024, 2)] })
  const r = resumoMes(b, indexar(b), 2024, 2)
  assert.equal(r.resultado, 500)
  assert.equal(r.saldoFinal, 9000)
})

test('venda total mantém o ativo no mês e no histórico, com saldo final 0', () => {
  const b = base({
    investimentos: [inv('a', { situacao: 'encerrado', dataEncerramento: '2024-02-15' }), inv('b')],
    posicoes: [pos('a', 2024, 1, 1000), pos('b', 2024, 1, 500), pos('b', 2024, 2, 520)],
    movimentacoes: [mov('m1', 'a', 'venda', '2024-02-15', 1100, { quantidade: 10 }), mov('m0', 'a', 'compra', '2024-01-05', 900, { quantidade: 10 })],
    fechamentos: [fech(2024, 2)],
  })
  const ix = indexar(b)
  const linhas = linhasAtivosMes(b, ix, 2024, 2)
  const la = linhas.find((l) => l.inv.id === 'a')!
  assert.ok(la, 'ativo vendido continua listado')
  assert.equal(la.saldoFinal, 0)
  assert.equal(la.resultado, 100) // 0 − 1000 + 1100
  assert.equal(la.quantidadeFinal, 0)
  // carteira: a vendido (0) + b 520 = 520; faltando nada
  assert.equal(saldoCarteira(b, ix, 2024, 2).valor, 520)
  assert.equal(resumoMes(b, ix, 2024, 2).resultado, 520 - 1500 + 1100) // 120
})

test('transferência interna (compra financiada por venda) não é dinheiro novo', () => {
  const b = base({
    investimentos: [inv('a'), inv('b')],
    posicoes: [pos('a', 2024, 1, 1000), pos('b', 2024, 1, 1000), pos('a', 2024, 2, 0), pos('b', 2024, 2, 2050)],
    movimentacoes: [mov('m1', 'a', 'venda', '2024-02-10', 1000, { origemRecurso: 'interno' }), mov('m2', 'b', 'compra', '2024-02-10', 1000, { origemRecurso: 'interno' })],
    fechamentos: [fech(2024, 2)],
  })
  const r = resumoMes(b, indexar(b), 2024, 2)
  assert.equal(r.aportesLiquidos, 0)
  assert.equal(r.resultado, 50)
  assert.equal(r.internos, 2)
})

test('provento pago fora da posição entra uma vez no resultado; dentro da posição não é somado de novo', () => {
  const fora = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 1000), pos('a', 2024, 2, 1000)], movimentacoes: [mov('m1', 'a', 'provento', '2024-02-10', 30, { foraDaPosicao: true })], fechamentos: [fech(2024, 2)] })
  assert.equal(resumoMes(fora, indexar(fora), 2024, 2).resultado, 30)
  const dentro = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 1000), pos('a', 2024, 2, 1030)], movimentacoes: [mov('m1', 'a', 'provento', '2024-02-10', 30, { foraDaPosicao: false })], fechamentos: [fech(2024, 2)] })
  assert.equal(resumoMes(dentro, indexar(dentro), 2024, 2).resultado, 30)
})

test('mês sem dados não vira zero; resultado não é calculado entre meses não consecutivos', () => {
  const b = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 1000), pos('a', 2024, 4, 1200)], fechamentos: [fech(2024, 4)] })
  const ix = indexar(b)
  const fev = resumoMes(b, ix, 2024, 2)
  assert.equal(fev.situacao, 'sem_registros')
  assert.equal(fev.saldoFinal, null)
  const abr = resumoMes(b, ix, 2024, 4)
  assert.equal(abr.resultado, null)
  assert.ok(abr.pendencias.some((p) => p.startsWith('Falta o saldo inicial')))
  assert.equal(resumoAno(b, ix, 2024).rentabilidade, null)
})

test('movimentações não confirmadas impedem apurar o resultado, mas o saldo continua visível', () => {
  const b = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 1000), pos('a', 2024, 2, 1100)] })
  const r = resumoMes(b, indexar(b), 2024, 2)
  assert.equal(r.resultado, null)
  assert.equal(r.saldoFinal, 1100)
  assert.ok(r.pendencias.includes('Movimentações do mês ainda não confirmadas'))
})

test('ativo vigente sem posição deixa o fechamento pendente (falta o saldo final)', () => {
  const b = base({ investimentos: [inv('a'), inv('b')], posicoes: [pos('a', 2024, 1, 1000), pos('b', 2024, 1, 200), pos('a', 2024, 2, 1100)], fechamentos: [fech(2024, 2)] })
  const r = resumoMes(b, indexar(b), 2024, 2)
  assert.equal(r.saldoFinal, null)
  assert.ok(r.pendencias.some((p) => p.includes('b')))
})

test('rentabilidade anual encadeia os meses (não soma) e exige os 12', () => {
  const posics: Posicao[] = [pos('a', 2023, 12, 1000)]
  let v = 1000
  for (let m = 1; m <= 12; m++) { v = Math.round(v * 1.01 * 100) / 100; posics.push(pos('a', 2024, m, v)) }
  const b = base({ investimentos: [inv('a', { dataInicio: '2023-12-01' })], posicoes: posics, fechamentos: Array.from({ length: 12 }, (_, i) => fech(2024, i + 1)) })
  const r = resumoAno(b, indexar(b), 2024)
  assert.equal(r.mesesComResultado, 12)
  assert.ok(Math.abs(r.rentabilidade! - (v / 1000 - 1)) < 1e-6)
  assert.equal(r.carteiraFim?.valor, v)
})

test('propriedade parcial e dívida vinculada: 500.000 × 50% = 250.000; dívida descontada uma vez', () => {
  const bem: Bem = { id: 'casa', nome: 'Casa', categoria: 'imovel', dataAquisicao: '2020-01-01', valorAquisicao: 400000, percentualPropriedade: 0.5, localizacao: null, area: null, marca: null, modelo: null, anoFabricacao: null, dividaId: 'fin', situacao: 'ativo', dataVenda: null, valorVenda: null, observacoes: null, criadoEm: now, atualizadoEm: now }
  const av: AvaliacaoBem = { id: 'av1', bemId: 'casa', data: '2024-01-15', valor: 500000, fonte: 'própria', observacoes: null, criadoEm: now }
  const div: Divida = { id: 'fin', nome: 'Financiamento', instituicao: 'Banco', tipo: 'financiamento', dataInicio: '2020-01-01', vencimento: null, bemId: 'casa', situacao: 'ativa', observacoes: null, criadoEm: now, atualizadoEm: now }
  const sd: SaldoDivida = { id: 'sd1', dividaId: 'fin', data: '2024-01-31', ano: 2024, mes: 1, saldoDevedor: 100000, origem: null, observacoes: null, criadoEm: now }
  const b = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 10000)], bens: [bem], avaliacoesBem: [av], dividas: [div], saldosDivida: [sd] })
  const p = patrimonioEm(b, indexar(b), 2024, 1)
  assert.equal(p.imoveis, 250000)
  assert.equal(p.bruto, 260000)
  assert.equal(p.liquido, 160000)
  // antes da avaliação, usa o valor de aquisição × participação; antes da aquisição, não entra
  const p0 = patrimonioEm(b, indexar(b), 2023, 12)
  assert.equal(p0.imoveis, 200000)
  assert.equal(patrimonioEm(base({ bens: [{ ...bem, dataAquisicao: '2024-06-01' }], avaliacoesBem: [av] }), indexar(base({})), 2024, 1).bruto, null)
})

test('inclusão de um bem já possuído muda a cobertura, não o resultado dos investimentos', () => {
  const b = base({ investimentos: [inv('a')], posicoes: [pos('a', 2024, 1, 1000), pos('a', 2024, 2, 1000)], fechamentos: [fech(2024, 2)],
    bens: [{ id: 'carro', nome: 'Carro', categoria: 'veiculo', dataAquisicao: '2024-02-01', valorAquisicao: 50000, percentualPropriedade: 1, localizacao: null, area: null, marca: null, modelo: null, anoFabricacao: null, dividaId: null, situacao: 'ativo', dataVenda: null, valorVenda: null, observacoes: null, criadoEm: now, atualizadoEm: now }] })
  const ix = indexar(b)
  assert.equal(resumoMes(b, ix, 2024, 2).resultado, 0)
  assert.equal(patrimonioEm(b, ix, 2024, 1).cobertura.bens, false)
  assert.equal(patrimonioEm(b, ix, 2024, 2).cobertura.bens, true)
})
