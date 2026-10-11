import type { Lancamento, LancamentoInput, TipoLancamento } from '@fin-shared/types'
import { parseDataBR, parseValorBR } from './format'

export interface Tabela { nome: string; colunas: string[]; linhas: Record<string, unknown>[] }

export type CampoDestino = 'data' | 'descricao' | 'valor' | 'tipo' | 'categoria' | 'subcategoria' | 'conta' | 'formaPagamento' | 'parcela' | 'totalParcelas' | 'observacoes' | 'ignorar'
export const CAMPOS: { id: CampoDestino; rotulo: string; obrigatorio?: boolean }[] = [
  { id: 'data', rotulo: 'Data', obrigatorio: true },
  { id: 'descricao', rotulo: 'Descrição', obrigatorio: true },
  { id: 'valor', rotulo: 'Valor', obrigatorio: true },
  { id: 'tipo', rotulo: 'Tipo' },
  { id: 'categoria', rotulo: 'Categoria' },
  { id: 'subcategoria', rotulo: 'Subcategoria' },
  { id: 'conta', rotulo: 'Conta / Cartão' },
  { id: 'formaPagamento', rotulo: 'Forma de pagamento' },
  { id: 'parcela', rotulo: 'Nº da parcela' },
  { id: 'totalParcelas', rotulo: 'Total de parcelas' },
  { id: 'observacoes', rotulo: 'Observações' },
  { id: 'ignorar', rotulo: '— ignorar —' },
]

/** Parser de CSV simples (detecta ; , ou tab; respeita aspas). Mantém os valores como texto. */
export function lerCSV(texto: string): unknown[][] {
  const t = texto.replace(/^\uFEFF/, '')
  const primeira = t.split(/\r?\n/, 1)[0] ?? ''
  const sep = [';', ',', '\t'].map((d) => ({ d, n: primeira.split(d).length })).sort((a, b) => b.n - a.n)[0].d
  const linhas: unknown[][] = []
  let campo = '', linha: unknown[] = [], aspas = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (aspas) {
      if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++ } else aspas = false } else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) { linha.push(campo); campo = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = '' }
    else campo += c
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha) }
  return linhas.map((l) => l.map((v) => (v === '' ? null : v)))
}

export const ehCSV = (file: File) => /\.(csv|txt|tsv)$/i.test(file.name) || file.type === 'text/csv'

/** Lê uma pasta de trabalho XLS/XLSX com fórmulas e datas (SheetJS carregado sob demanda). */
export async function lerWorkbook(file: File): Promise<import('xlsx').WorkBook> {
  const XLSX = await import('xlsx')
  return XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true, cellFormula: true })
}

/** Lê CSV/XLS/XLSX e devolve as abas como tabelas (primeira linha = cabeçalho). */
export async function lerArquivo(file: File, wbPronto?: import('xlsx').WorkBook): Promise<Tabela[]> {
  let abas: { nome: string; rows: unknown[][] }[]
  if (ehCSV(file)) {
    abas = [{ nome: file.name, rows: lerCSV(await file.text()) }]
  } else {
    const XLSX = await import('xlsx')
    const wb = wbPronto ?? await lerWorkbook(file)
    abas = wb.SheetNames.map((nome) => ({ nome, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, defval: null, blankrows: false, raw: true }) }))
  }
  return abas.map(({ nome, rows }) => {
    const idx = rows.findIndex((r) => r.filter((c) => c != null && c !== '').length >= 2)
    if (idx < 0) return { nome, colunas: [], linhas: [] }
    const head = rows[idx].map((c, i) => (c == null || c === '' ? `Coluna ${i + 1}` : String(c).trim()))
    const linhas = rows.slice(idx + 1).filter((r) => r.some((c) => c != null && c !== '')).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? null])))
    return { nome, colunas: head, linhas }
  }).filter((t) => t.colunas.length)
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Mapeamento automático de colunas pelo nome. */
export function mapearAutomatico(colunas: string[]): Record<string, CampoDestino> {
  const m: Record<string, CampoDestino> = {}
  const usados = new Set<CampoDestino>()
  const regras: [RegExp, CampoDestino][] = [
    [/^(data|date|dt|vencimento)/, 'data'], [/(descri|historico|hist[oó]rico|memo|title|lancamento|item)/, 'descricao'], [/^(valor|value|amount|quantia|total)/, 'valor'],
    [/^(tipo|type|natureza)/, 'tipo'], [/^sub ?categ/, 'subcategoria'], [/categ/, 'categoria'], [/(conta|cart[aã]o|account|card)/, 'conta'],
    [/(forma|pagamento|payment|meio)/, 'formaPagamento'], [/^(total.?parcelas|qtd.?parcelas)/, 'totalParcelas'], [/parcela/, 'parcela'], [/(obs|nota|note|coment)/, 'observacoes'],
  ]
  for (const c of colunas) {
    const n = norm(c)
    const hit = regras.find(([re, campo]) => re.test(n) && !usados.has(campo))
    m[c] = hit ? hit[1] : 'ignorar'
    if (hit) usados.add(hit[1])
  }
  return m
}

/**
 * Como ler o sinal dos valores quando o arquivo não tem coluna de tipo:
 * - extrato: positivo = entrada (receita), negativo = saída (despesa);
 * - fatura: positivo = compra (despesa), negativo = estorno/crédito (despesa negativa, que abate o gasto);
 * - planilha: o sinal é ignorado; vale o tipo padrão escolhido.
 */
export type FormatoArquivo = 'extrato' | 'fatura' | 'planilha'
export const FORMATOS: { id: FormatoArquivo; rotulo: string; dica: string }[] = [
  { id: 'fatura', rotulo: 'Fatura de cartão', dica: 'compras positivas; estornos e créditos negativos abatem o gasto' },
  { id: 'extrato', rotulo: 'Extrato bancário', dica: 'entradas positivas viram receita; saídas negativas, despesa' },
  { id: 'planilha', rotulo: 'Planilha própria', dica: 'sinal ignorado; usa a coluna de tipo ou o tipo padrão' },
]

export interface LinhaConvertida {
  indice: number
  item: LancamentoInput | null
  erros: string[]
  /** Já existe na base (mesma data — ou mesmo mês, se o dia não era conhecido —, valor e descrição). */
  duplicata: Lancamento | null
  /** Mesma data, valor e tipo, mas descrição diferente: pode ser o mesmo gasto escrito de outro jeito. */
  parecido: Lancamento | null
  bruto: Record<string, unknown>
}

function inferirTipo(v: unknown): TipoLancamento | null {
  const s = v == null ? '' : norm(String(v))
  if (/^(receita|renda|entrada|credit|income|cr)/.test(s)) return 'receita'
  if (/^(despesa|gasto|saida|sa[ií]da|debit|expense|db)/.test(s)) return 'despesa'
  if (/^(invest|aporte)/.test(s)) return 'investimento'
  if (/^(resgate|retirada|withdraw)/.test(s)) return 'resgate'
  if (/^(dedu|desconto)/.test(s)) return 'deducao'
  return null
}

/** Tipo e valor a gravar, a partir do sinal, do formato do arquivo e da coluna de tipo (se houver). */
export function tipoEValor(valorBruto: number, tipoColuna: TipoLancamento | null, formato: FormatoArquivo, tipoPadrao: TipoLancamento): { tipo: TipoLancamento; valor: number } {
  const abs = Math.abs(valorBruto)
  if (tipoColuna) return { tipo: tipoColuna, valor: formato === 'fatura' && tipoColuna === 'despesa' && valorBruto < 0 ? -abs : abs }
  if (formato === 'extrato') return { tipo: valorBruto < 0 ? 'despesa' : 'receita', valor: abs }
  if (formato === 'fatura') return { tipo: 'despesa', valor: valorBruto < 0 ? -abs : abs }
  return { tipo: tipoPadrao, valor: abs }
}

/** Converte as linhas mapeadas em lançamentos, validando e apontando duplicatas contra o histórico. */
export function converterLinhas(tabela: Tabela, mapa: Record<string, CampoDestino>, opts: { tipoPadrao: TipoLancamento; formato: FormatoArquivo; existentes: Lancamento[] }): LinhaConvertida[] {
  const col = (campo: CampoDestino) => Object.entries(mapa).find(([, v]) => v === campo)?.[0]
  const cData = col('data'), cDesc = col('descricao'), cValor = col('valor'), cTipo = col('tipo'), cCat = col('categoria'), cSub = col('subcategoria')
  const cConta = col('conta'), cForma = col('formaPagamento'), cParc = col('parcela'), cTot = col('totalParcelas'), cObs = col('observacoes')
  // índices do histórico: por data exata e, para lançamentos sem dia conhecido, por mês
  const porData = new Map<string, Lancamento[]>()
  const iguais = new Map<string, Lancamento[]>()
  const add = (m: Map<string, Lancamento[]>, k: string, l: Lancamento) => m.set(k, [...(m.get(k) ?? []), l])
  for (const l of opts.existentes) {
    if (l.foraDoFluxo) continue
    add(porData, `${l.data}|${l.valor.toFixed(2)}`, l)
    add(iguais, `${l.data}|${l.valor.toFixed(2)}|${norm(l.descricao)}`, l)
    if (!l.diaConhecido) add(iguais, `${l.data.slice(0, 7)}|${l.valor.toFixed(2)}|${norm(l.descricao)}`, l)
  }
  const str = (v: unknown) => (v == null ? null : String(v).trim() || null)
  // linhas idênticas no próprio arquivo são legítimas (duas corridas iguais no mesmo dia): a k-ésima só é
  // duplicata se o histórico já tiver pelo menos k lançamentos iguais
  const ocorrencias = new Map<string, number>()
  return tabela.linhas.map((bruto, indice) => {
    const erros: string[] = []
    const data = cData ? parseDataBR(bruto[cData]) : null
    if (!data) erros.push(cData ? `Data inválida: "${bruto[cData] ?? ''}"` : 'Coluna de data não mapeada')
    const descricao = cDesc ? str(bruto[cDesc]) : null
    if (!descricao) erros.push('Descrição vazia')
    const valorBruto = cValor ? parseValorBR(bruto[cValor] as string) : null
    if (valorBruto == null || valorBruto === 0) erros.push(cValor ? `Valor inválido: "${bruto[cValor] ?? ''}"` : 'Coluna de valor não mapeada')
    const tipoColuna = cTipo ? inferirTipo(bruto[cTipo]) : null
    const parcela = cParc ? Number(parseValorBR(bruto[cParc] as string) ?? 0) || null : null
    const totalParcelas = cTot ? Number(parseValorBR(bruto[cTot] as string) ?? 0) || null : null
    let item: LancamentoInput | null = null
    let duplicata: Lancamento | null = null
    let parecido: Lancamento | null = null
    if (!erros.length && data && descricao && valorBruto != null) {
      const { tipo, valor } = tipoEValor(valorBruto, tipoColuna, opts.formato, opts.tipoPadrao)
      item = {
        data, descricao, tipo, valor, grupo: null, categoria: cCat ? str(bruto[cCat]) : null, subcategoria: cSub ? str(bruto[cSub]) : null,
        conta: cConta ? str(bruto[cConta]) : null, formaPagamento: cForma ? str(bruto[cForma]) : null, parcela, totalParcelas,
        observacoes: cObs ? str(bruto[cObs]) : null, origem: null, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null,
      }
      const v = valor.toFixed(2), d = norm(descricao)
      const k = `${data}|${v}|${d}`
      const n = (ocorrencias.get(k) ?? 0) + 1
      ocorrencias.set(k, n)
      const mesmos = [...(iguais.get(k) ?? []), ...(iguais.get(`${data.slice(0, 7)}|${v}|${d}`) ?? [])]
      duplicata = mesmos.length >= n ? mesmos[n - 1] : null
      if (!duplicata) parecido = (porData.get(`${data}|${v}`) ?? []).find((l) => l.tipo === tipo) ?? null
    }
    return { indice, item: erros.length ? null : item, erros, duplicata, parecido, bruto }
  })
}
