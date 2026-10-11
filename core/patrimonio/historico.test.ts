/** Regressão (auditoria PAT-004): gravações nunca apagam outro registro em silêncio. Banco em memória. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as api from './api.ts'
import { listar, gerarBackup, restaurarBackup, TABELAS, db } from './db.ts'
import type { Posicao } from '../../shared/patrimonio/types.ts'

const limpar = () => { for (const t of Object.values(TABELAS)) db.exec(`DELETE FROM ${t.nome}`) }
const saldos = () => listar<Posicao>('posicoes').map((p) => [p.mes, p.saldo]).sort()

test('mudar o mês de uma posição para um mês ocupado é recusado e nada se perde', () => {
  limpar()
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
  api.criar({ t: 'posicoes', item: { investimentoId: inv.id, ano: 2026, mes: 1, saldo: 1000, situacao: 'confirmada' } })
  const fev = api.criar({ t: 'posicoes', item: { investimentoId: inv.id, ano: 2026, mes: 2, saldo: 1010, situacao: 'confirmada' } }) as { id: string }
  assert.throws(() => api.atualizar({ t: 'posicoes', id: fev.id, item: { mes: 1 } }), /Já existe outro registro/)
  assert.deepEqual(saldos(), [[1, 1000], [2, 1010]])
  assert.equal(db.isTransaction, false)
})

test('criar de novo a posição de um mês atualiza a existente (sem duplicar nem trocar o id)', () => {
  limpar()
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
  const a = api.criar({ t: 'posicoes', item: { id: 'pos-importada', investimentoId: inv.id, ano: 2026, mes: 1, saldo: 1000, situacao: 'informada' } }) as { id: string; criadoEm: string }
  const b = api.criar({ t: 'posicoes', item: { investimentoId: inv.id, ano: 2026, mes: 1, saldo: 1005, situacao: 'confirmada' } }) as { id: string; criadoEm: string }
  assert.equal(b.id, a.id)
  assert.equal(b.criadoEm, a.criadoEm)
  assert.deepEqual(saldos(), [[1, 1005]])
})

test('restaurar no modo mesclar nunca sobrescreve um mês que já tem dado', () => {
  limpar()
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
  api.criar({ t: 'posicoes', item: { investimentoId: inv.id, ano: 2026, mes: 1, saldo: 1010, situacao: 'confirmada' } })
  const bk = gerarBackup()
  const outro = { ...bk, posicoes: [{ ...bk.posicoes[0], id: 'pos-de-outro-backup', saldo: 999999 }, { ...bk.posicoes[0], id: 'pos-nova', mes: 2, saldo: 1020 }] }
  const r = restaurarBackup(outro, 'mesclar')
  assert.deepEqual(saldos(), [[1, 1010], [2, 1020]], 'janeiro intacto, fevereiro acrescentado')
  assert.equal(r['ignorados por já existirem (mesmo mês/ativo)'], 1)
})

import * as fin from '../financas/api.ts'

test('PAT-010: fechamento com uma linha inválida não grava nada', () => {
  limpar()
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
  assert.throws(() => api.fechamento({ ano: 2026, mes: 3, status: 'confirmado', movimentacoesConfirmadas: true, observacoes: null,
    posicoes: [{ investimentoId: inv.id, saldo: 1000 }], movimentacoes: [], saldosConta: [{ contaId: '', saldo: 50 }] }), /Nada foi gravado/)
  assert.equal(listar('posicoes').length, 0)
  assert.equal(listar('fechamentos').length, 0)
  assert.equal(db.isTransaction, false)
})

test('PAT-010: fechamento grava posições, total da carteira, contas e dívidas no mesmo passo', () => {
  limpar()
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
  const conta = api.criar({ t: 'contas', item: { nome: 'CC', tipo: 'corrente', ativo: true } }) as { id: string }
  const div = api.criar({ t: 'dividas', item: { nome: 'Empréstimo', situacao: 'ativa' } }) as { id: string }
  api.fechamento({ ano: 2026, mes: 3, status: 'confirmado', movimentacoesConfirmadas: true, observacoes: null, posicoes: [{ investimentoId: inv.id, saldo: 1000 }], movimentacoes: [],
    totalCarteira: { saldo: 1000 }, saldosConta: [{ contaId: conta.id, saldo: 50 }], saldosDivida: [{ dividaId: div.id, saldo: 300 }] })
  assert.deepEqual([listar('posicoes').length, listar('posicoesConsolidadas').length, listar('saldosConta').length, listar('saldosDivida').length, listar('fechamentos').length], [1, 1, 1, 1, 1])
  // refazer o mês atualiza o saldo da dívida em vez de duplicar
  api.fechamento({ ano: 2026, mes: 3, status: 'confirmado', movimentacoesConfirmadas: true, observacoes: null, posicoes: [{ investimentoId: inv.id, saldo: 1000 }], movimentacoes: [], saldosDivida: [{ dividaId: div.id, saldo: 290 }] })
  assert.deepEqual(listar<{ saldoDevedor: number }>('saldosDivida').map((s) => s.saldoDevedor), [290])
})

test('PAT-006/007: registrar no Finanças só uma vez; excluir a movimentação exclui o lançamento criado por ela', () => {
  limpar()
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo', dataInicio: '2026-01-01' } }) as { id: string }
  const m = api.criar({ t: 'movimentacoes', item: { investimentoId: inv.id, tipo: 'aplicacao', data: '2026-03-05', valor: 500, origemRecurso: 'externo' } }) as { id: string }
  const antes = fin.lancamentos().length
  api.financasLancamento({ movimentacaoId: m.id })
  assert.throws(() => api.financasLancamento({ movimentacaoId: m.id }), /já foi registrada/)
  assert.equal(fin.lancamentos().length, antes + 1)
  api.remover({ t: 'movimentacoes', id: m.id })
  assert.equal(fin.lancamentos().length, antes, 'o aporte criado pela movimentação saiu junto')
})

test('PAT-013: o histórico de alterações não pode ser editado nem apagado', () => {
  limpar()
  assert.throws(() => api.criar({ t: 'alteracoes', item: { entidade: 'x', entidadeId: 'y', descricao: 'forjada' } }), /não pode ser editado/)
  const inv = api.criar({ t: 'investimentos', item: { nome: 'CDB', categoria: 'RendaFixa', situacao: 'ativo' } }) as { id: string }
  api.remover({ t: 'investimentos', id: inv.id })
  const [alt] = listar<{ id: string }>('alteracoes')
  assert.throws(() => api.remover({ t: 'alteracoes', id: alt.id }), /não pode ser editado/)
  assert.throws(() => api.atualizar({ t: 'alteracoes', id: alt.id, item: { descricao: 'x' } }), /não pode ser editado/)
})

test('PAT-014: posição, saldo ou movimentação apontando para registro inexistente é recusada', () => {
  limpar()
  assert.throws(() => api.criar({ t: 'posicoes', item: { investimentoId: 'inv-que-nao-existe', ano: 2026, mes: 1, saldo: 10, situacao: 'confirmada' } }), /não existe/)
  assert.throws(() => api.criar({ t: 'saldosConta', item: { contaId: 'cta-x', ano: 2026, mes: 1, saldo: 10 } }), /não existe/)
  const r = api.importar({ origemArquivo: 't.csv', itens: { movimentacoes: [{ investimentoId: 'inv-x', tipo: 'aplicacao', data: '2026-01-05', valor: 10 }] } })
  assert.equal(r.movimentacoes.rejeitados.length, 1)
})

test('PAT-011: aporte importado do Finanças aparece como desatualizado quando os lançamentos de lá mudam', () => {
  limpar()
  const base = { data: '2026-04-10', descricao: 'Aporte', tipo: 'investimento' as const, valor: 1000, grupo: null, categoria: 'Investimentos', subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null }
  const l = fin.criarLancamento(base)
  api.financasImportarFluxo({ ano: 2026, mes: 4 })
  const mes = () => api.financasFluxos().meses.find((m) => m.ano === 2026 && m.mes === 4)
  assert.equal(mes()?.desatualizado, false)
  fin.atualizarLanc({ id: l.id, input: { ...base, valor: 1200 } })
  assert.equal(mes()?.desatualizado, true, 'valor editado no Finanças')
  api.financasImportarFluxo({ ano: 2026, mes: 4 })
  assert.equal(mes()?.desatualizado, false)
  fin.excluirLancamento({ id: l.id })
  assert.equal(mes()?.desatualizado, true, 'lançamento excluído no Finanças: o mês continua na lista')
})
