import type { Backup, Info, Movimentacao, Posicao, FluxoConsolidado, Fechamento } from '@pat-shared/types'
import type { Base } from '@pat-shared/calc'
import { chamar } from '@app/lib/ponte'

export type Tabela = keyof Base | 'alteracoes' | 'pendencias'

export interface FechamentoCorpo {
  ano: number; mes: number; status: 'rascunho' | 'confirmado'; movimentacoesConfirmadas: boolean; observacoes: string | null
  posicoes: Partial<Posicao>[]; movimentacoes: Partial<Movimentacao>[]; excluirMovimentacoes?: string[]; investimentosNovos?: Record<string, unknown>[]
  encerrar?: { investimentoId: string; data: string }[]; fluxo?: Partial<FluxoConsolidado> | null; motivo?: string | null
}
export interface FluxoFinancas { ano: number; mes: number; investimentos: number; resgates: number; liquido: number; ids: string[]; novos: number; itens: { id: string; data: string; tipo: string; valor: number; descricao: string; subcategoria: string | null; conta: string | null }[] }
export interface ResultadoImportacao { [tabela: string]: { criados: number; ignorados: number; rejeitados: { indice: number; erros: string[] }[] } }

export const api = {
  base: () => chamar<Base & { alteracoes: unknown[]; pendencias: unknown[] }>('pat:base'),
  info: () => chamar<Info>('pat:info'),
  listar: <T>(t: Tabela) => chamar<T[]>('pat:listarTabela', { t }),
  criar: <T>(t: Tabela, item: Record<string, unknown>) => chamar<T>('pat:criar', { t, item }),
  atualizar: <T>(t: Tabela, id: string, item: Record<string, unknown> & { motivo?: string }) => chamar<T>('pat:atualizar', { t, id, item }),
  excluir: (t: Tabela, id: string, motivo?: string) => chamar<{ ok: true }>('pat:remover', { t, id, motivo }),
  fechamento: (c: FechamentoCorpo) => chamar<{ fechamento: Fechamento; posicoes: number; movimentacoes: number; erros: string[] }>('pat:fechamento', c),
  importar: (origemArquivo: string, itens: Record<string, unknown[]>) => chamar<ResultadoImportacao>('pat:importar', { origemArquivo, itens }),
  backup: () => chamar<Backup>('pat:backup'),
  backupArquivo: () => chamar<{ ok: true; arquivo: string }>('pat:backupArquivo'),
  restaurar: (b: Backup, modo: 'substituir' | 'mesclar') => chamar<{ ok: true; inseridos: Record<string, number> }>('pat:restaurar', { b, modo }),
  limpar: () => chamar<{ ok: true }>('pat:limpar', { confirmar: 'APAGAR TUDO' }),
  financasFluxos: () => chamar<{ disponivel: boolean; caminho?: string; meses: FluxoFinancas[] }>('pat:financasFluxos'),
  financasImportarFluxo: (ano: number, mes: number, substituir = false) => chamar<FluxoConsolidado>('pat:financasImportarFluxo', { ano, mes, substituir }),
  financasContas: () => chamar<{ id: number; nome: string; tipo: string; ativo: number }[]>('pat:financasContas'),
  financasLancamento: (movimentacaoId: string) => chamar<{ ok: true; financasId: string; jaExistia?: boolean }>('pat:financasLancamento', { movimentacaoId }),
}
