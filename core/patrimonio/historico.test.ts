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
