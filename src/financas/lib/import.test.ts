/** Regressão da importação (auditoria FIN-002, FIN-003, FIN-007, FIN-008). Dados sintéticos. */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { converterLinhas, lerCSV, type FormatoArquivo, type Tabela } from './import.ts'
import { parseDataBR } from './format.ts'
import { resumoMes, gastosPorCategoria } from './analytics.ts'
import type { Lancamento } from '@fin-shared/types'

let seq = 0
const L = (o: Partial<Lancamento>): Lancamento => ({ id: `l${++seq}`, data: '2026-03-06', ano: 2026, mes: 3, descricao: 'x', tipo: 'despesa', valor: 10, grupo: 'Variáveis', categoria: null, subcategoria: null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null, observacoes: null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, parcelamentoId: null, criadoEm: '', atualizadoEm: '', ...o })
const csv = (texto: string): Tabela => { const [cab, ...ls] = lerCSV(texto); return { nome: 't', colunas: cab as string[], linhas: ls.map((l) => Object.fromEntries((cab as string[]).map((c, i) => [c, l[i]]))) } }
const MAPA = { Data: 'data', Descricao: 'descricao', Valor: 'valor' } as const
const converter = (t: Tabela, formato: FormatoArquivo, existentes: Lancamento[] = []) => converterLinhas(t, { ...MAPA }, { tipoPadrao: 'despesa', formato, existentes })
const resumo = (r: ReturnType<typeof converter>) => r.map((c) => (c.item ? `${c.item.descricao}:${c.item.tipo}:${c.item.valor}` : `ERRO:${c.erros}`))

test('FIN-002: extrato — entradas viram receita, saídas despesa', () => {
  const t = csv('Data;Descricao;Valor\n05/03/2026;SALARIO;5000,00\n06/03/2026;MERCADO;-200,00')
  assert.deepEqual(resumo(converter(t, 'extrato')), ['SALARIO:receita:5000', 'MERCADO:despesa:200'])
})

test('FIN-002/003: fatura — estorno vira despesa negativa e abate o gasto do mês', () => {
  const t = csv('Data;Descricao;Valor\n02/03/2026;Loja X;49,90\n09/03/2026;Estorno Loja X;-49,90')
  const r = converter(t, 'fatura')
  assert.deepEqual(resumo(r), ['Loja X:despesa:49.9', 'Estorno Loja X:despesa:-49.9'])
  const lancs = r.map((c) => L({ ...c.item!, categoria: 'Compras', ano: 2026, mes: 3 }))
  const m = resumoMes(lancs, 2026, 3)
  assert.equal(m.gastos, 0)
  assert.equal(m.renda, 0, 'estorno não vira renda')
  assert.deepEqual(gastosPorCategoria(lancs, 2026, 3).map((i) => [i.nome, i.valor, i.n]), [['Compras', 0, 2]])
})

test('planilha — sinal ignorado, vale o tipo padrão (comportamento anterior)', () => {
  assert.deepEqual(resumo(converter(csv('Data;Descricao;Valor\n02/03/2026;Aluguel;-1000'), 'planilha')), ['Aluguel:despesa:1000'])
})

test('FIN-007: linhas iguais legítimas no mesmo arquivo são importadas; reimportar o arquivo não duplica', () => {
  const t = csv('Data;Descricao;Valor\n06/03/2026;UBER;-15,90\n06/03/2026;UBER;-15,90')
  const r = converter(t, 'extrato')
  assert.equal(r.filter((c) => c.item && !c.duplicata).length, 2, 'duas corridas iguais no dia')
  // depois de importado, o mesmo arquivo de novo: as duas são reconhecidas como já existentes
  const existentes = r.map((c) => L({ ...c.item! }))
  assert.equal(converter(t, 'extrato', existentes).filter((c) => c.duplicata).length, 2)
  // só uma já existia: a segunda entra
  assert.equal(converter(t, 'extrato', existentes.slice(0, 1)).filter((c) => !c.duplicata).length, 1)
})

test('FIN-007: mesma data e valor com descrição diferente é só "parecido", não é descartado', () => {
  const r = converter(csv('Data;Descricao;Valor\n06/03/2026;UBER;-15,90'), 'extrato', [L({ descricao: 'Padaria', valor: 15.9 })])
  assert.equal(r[0].duplicata, null)
  assert.equal(r[0].parecido?.descricao, 'Padaria')
})

test('FIN-007: lançamento antigo sem dia conhecido é reconhecido pelo mês', () => {
  const antigo = L({ data: '2024-01-01', ano: 2024, mes: 1, descricao: 'Netflix', valor: 55.9, diaConhecido: false })
  const r = converter(csv('Data;Descricao;Valor\n17/01/2024;Netflix;55,90'), 'fatura', [antigo])
  assert.equal(r[0].duplicata?.id, antigo.id)
})

test('FIN-008: datas brasileiras com hora não trocam dia e mês', () => {
  assert.equal(parseDataBR('03/04/2024 10:15'), '2024-04-03')
  assert.equal(parseDataBR('03/04/2024 10:15:59'), '2024-04-03')
  assert.equal(parseDataBR('03/04/2024'), '2024-04-03')
  assert.equal(parseDataBR('29/02/2024'), '2024-02-29')
  assert.equal(parseDataBR('31/04/2024'), null)
  assert.equal(parseDataBR('2024-04-03'), '2024-04-03')
  assert.equal(parseDataBR(45385), '2024-04-03', 'serial do Excel')
})
