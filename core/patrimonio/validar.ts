import type { NomeTabela } from './db.ts'
import { CATEGORIAS, TIPOS_MOV } from '../../shared/patrimonio/types.ts'

type Obj = Record<string, unknown>
const ISO = /^\d{4}-\d{2}-\d{2}$/

function dataOk(v: unknown): boolean {
  if (typeof v !== 'string' || !ISO.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const mesOk = (o: Obj): boolean => num(o.ano) && num(o.mes) && o.mes >= 1 && o.mes <= 12 && o.ano >= 1900 && o.ano <= 2200

/** Regras mínimas por tabela; valores desconhecidos são null (nunca zero forçado). */
export function validar(t: NomeTabela, o: Obj): string[] {
  const e: string[] = []
  const texto = (k: string) => { if (!o[k] || !String(o[k]).trim()) e.push(`${k}: obrigatório.`) }
  const dataOpc = (k: string) => { if (o[k] != null && !dataOk(o[k])) e.push(`${k}: data inválida (AAAA-MM-DD).`) }
  const numOpc = (k: string, min?: number) => { if (o[k] != null && (!num(o[k]) || (min != null && (o[k] as number) < min))) e.push(`${k}: número inválido.`) }
  switch (t) {
    case 'investimentos':
      texto('nome'); if (!CATEGORIAS.includes(o.categoria as never)) e.push('categoria inválida.')
      if (!['ativo', 'encerrado', 'revisar'].includes(o.situacao as string)) e.push('situacao inválida.')
      dataOpc('dataInicio'); dataOpc('dataEncerramento'); dataOpc('vencimento'); break
    case 'posicoes':
      texto('investimentoId'); if (!mesOk(o)) e.push('ano/mês inválidos.'); numOpc('saldo'); numOpc('quantidade'); numOpc('custo'); dataOpc('dataPosicao')
      if (!['informada', 'confirmada', 'estimada', 'pendente'].includes(o.situacao as string)) e.push('situacao inválida.')
      if (o.saldo == null && o.situacao !== 'pendente' && o.quantidade == null) e.push('saldo: informe o valor ou marque a posição como pendente.'); break
    case 'posicoesConsolidadas':
      if (!mesOk(o)) e.push('ano/mês inválidos.'); if (!num(o.saldo)) e.push('saldo obrigatório.'); if (!['carteira', 'categoria'].includes(o.escopo as string)) e.push('escopo inválido.'); break
    case 'movimentacoes':
      if (!TIPOS_MOV.includes(o.tipo as never)) e.push('tipo inválido.'); dataOpc('data'); numOpc('valor'); numOpc('quantidade'); numOpc('preco'); numOpc('taxas'); numOpc('irrf')
      if (o.valor == null && o.quantidade == null) e.push('valor: informe valor ou quantidade.')
      if (num(o.valor) && (o.valor as number) < 0) e.push('valor: use valores positivos; o tipo define entrada ou saída.')
      if (!['externo', 'interno', 'nao_informado'].includes(o.origemRecurso as string)) e.push('origemRecurso inválida.')
      if (o.ano != null && !mesOk(o)) e.push('ano/mês inválidos.'); break
    case 'fluxosConsolidados': if (!mesOk(o)) e.push('ano/mês inválidos.'); numOpc('aportesLiquidos'); numOpc('proventos'); break
    case 'contas': texto('nome'); dataOpc('dataEncerramento'); break
    case 'saldosConta': texto('contaId'); if (!mesOk(o)) e.push('ano/mês inválidos.'); if (!num(o.saldo)) e.push('saldo obrigatório.'); dataOpc('data'); break
    case 'bens':
      texto('nome'); if (!['imovel', 'veiculo', 'outro'].includes(o.categoria as string)) e.push('categoria inválida.')
      if (!num(o.percentualPropriedade) || o.percentualPropriedade <= 0 || o.percentualPropriedade > 1) e.push('percentualPropriedade: entre 0 e 100%.')
      dataOpc('dataAquisicao'); dataOpc('dataVenda'); numOpc('valorAquisicao', 0); numOpc('valorVenda', 0); numOpc('area', 0); break
    case 'avaliacoesBem': texto('bemId'); if (!dataOk(o.data)) e.push('data inválida.'); if (!num(o.valor) || o.valor < 0) e.push('valor obrigatório.'); texto('fonte'); break
    case 'dividas': texto('nome'); dataOpc('dataInicio'); dataOpc('vencimento'); dataOpc('dataQuitacao'); if (o.dataInicio && o.vencimento && (o.dataInicio as string) > (o.vencimento as string)) e.push('vencimento anterior à data de início.'); break
    case 'saldosDivida': texto('dividaId'); if (!dataOk(o.data)) e.push('data inválida.'); if (!num(o.saldoDevedor) || o.saldoDevedor < 0) e.push('saldoDevedor obrigatório.'); break
    case 'fechamentos': if (!mesOk(o)) e.push('ano/mês inválidos.'); break
    case 'pendencias': texto('descricao'); break
    case 'alteracoes': break
  }
  return e
}
