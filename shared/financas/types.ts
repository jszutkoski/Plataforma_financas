/** Tipos compartilhados entre servidor e cliente. */

export type TipoLancamento = 'receita' | 'despesa' | 'investimento' | 'resgate' | 'deducao'

export const TIPOS: TipoLancamento[] = ['receita', 'despesa', 'investimento', 'resgate', 'deducao']

export const TIPO_LABEL: Record<TipoLancamento, string> = {
  receita: 'Receita',
  despesa: 'Despesa',
  investimento: 'Investimento',
  resgate: 'Resgate',
  deducao: 'Dedução',
}

/** Natureza da despesa, usada nos painéis (fixas × variáveis) e nos relatórios. */
export type Grupo =
  | 'Fixas'
  | 'Variáveis'
  | 'Extras'
  | 'Adicionais'
  | 'Receita'
  | 'Dedução'
  | 'Investimentos'
  | 'Fora do fluxo'   // custos de projetos

export const GRUPOS_DESPESA: Grupo[] = ['Fixas', 'Variáveis', 'Extras', 'Adicionais']

export interface Lancamento {
  id: string
  /** Data ISO (AAAA-MM-DD). */
  data: string
  /** Competência (mês/ano em que o lançamento é contabilizado). */
  ano: number
  mes: number
  descricao: string
  tipo: TipoLancamento
  valor: number
  grupo: Grupo | null
  categoria: string | null
  subcategoria: string | null
  conta: string | null
  formaPagamento: string | null
  parcela: number | null
  totalParcelas: number | null
  observacoes: string | null
  /** Origem do registro: "manual", "importação" ou a célula/linha do arquivo importado. */
  origem: string | null
  origemArquivo: string | null
  /** false quando a origem não informava o dia (lançado no dia 1 do mês). */
  diaConhecido: boolean
  /** true para custos de projetos (não entram nos totais mensais). */
  foraDoFluxo: boolean
  /** Nome do projeto ao qual o custo pertence. */
  ledger: string | null
  recorrenciaId: string | null
  /** Agrupa as parcelas de uma mesma compra parcelada. */
  parcelamentoId: string | null
  criadoEm: string
  atualizadoEm: string
}

export type LancamentoInput = Omit<Lancamento, 'id' | 'criadoEm' | 'atualizadoEm' | 'ano' | 'mes' | 'parcelamentoId'> & {
  id?: string
  ano?: number
  mes?: number
  parcelamentoId?: string | null
}

export interface Categoria {
  id: number
  nome: string
  /** Tipo de lançamento ao qual a categoria se aplica. */
  tipo: TipoLancamento
  grupo: Grupo | null
  parentId: number | null
  ordem: number
}

export interface Conta {
  id: number
  nome: string
  tipo: 'conta' | 'cartao' | 'dinheiro' | 'outro'
  ativo: boolean
}

export interface Recorrencia {
  id: string
  descricao: string
  valor: number
  tipo: TipoLancamento
  grupo: Grupo | null
  categoria: string | null
  subcategoria: string | null
  conta: string | null
  formaPagamento: string | null
  dia: number
  inicio: string // AAAA-MM
  fim: string | null // AAAA-MM
  observacoes: string | null
  ativo: boolean
}

/** Projeto = conjunto de custos fora do fluxo mensal (ex.: reforma da casa). Os custos são lançamentos com foraDoFluxo=true e ledger=nome do projeto. */
export interface Projeto {
  id: number
  nome: string
  descricao: string | null
  criadoEm: string
}

/** Entrada ou saída prevista que não está nas recorrências (13º, férias, IPVA…): só afeta a projeção. Valor positivo entra, negativo sai. */
export interface AjusteProjecao {
  id: string
  ano: number
  mes: number
  descricao: string
  valor: number
}

export interface Backup {
  versao: 1
  geradoEm: string
  lancamentos: Lancamento[]
  categorias: Categoria[]
  contas: Conta[]
  recorrencias: Recorrencia[]
  projetos?: Projeto[]
  ajustesProjecao?: AjusteProjecao[]
}

export const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
export const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
