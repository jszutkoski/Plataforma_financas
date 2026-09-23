import { parseDataBR, parseValorBR } from './format'
import type { Investimento, Movimentacao, Posicao, TipoMovimentacao } from '@pat-shared/types'

export interface Tabela { nome: string; colunas: string[]; linhas: Record<string, unknown>[] }
export type Destino = 'posicoes' | 'movimentacoes'
export type Campo = 'ativo' | 'codigo' | 'data' | 'ano' | 'mes' | 'saldo' | 'quantidade' | 'custo' | 'tipo' | 'valor' | 'preco' | 'taxas' | 'irrf' | 'observacoes' | 'ignorar'
export const CAMPOS: Record<Destino, { id: Campo; rotulo: string; obrigatorio?: boolean }[]> = {
  posicoes: [
    { id: 'ativo', rotulo: 'Ativo (nome ou código)', obrigatorio: true }, { id: 'data', rotulo: 'Data da posição' }, { id: 'ano', rotulo: 'Ano' }, { id: 'mes', rotulo: 'Mês' },
    { id: 'saldo', rotulo: 'Saldo (R$)' }, { id: 'quantidade', rotulo: 'Quantidade' }, { id: 'custo', rotulo: 'Custo de aquisição' }, { id: 'observacoes', rotulo: 'Observações' }, { id: 'ignorar', rotulo: '— ignorar —' },
  ],
  movimentacoes: [
    { id: 'data', rotulo: 'Data', obrigatorio: true }, { id: 'ativo', rotulo: 'Ativo (nome ou código)', obrigatorio: true }, { id: 'tipo', rotulo: 'Tipo (compra/venda/aplicação/resgate/provento)', obrigatorio: true },
    { id: 'valor', rotulo: 'Valor (R$)' }, { id: 'quantidade', rotulo: 'Quantidade' }, { id: 'preco', rotulo: 'Preço unitário' }, { id: 'taxas', rotulo: 'Taxas' }, { id: 'irrf', rotulo: 'IRRF' }, { id: 'observacoes', rotulo: 'Observações' }, { id: 'ignorar', rotulo: '— ignorar —' },
  ],
}

/** Parser de CSV simples (detecta ; , ou tab; respeita aspas). Mantém os valores como texto. */
export function lerCSV(texto: string): unknown[][] {
  const t = texto.replace(/^﻿/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', ',', '\t'].map((d) => ({ d, n: primeira.split(d).length })).sort((a, b) => b.n - a.n)[0].d
  const linhas: unknown[][] = []
  let campo = '', linha: unknown[] = [], aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) { if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += c }
    else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else campo += c
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas.map((l) => l.map((v) => (v === '' ? null : v)))
}
export const ehCSV = (file: File) => /\.(csv|txt|tsv)$/i.test(file.name) || file.type === 'text/csv'

/** Lê CSV/XLS/XLSX e devolve as abas como tabelas (primeira linha com ≥2 células = cabeçalho). */
export async function lerArquivo(file: File): Promise<{ tabelas: Tabela[]; abas: string[] }> {
  let abas: { nome: string; rows: unknown[][] }[]
  if (ehCSV(file)) abas = [{ nome: file.name, rows: lerCSV(await file.text()) }]
  else {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
    abas = wb.SheetNames.map((nome) => ({ nome, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, defval: null, blankrows: false, raw: true }) }))
  }
  const tabelas = abas.map(({ nome, rows }) => {
    const idx = rows.findIndex((r) => r.filter((c) => c != null && c !== '').length >= 2)
    if (idx < 0) return { nome, colunas: [], linhas: [] }
    const head = rows[idx].map((c, i) => (c == null || c === '' ? `Coluna ${i + 1}` : String(c).trim()))
    const linhas = rows.slice(idx + 1).filter((r) => r.some((c) => c != null && c !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? null])))
    return { nome, colunas: head, linhas }
  }).filter((t) => t.colunas.length)
  return { tabelas, abas: abas.map((a) => a.nome) }
}


const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function mapearAutomatico(colunas: string[], destino: Destino): Record<string, Campo> {
  const m: Record<string, Campo> = {}
  const usados = new Set<Campo>()
  const regras: [RegExp, Campo][] = destino === 'posicoes'
    ? [[/^(data|date|posicao em)/, 'data'], [/^ano/, 'ano'], [/^m[eê]s/, 'mes'], [/(ativo|investimento|papel|ticker|fundo|nome|descri)/, 'ativo'], [/(saldo|valor atual|valor de mercado|^valor$|montante)/, 'saldo'], [/(qtd|quant|cotas)/, 'quantidade'], [/(custo|aplicado|investido)/, 'custo'], [/(obs|nota)/, 'observacoes']]
    : [[/^(data|date|dt)/, 'data'], [/(ativo|investimento|papel|ticker|fundo|descri|nome|empresa)/, 'ativo'], [/^(tipo|c\/v|operac|natureza)/, 'tipo'], [/(^valor|^total|montante)/, 'valor'], [/(qtd|quant)/, 'quantidade'], [/(preco|pre[çc]o|cota[çc][aã]o|unit)/, 'preco'], [/(taxa|corretagem|emolument|cblc)/, 'taxas'], [/irrf|imposto/, 'irrf'], [/(obs|nota)/, 'observacoes']]
  for (const c of colunas) {
    const n = norm(c)
    const r = regras.find(([re, campo]) => re.test(n) && !usados.has(campo))
    m[c] = r ? r[1] : 'ignorar'
    if (r) usados.add(r[1])
  }
  return m
}

const TIPOS_SINONIMOS: [RegExp, TipoMovimentacao][] = [
  [/^(c|compra|buy|aplic)/, 'compra'], [/^(v|venda|sell|resg)/, 'venda'], [/^(div|jcp|jsc|juros|rend|provent|dividend)/, 'provento'], [/amortiz/, 'amortizacao'], [/bonific/, 'bonificacao'], [/(taxa|fee)/, 'taxa'], [/(imposto|ir)/, 'imposto'], [/transf/, 'transferencia'],
]
function tipoDe(v: unknown, inv: Investimento | null): TipoMovimentacao | null {
  const s = norm(String(v ?? '').trim())
  if (!s) return null
  const semQtd = inv && !['Acoes', 'FII', 'TesouroDireto', 'Cripto'].includes(inv.categoria)
  for (const [re, t] of TIPOS_SINONIMOS) if (re.test(s)) return semQtd && t === 'compra' ? 'aplicacao' : semQtd && t === 'venda' ? 'resgate' : t
  if (/^aplica/.test(s)) return 'aplicacao'
  if (/^resg/.test(s)) return 'resgate'
  return null
}

export interface LinhaPreparada { indice: number; item: Partial<Posicao> | Partial<Movimentacao>; investimento: Investimento | null; nomeAtivo: string; erros: string[]; duplicada: { existente: Posicao | Movimentacao; motivo: string } | null; conflito: string | null }

export function encontrarInvestimento(nome: string, investimentos: Investimento[]): Investimento | null {
  const n = norm(nome.trim())
  if (!n) return null
  return investimentos.find((i) => norm(i.nome) === n || (i.codigo && norm(i.codigo) === n) || i.nomesOriginais.some((o) => norm(o) === n)) ?? investimentos.find((i) => norm(i.nome).includes(n) || (i.codigo && n.includes(norm(i.codigo)))) ?? null
}

/** Converte as linhas mapeadas em itens do modelo, validando e detectando duplicidades/conflitos com a base atual. */
export function preparar(destino: Destino, tabela: Tabela, mapa: Record<string, Campo>, investimentos: Investimento[], existentes: { posicoes: Posicao[]; movimentacoes: Movimentacao[] }, origemArquivo: string): LinhaPreparada[] {
  const col = (campo: Campo) => Object.keys(mapa).find((c) => mapa[c] === campo)
  const ler = (l: Record<string, unknown>, campo: Campo) => { const c = col(campo); return c ? l[c] : undefined }
  return tabela.linhas.map((l, i) => {
    const erros: string[] = []
    const nomeAtivo = String(ler(l, 'ativo') ?? '').trim()
    const inv = encontrarInvestimento(nomeAtivo, investimentos)
    if (!nomeAtivo) erros.push('ativo vazio')
    const origem = `${tabela.nome}!linha ${i + 2}`
    if (destino === 'posicoes') {
      const data = parseDataBR(ler(l, 'data'))
      let ano = Number(ler(l, 'ano')) || (data ? Number(data.slice(0, 4)) : null)
      let mes = Number(ler(l, 'mes')) || (data ? Number(data.slice(5, 7)) : null)
      if (!ano || !mes) { erros.push('ano/mês não identificados'); ano = null; mes = null }
      const saldo = parseValorBR(ler(l, 'saldo') as string), quantidade = parseValorBR(ler(l, 'quantidade') as string), custo = parseValorBR(ler(l, 'custo') as string)
      if (saldo == null && quantidade == null) erros.push('sem saldo nem quantidade')
      const item: Partial<Posicao> = { investimentoId: inv?.id, ano: ano ?? undefined, mes: mes ?? undefined, dataPosicao: data, saldo, quantidade, custo, situacao: saldo == null ? 'pendente' : 'informada', origem, origemArquivo, observacoes: (ler(l, 'observacoes') as string) ?? null }
      const existente = inv && ano && mes ? existentes.posicoes.find((p) => p.investimentoId === inv.id && p.ano === ano && p.mes === mes) ?? null : null
      const conflito = existente && existente.saldo != null && saldo != null && Math.abs(existente.saldo - saldo) > 0.005 ? `já existe posição de ${mes}/${ano} com saldo ${existente.saldo} (arquivo: ${saldo})` : null
      return { indice: i, item, investimento: inv, nomeAtivo, erros, duplicada: existente && !conflito ? { existente, motivo: 'posição do mesmo ativo e mês já registrada' } : null, conflito }
    }
    const data = parseDataBR(ler(l, 'data'))
    if (!data) erros.push('data inválida')
    const tipo = tipoDe(ler(l, 'tipo'), inv)
    if (!tipo) erros.push(`tipo não reconhecido (${String(ler(l, 'tipo') ?? '')})`)
    const quantidade = parseValorBR(ler(l, 'quantidade') as string), preco = parseValorBR(ler(l, 'preco') as string)
    let valor = parseValorBR(ler(l, 'valor') as string)
    if (valor == null && quantidade != null && preco != null) valor = Math.round(quantidade * preco * 100) / 100
    if (valor == null && quantidade == null) erros.push('sem valor nem quantidade')
    if (valor != null && valor < 0) valor = Math.abs(valor)
    const item: Partial<Movimentacao> = { investimentoId: inv?.id, tipo: tipo ?? undefined, data, valor, quantidade, preco, taxas: parseValorBR(ler(l, 'taxas') as string), irrf: parseValorBR(ler(l, 'irrf') as string), origemRecurso: 'nao_informado', foraDaPosicao: tipo === 'provento', situacao: 'confirmada', origem, origemArquivo, observacoes: (ler(l, 'observacoes') as string) ?? null }
    const existente = inv && data && tipo ? existentes.movimentacoes.find((m) => m.investimentoId === inv.id && m.data === data && m.tipo === tipo && m.valor != null && valor != null && Math.abs(m.valor - valor) < 0.005 && (quantidade == null || m.quantidade == null || Math.abs(m.quantidade - quantidade) < 1e-8)) ?? null : null
    return { indice: i, item, investimento: inv, nomeAtivo, erros, duplicada: existente ? { existente, motivo: 'movimentação igual (ativo, data, tipo, valor) já registrada' } : null, conflito: null }
  })
}
