import type { Lancamento, LancamentoInput, Categoria, Conta, Recorrencia, Backup, Projeto } from '@fin-shared/types'
import { chamar } from '@app/lib/ponte'

export interface Info { banco: string; lancamentos: number; criadoEm: string | null }

export const api = {
  info: () => chamar<Info>('fin:info'),
  lancamentos: () => chamar<Lancamento[]>('fin:lancamentos'),
  criarLancamento: (l: LancamentoInput) => chamar<Lancamento>('fin:criarLancamento', l),
  atualizarLancamento: (id: string, l: LancamentoInput) => chamar<Lancamento>('fin:atualizarLanc', { id, input: l }),
  excluirLancamento: (id: string) => chamar<{ ok: true }>('fin:excluirLancamento', { id }),
  duplicarLancamento: (id: string, data?: string) => chamar<Lancamento>('fin:duplicarLancamento', { id, data }),
  parcelamento: (p: { base: LancamentoInput; valorTotal: number; totalParcelas: number; dataInicio: string; parcelamentoId?: string | null }) =>
    chamar<{ parcelamentoId: string; criados: number }>('fin:parcelamento', p),
  recategorizar: (p: { ids: string[]; categoria: string; subcategoria?: string | null; grupo?: string | null }) => chamar<{ atualizados: number }>('fin:recategorizar', p),
  lote: (itens: LancamentoInput[], origemArquivo: string) => chamar<{ criados: number; rejeitados: { indice: number; erros: string[] }[] }>('fin:lote', { itens, origemArquivo }),

  categorias: () => chamar<Categoria[]>('fin:categorias'),
  criarCategoria: (c: { nome: string; tipo: string; grupo?: string | null; parentId?: number | null }) => chamar<Categoria>('fin:criarCategoria', c),
  atualizarCategoria: (id: number, c: { nome?: string; grupo?: string | null; parentId?: number | null }) => chamar<Categoria & { mesclada?: boolean }>('fin:atualizarCategoria', { id, ...c }),
  reordenarCategorias: (ids: number[]) => chamar<{ ok: true }>('fin:reordenarCategorias', { ids }),
  excluirCategoria: (id: number, forcar = false) => chamar<{ ok: true }>('fin:excluirCategoria', { id, forcar }),

  contas: () => chamar<Conta[]>('fin:contas'),
  criarConta: (c: { nome: string; tipo: string }) => chamar<Conta>('fin:criarConta', c),
  atualizarConta: (id: number, c: Partial<Conta>) => chamar<Conta>('fin:atualizarConta', { id, ...c }),
  excluirConta: (id: number) => chamar<{ ok: true }>('fin:excluirConta', { id }),

  projetos: () => chamar<Projeto[]>('fin:projetos'),
  criarProjeto: (p: { nome: string; descricao?: string | null }) => chamar<Projeto>('fin:criarProjeto', p),
  atualizarProjeto: (id: number, p: { nome?: string; descricao?: string | null }) => chamar<Projeto>('fin:atualizarProjeto', { id, ...p }),
  excluirProjeto: (id: number) => chamar<{ ok: true; custosRemovidos: number }>('fin:excluirProjeto', { id }),

  recorrencias: () => chamar<Recorrencia[]>('fin:recorrencias'),
  criarRecorrencia: (r: Omit<Recorrencia, 'id'>) => chamar<Recorrencia>('fin:criarRecorrencia', r),
  atualizarRecorrencia: (id: string, r: Recorrencia) => chamar<Recorrencia>('fin:atualizarRecorrencia', { id, r }),
  excluirRecorrencia: (id: string) => chamar<{ ok: true }>('fin:excluirRecorrencia', { id }),
  gerarRecorrencias: (ano: number, mes: number) => chamar<{ criados: number }>('fin:gerarRecorrencias', { ano, mes }),

  backup: () => chamar<Backup>('fin:backup'),
  backupArquivo: () => chamar<{ ok: true; arquivo: string }>('fin:backupArquivo'),
  restaurar: (b: Backup, modo: 'substituir' | 'mesclar') => chamar<{ ok: true; lancamentos: number; copia: string | null }>('fin:restaurar', { b, modo }),
  limpar: () => chamar<{ ok: true; copia: string | null }>('fin:limpar', { confirmar: 'APAGAR TUDO' }),
}
