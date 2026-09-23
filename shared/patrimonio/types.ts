/** Modelo de dados da plataforma Patrimônio (compartilhado entre servidor e interface). Ver docs/ESTRUTURA_DADOS.md. */

// ---------------------------------------------------------------- investimentos
export type CategoriaInvestimento = 'RendaFixa' | 'TesouroDireto' | 'Acoes' | 'FII' | 'Fundos' | 'Cripto' | 'Reserva' | 'Previdencia' | 'Outros'
export const CATEGORIAS: CategoriaInvestimento[] = ['Reserva', 'RendaFixa', 'TesouroDireto', 'Acoes', 'FII', 'Fundos', 'Cripto', 'Previdencia', 'Outros']
export const CATEGORIA_LABEL: Record<CategoriaInvestimento | 'Caixa', string> = {
  Reserva: 'Reserva de emergência', RendaFixa: 'Renda fixa', TesouroDireto: 'Tesouro Direto', Acoes: 'Ações', FII: 'Fundos imobiliários',
  Fundos: 'Fundos de investimento', Cripto: 'Criptoativos', Previdencia: 'Previdência', Outros: 'Outros', Caixa: 'Dinheiro na corretora',
}
/** Categorias cujos ativos têm quantidade (cotas/unidades) reconstruível a partir de compras e vendas. */
export const CATEGORIAS_COM_QUANTIDADE: CategoriaInvestimento[] = ['Acoes', 'FII', 'TesouroDireto', 'Cripto']

export type SituacaoInvestimento = 'ativo' | 'encerrado' | 'revisar'
export const SITUACAO_INV_LABEL: Record<SituacaoInvestimento, string> = { ativo: 'Ativo', encerrado: 'Encerrado', revisar: 'Revisar' }

export interface Investimento {
  id: string
  nome: string
  codigo: string | null
  categoria: CategoriaInvestimento
  subtipo: string | null
  instituicao: string | null
  dataInicio: string | null
  dataEncerramento: string | null
  vencimento: string | null
  indexador: string | null
  condicoes: string | null
  observacoes: string | null
  situacao: SituacaoInvestimento
  /** Grafias diferentes encontradas nas importações para o mesmo ativo. */
  nomesOriginais: string[]
  origem: string | null
  origemArquivo: string | null
  criadoEm: string
  atualizadoEm: string
}
export type InvestimentoInput = Omit<Investimento, 'id' | 'criadoEm' | 'atualizadoEm' | 'nomesOriginais'> & { id?: string; nomesOriginais?: string[] }

// ---------------------------------------------------------------- posições mensais (por ativo)
/** informada = digitada/importada; confirmada = fechamento confirmado; estimada = derivada/sem data exata; pendente = falta o valor. */
export type SituacaoPosicao = 'informada' | 'confirmada' | 'estimada' | 'pendente'
export const SITUACAO_POS_LABEL: Record<SituacaoPosicao, string> = { informada: 'Informada', confirmada: 'Confirmada', estimada: 'Estimada', pendente: 'Pendente' }

export interface Posicao {
  id: string
  investimentoId: string
  ano: number
  mes: number
  /** Data em que o saldo foi observado (nem sempre o último dia do mês). */
  dataPosicao: string | null
  /** Saldo de mercado no fechamento; null = não informado (nunca zero por falta de dado). */
  saldo: number | null
  quantidade: number | null
  custo: number | null
  situacao: SituacaoPosicao
  origem: string | null
  origemArquivo: string | null
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type PosicaoInput = Omit<Posicao, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }

// ---------------------------------------------------------------- posições consolidadas (carteira / categoria)
export interface PosicaoConsolidada {
  id: string
  ano: number
  mes: number
  escopo: 'carteira' | 'categoria'
  categoria: CategoriaInvestimento | 'Caixa' | null
  saldo: number
  dataPosicao: string | null
  situacao: SituacaoPosicao
  origem: string | null
  origemArquivo: string | null
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type PosicaoConsolidadaInput = Omit<PosicaoConsolidada, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }

// ---------------------------------------------------------------- movimentações
export type TipoMovimentacao = 'compra' | 'venda' | 'aplicacao' | 'resgate' | 'provento' | 'amortizacao' | 'bonificacao' | 'evento' | 'taxa' | 'imposto' | 'transferencia' | 'ajuste'
export const TIPOS_MOV: TipoMovimentacao[] = ['aplicacao', 'resgate', 'compra', 'venda', 'provento', 'amortizacao', 'bonificacao', 'evento', 'taxa', 'imposto', 'transferencia', 'ajuste']
export const TIPO_MOV_LABEL: Record<TipoMovimentacao, string> = {
  compra: 'Compra', venda: 'Venda', aplicacao: 'Aplicação', resgate: 'Resgate', provento: 'Provento (dividendo/juros/JCP)', amortizacao: 'Amortização',
  bonificacao: 'Bonificação', evento: 'Evento societário', taxa: 'Taxa', imposto: 'Imposto', transferencia: 'Transferência entre investimentos', ajuste: 'Ajuste',
}
/** Entradas na posição (dinheiro entra no investimento). */
export const TIPOS_ENTRADA: TipoMovimentacao[] = ['compra', 'aplicacao']
/** Saídas da posição (dinheiro sai do investimento). */
export const TIPOS_SAIDA: TipoMovimentacao[] = ['venda', 'resgate', 'amortizacao']
/** Rendimento recebido (não altera a quantidade). */
export const TIPOS_PROVENTO: TipoMovimentacao[] = ['provento']

/** externo = dinheiro novo (vem/vai para uma conta fora da carteira); interno = financiado por outro investimento/reinvestimento. */
export type OrigemRecurso = 'externo' | 'interno' | 'nao_informado'
export const ORIGEM_RECURSO_LABEL: Record<OrigemRecurso, string> = { externo: 'Dinheiro novo (externo)', interno: 'Interno / reinvestimento', nao_informado: 'Não informado' }

export type SituacaoMov = 'confirmada' | 'pendente' | 'revisar'

export interface Movimentacao {
  id: string
  investimentoId: string | null
  tipo: TipoMovimentacao
  data: string | null
  /** Competência; null quando a data é desconhecida (registro pendente). */
  ano: number | null
  mes: number | null
  valor: number | null
  quantidade: number | null
  preco: number | null
  taxas: number | null
  irrf: number | null
  origemRecurso: OrigemRecurso
  contaId: string | null
  /** Proventos pagos em conta (fora da posição) — entram no resultado; se false, já estão no saldo. */
  foraDaPosicao: boolean
  observacoes: string | null
  origem: string | null
  origemArquivo: string | null
  situacao: SituacaoMov
  /** id do lançamento correspondente no app Finanças, quando sincronizado. */
  financasId: string | null
  criadoEm: string
  atualizadoEm: string
}
export type MovimentacaoInput = Omit<Movimentacao, 'id' | 'criadoEm' | 'atualizadoEm' | 'ano' | 'mes' | 'financasId'> & { id?: string; ano?: number | null; mes?: number | null; financasId?: string | null }

// ---------------------------------------------------------------- fluxos consolidados (por mês, sem atribuição a ativo)
export interface FluxoConsolidado {
  id: string
  ano: number
  mes: number
  /** Dinheiro novo líquido que entrou (+) ou saiu (−) da carteira no mês. null = não informado. */
  aportesLiquidos: number | null
  proventos: number | null
  proventosSituacao: 'informado' | 'estimado' | null
  /** Resultado do mês informado na origem dos dados (importação), quando houver. */
  resultadoInformado: number | null
  resultadoExcluiProventos: boolean
  retornoInformado: number | null
  ibov: number | null
  /** Ajuste manual do mês, quando o resultado precisa de uma correção explicada em ajusteMotivo. */
  ajuste: number | null
  ajusteMotivo: string | null
  origem: string | null
  origemArquivo: string | null
  /** ids de lançamentos do Finanças usados (evita reimportação). */
  financasIds: string[]
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type FluxoConsolidadoInput = Omit<FluxoConsolidado, 'id' | 'criadoEm' | 'atualizadoEm' | 'financasIds'> & { id?: string; financasIds?: string[] }

// ---------------------------------------------------------------- contas (dinheiro disponível)
export interface Conta {
  id: string
  nome: string
  instituicao: string | null
  tipo: 'corrente' | 'poupanca' | 'corretora' | 'dinheiro' | 'outro'
  /** Nome da conta correspondente no app Finanças (mesmo identificador lógico). */
  financasNome: string | null
  ativo: boolean
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type ContaInput = Omit<Conta, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }

export interface SaldoConta {
  id: string
  contaId: string
  ano: number
  mes: number
  data: string | null
  saldo: number
  situacao: SituacaoPosicao
  origem: string | null
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type SaldoContaInput = Omit<SaldoConta, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }

// ---------------------------------------------------------------- bens
export type CategoriaBem = 'imovel' | 'veiculo' | 'outro'
export const CATEGORIA_BEM_LABEL: Record<CategoriaBem, string> = { imovel: 'Imóvel', veiculo: 'Veículo', outro: 'Outro bem' }

export interface Bem {
  id: string
  nome: string
  categoria: CategoriaBem
  dataAquisicao: string | null
  valorAquisicao: number | null
  /** 0–1 (1 = 100%). Só a participação entra no patrimônio. */
  percentualPropriedade: number
  localizacao: string | null
  area: number | null
  marca: string | null
  modelo: string | null
  anoFabricacao: number | null
  dividaId: string | null
  situacao: 'ativo' | 'vendido'
  dataVenda: string | null
  valorVenda: number | null
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type BemInput = Omit<Bem, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }

export interface AvaliacaoBem {
  id: string
  bemId: string
  data: string
  /** Valor do bem inteiro (100%). */
  valor: number
  fonte: string
  observacoes: string | null
  criadoEm: string
}
export type AvaliacaoBemInput = Omit<AvaliacaoBem, 'id' | 'criadoEm'> & { id?: string }

// ---------------------------------------------------------------- dívidas
export interface Divida {
  id: string
  nome: string
  instituicao: string | null
  tipo: string | null
  /** Data em que a dívida foi contraída (contrato/liberação). */
  dataInicio: string | null
  vencimento: string | null
  bemId: string | null
  situacao: 'ativa' | 'quitada'
  observacoes: string | null
  criadoEm: string
  atualizadoEm: string
}
export type DividaInput = Omit<Divida, 'id' | 'criadoEm' | 'atualizadoEm'> & { id?: string }

export interface SaldoDivida {
  id: string
  dividaId: string
  data: string
  ano: number
  mes: number
  /** Saldo devedor de minha responsabilidade (não a soma das parcelas futuras). */
  saldoDevedor: number
  origem: string | null
  observacoes: string | null
  criadoEm: string
}
export type SaldoDividaInput = Omit<SaldoDivida, 'id' | 'criadoEm' | 'ano' | 'mes'> & { id?: string; ano?: number; mes?: number }

// ---------------------------------------------------------------- fechamento mensal / auditoria / pendências
export interface Fechamento {
  id: string
  ano: number
  mes: number
  status: 'rascunho' | 'confirmado'
  /** true quando o usuário declara que não houve movimentações além das registradas. */
  movimentacoesConfirmadas: boolean
  observacoes: string | null
  confirmadoEm: string | null
  criadoEm: string
  atualizadoEm: string
}

export interface Alteracao {
  id: string
  data: string
  entidade: string
  entidadeId: string
  descricao: string
  antes: unknown
  depois: unknown
  motivo: string | null
  periodosAfetados: string[]
}

export interface Pendencia {
  id: string
  tipo: 'investimento' | 'movimentacao' | 'posicao' | 'linha'
  descricao: string
  motivo: string
  dados: Record<string, unknown>
  origem: string | null
  origemArquivo: string | null
  resolvido: boolean
}

export interface Backup {
  versao: 2
  app: 'patrimonio'
  geradoEm: string
  investimentos: Investimento[]
  posicoes: Posicao[]
  posicoesConsolidadas: PosicaoConsolidada[]
  movimentacoes: Movimentacao[]
  fluxosConsolidados: FluxoConsolidado[]
  contas: Conta[]
  saldosConta: SaldoConta[]
  bens: Bem[]
  avaliacoesBem: AvaliacaoBem[]
  dividas: Divida[]
  saldosDivida: SaldoDivida[]
  fechamentos: Fechamento[]
  alteracoes: Alteracao[]
  pendencias: Pendencia[]
}

export interface Info {
  banco: string
  criadoEm: string | null
  contagens: Record<string, number>
  financas: { disponivel: boolean; caminho: string | null; api: string }
}

export const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
export const MESES_CURTO = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export const chaveMes = (ano: number, mes: number): string => `${ano}-${String(mes).padStart(2, '0')}`
export const mesAnterior = (ano: number, mes: number): [number, number] => (mes === 1 ? [ano - 1, 12] : [ano, mes - 1])
export const mesSeguinte = (ano: number, mes: number): [number, number] => (mes === 12 ? [ano + 1, 1] : [ano, mes + 1])
