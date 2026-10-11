/**
 * Operações do app Patrimônio. Mesma lógica das rotas anteriores, sem HTTP.
 * A ponte com o Finanças deixou de ser rede: os dois núcleos vivem no mesmo processo.
 */
import {
  db, DB_PATH, TABELAS, type NomeTabela, listar, obter, salvar, excluir, contar, transacao, getMeta,
  gerarBackup, restaurarBackup, registrarAlteracao, newId, copiaDeSeguranca,
} from './db.ts'
import { validar } from './validar.ts'
import { erro, errosDeValidacao } from '../erros.ts'
import * as financas from '../financas/api.ts'
import { DB_PATH as FINANCAS_DB } from '../financas/db.ts'
import type { Backup, Info, Movimentacao, Posicao, FluxoConsolidado, Fechamento, Conta } from '../../shared/patrimonio/types.ts'
import { chaveMes } from '../../shared/patrimonio/types.ts'
import type { Lancamento } from '../../shared/financas/types.ts'

type Obj = Record<string, unknown>
const NOMES = Object.keys(TABELAS) as NomeTabela[]
const tabela = (p: string): NomeTabela | null => (NOMES.includes(p as NomeTabela) ? (p as NomeTabela) : null)

// ---------------------------------------------------------------- base completa (uma chamada; a interface calcula o resto)
export function base() {
  const b: Obj = {}
  for (const n of NOMES) b[n] = listar(n)
  return b
}

export function info(): Info {
  const contagens: Record<string, number> = {}
  for (const n of NOMES) contagens[n] = contar(n)
  return { banco: DB_PATH, criadoEm: getMeta('criado_em'), contagens, financas: { disponivel: true, caminho: FINANCAS_DB, api: 'integrado' } }
}

// ---------------------------------------------------------------- CRUD genérico
export function listarTabela({ t }: { t: string }) {
  const n = tabela(t); if (!n) erro('Tabela desconhecida.')
  return listar(n!)
}

export function criar({ t, item: bruto }: { t: string; item: Obj }) {
  const n = tabela(t); if (!n) erro('Tabela desconhecida.')
  const item = normalizar(n!, bruto)
  const erros = validar(n!, item)
  if (erros.length) errosDeValidacao(erros)
  try {
    return salvar(n!, { ...item, id: item.id || newId(prefixo(n!)) })
  } catch (e) { return erro(String((e as Error).message)) }
}

/** Atualização; `motivo` registra a alteração no histórico com os períodos afetados. */
export function atualizar({ t, id, item: corpoBruto }: { t: string; id: string; item: Obj & { motivo?: string } }) {
  const n = tabela(t); if (!n) erro('Tabela desconhecida.')
  const atual = obter<Obj>(n!, id)
  if (!atual) erro('Registro não encontrado.')
  const { motivo, ...corpo } = corpoBruto
  const item = normalizar(n!, { ...atual, ...corpo, id })
  const erros = validar(n!, item)
  if (erros.length) errosDeValidacao(erros)
  try {
    return transacao(() => {
      const r = salvar<Obj>(n!, item)
      if (motivo || periodoDe(atual!) || periodoDe(item)) {
        const periodos = [...new Set([periodoDe(atual!), periodoDe(item)].filter((x): x is string => !!x))]
        registrarAlteracao({ entidade: n!, entidadeId: id, descricao: `Edição de ${n}`, antes: atual!, depois: r, motivo: (motivo as string) ?? null, periodosAfetados: periodos })
      }
      return r
    })
  } catch (e) { return erro(String((e as Error).message)) }
}

export function remover({ t, id, motivo }: { t: string; id: string; motivo?: string }) {
  const n = tabela(t); if (!n) erro('Tabela desconhecida.')
  const atual = obter<Obj>(n!, id)
  if (!atual) erro('Registro não encontrado.')
  transacao(() => {
    if (n === 'investimentos') {
      for (const p of listar<Posicao>('posicoes', 'investimento_id = ?', [id])) excluir('posicoes', p.id)
      for (const m of listar<Movimentacao>('movimentacoes', 'investimento_id = ?', [id])) excluir('movimentacoes', m.id)
    }
    if (n === 'bens') for (const a of listar<Obj>('avaliacoesBem', 'bem_id = ?', [id])) excluir('avaliacoesBem', a.id as string)
    if (n === 'dividas') for (const a of listar<Obj>('saldosDivida', 'divida_id = ?', [id])) excluir('saldosDivida', a.id as string)
    if (n === 'contas') for (const a of listar<Obj>('saldosConta', 'conta_id = ?', [id])) excluir('saldosConta', a.id as string)
    excluir(n!, id)
    registrarAlteracao({ entidade: n!, entidadeId: id, descricao: `Exclusão de ${n}`, antes: atual!, depois: null, motivo: motivo ?? null, periodosAfetados: [periodoDe(atual!)].filter((x): x is string => !!x) })
  })
  return { ok: true as const }
}

function prefixo(t: NomeTabela): string {
  return ({ investimentos: 'inv', posicoes: 'pos', posicoesConsolidadas: 'pc', movimentacoes: 'mov', fluxosConsolidados: 'fc', contas: 'cta', saldosConta: 'sc', bens: 'bem', avaliacoesBem: 'av', dividas: 'div', saldosDivida: 'sd', fechamentos: 'fech', alteracoes: 'alt', pendencias: 'pend' } as Record<string, string>)[t] ?? 'x'
}
function periodoDe(o: Obj | null): string | null {
  if (!o) return null
  if (typeof o.ano === 'number' && typeof o.mes === 'number') return chaveMes(o.ano, o.mes)
  if (typeof o.data === 'string' && o.data.length >= 7) return o.data.slice(0, 7)
  return null
}
/** Deriva ano/mês da data quando faltam; ids determinísticos para posições e fluxos (uma por mês). */
function normalizar(t: NomeTabela, o: Obj): Obj {
  const item = { ...o }
  if (typeof item.data === 'string' && item.data && (item.ano == null || item.mes == null) && t !== 'movimentacoes') { item.ano = Number(item.data.slice(0, 4)); item.mes = Number(item.data.slice(5, 7)) }
  if (t === 'movimentacoes') {
    if (typeof item.data === 'string' && item.data) { item.ano = Number(item.data.slice(0, 4)); item.mes = Number(item.data.slice(5, 7)) }
    if (!item.data && (item.ano == null || item.mes == null)) item.situacao = 'pendente'
    if (item.origemRecurso == null) item.origemRecurso = 'nao_informado'
    if (item.situacao == null) item.situacao = 'confirmada'
  }
  if (t === 'posicoes' && !item.id && item.investimentoId && item.ano && item.mes) item.id = `pos-${item.investimentoId}-${item.ano}-${String(item.mes).padStart(2, '0')}`
  if (t === 'posicoesConsolidadas' && !item.id && item.ano && item.mes) item.id = `pc-${item.ano}-${String(item.mes).padStart(2, '0')}-${item.escopo}${item.categoria ? '-' + item.categoria : ''}`
  if (t === 'fluxosConsolidados' && !item.id && item.ano && item.mes) item.id = `fc-${item.ano}-${String(item.mes).padStart(2, '0')}`
  if (t === 'fechamentos' && !item.id && item.ano && item.mes) item.id = `fech-${item.ano}-${String(item.mes).padStart(2, '0')}`
  if (t === 'saldosConta' && !item.id && item.contaId && item.ano && item.mes) item.id = `sc-${item.contaId}-${item.ano}-${String(item.mes).padStart(2, '0')}`
  if (t === 'investimentos' && !Array.isArray(item.nomesOriginais)) item.nomesOriginais = []
  if (t === 'fluxosConsolidados' && !Array.isArray(item.financasIds)) item.financasIds = []
  for (const k of Object.keys(item)) if (item[k] === '') item[k] = null
  return item
}

// ---------------------------------------------------------------- fechamento mensal ("Atualizar mês")
interface FechamentoCorpo {
  ano: number; mes: number; status: 'rascunho' | 'confirmado'; movimentacoesConfirmadas: boolean; observacoes: string | null
  posicoes: Partial<Posicao>[]; movimentacoes: Partial<Movimentacao>[]; excluirMovimentacoes?: string[]; investimentosNovos?: Obj[]; encerrar?: { investimentoId: string; data: string }[]
  fluxo?: Partial<FluxoConsolidado> | null; motivo?: string | null
}
export function fechamento(c: FechamentoCorpo) {
  if (!c.ano || !c.mes) erro('Informe ano e mês.')
  const erros: string[] = []
  try {
    const r = transacao(() => {
      for (const inv of c.investimentosNovos ?? []) { const it = normalizar('investimentos', inv); const e = validar('investimentos', it); if (e.length) { erros.push(...e); continue } salvar('investimentos', { ...it, id: it.id || newId('inv') }) }
      const anterior = obter<Fechamento>('fechamentos', `fech-${c.ano}-${String(c.mes).padStart(2, '0')}`)
      let nPos = 0, nMov = 0
      for (const p of c.posicoes) {
        const it = normalizar('posicoes', { ...p, ano: c.ano, mes: c.mes, situacao: p.situacao ?? (c.status === 'confirmado' ? 'confirmada' : 'informada') })
        if (it.saldo == null && it.quantidade == null) { // linha vazia: remove posição existente pendente
          const ex = obter<Posicao>('posicoes', it.id as string)
          if (ex && ex.situacao === 'pendente') excluir('posicoes', ex.id)
          continue
        }
        const e = validar('posicoes', it); if (e.length) { erros.push(...e); continue }
        const ex = obter<Posicao>('posicoes', it.id as string)
        if (ex && anterior?.status === 'confirmado' && (ex.saldo !== it.saldo || ex.quantidade !== it.quantidade))
          registrarAlteracao({ entidade: 'posicoes', entidadeId: ex.id, descricao: 'Correção de posição em mês já confirmado', antes: ex, depois: it, motivo: c.motivo ?? null, periodosAfetados: [chaveMes(c.ano, c.mes)] })
        salvar('posicoes', it); nPos++
      }
      for (const id of c.excluirMovimentacoes ?? []) excluir('movimentacoes', id)
      for (const m of c.movimentacoes) {
        const it = normalizar('movimentacoes', { ...m, id: m.id || newId('mov'), origem: m.origem ?? 'manual' })
        const e = validar('movimentacoes', it); if (e.length) { erros.push(...e); continue }
        salvar('movimentacoes', it); nMov++
      }
      for (const enc of c.encerrar ?? []) {
        const inv = obter<Obj>('investimentos', enc.investimentoId)
        if (inv) salvar('investimentos', { ...inv, situacao: 'encerrado', dataEncerramento: enc.data })
      }
      if (c.fluxo) salvar('fluxosConsolidados', normalizar('fluxosConsolidados', { ...c.fluxo, ano: c.ano, mes: c.mes, origem: c.fluxo.origem ?? 'manual' }))
      const fech = salvar<Fechamento>('fechamentos', { id: `fech-${c.ano}-${String(c.mes).padStart(2, '0')}`, ano: c.ano, mes: c.mes, status: c.status, movimentacoesConfirmadas: !!c.movimentacoesConfirmadas, observacoes: c.observacoes ?? null, confirmadoEm: c.status === 'confirmado' ? new Date().toISOString() : anterior?.confirmadoEm ?? null })
      if (c.status === 'confirmado') {
        // posições informadas passam a confirmadas
        for (const p of listar<Posicao>('posicoes', 'ano = ? AND mes = ? AND situacao = ?', [c.ano, c.mes, 'informada'])) salvar('posicoes', { ...p, situacao: 'confirmada' })
      }
      return { fechamento: fech, posicoes: nPos, movimentacoes: nMov }
    })
    return { ...r, erros }
  } catch (e) { return erro(String((e as Error).message)) }
}

// ---------------------------------------------------------------- importação em lote (CSV/XLSX já interpretados na interface)
/** Insere registros de várias tabelas; ignora os que já existem por id ou pela mesma origem (arquivo + célula/linha). */
export function importar({ origemArquivo, itens }: { origemArquivo: string; itens: Record<string, Obj[]> }) {
  const resultado: Record<string, { criados: number; ignorados: number; rejeitados: { indice: number; erros: string[] }[] }> = {}
  transacao(() => {
    for (const [nome, lista] of Object.entries(itens ?? {})) {
      const t = tabela(nome)
      if (!t) continue
      const r = { criados: 0, ignorados: 0, rejeitados: [] as { indice: number; erros: string[] }[] }
      lista.forEach((raw, i) => {
        const it = normalizar(t, { ...raw, origemArquivo: raw.origemArquivo ?? origemArquivo, origem: raw.origem ?? `importação: ${origemArquivo}` })
        const e = validar(t, it); if (e.length) { r.rejeitados.push({ indice: i, erros: e }); return }
        if (it.id && obter(t, it.id as string)) { r.ignorados++; return }
        if (it.origem && it.origemArquivo && db.prepare(`SELECT 1 FROM ${TABELAS[t].nome} WHERE origem = ? AND origem_arquivo = ?`).get(it.origem as string, it.origemArquivo as string)) { r.ignorados++; return }
        salvar(t, { ...it, id: it.id || newId(prefixo(t)) }); r.criados++
      })
      resultado[nome] = r
    }
  })
  return resultado
}

// ---------------------------------------------------------------- dados: backup / restauração / limpeza
export const backup = () => gerarBackup()

export function restaurar({ b, modo = 'substituir' }: { b: Backup; modo: 'substituir' | 'mesclar' }) {
  // substituir apaga tudo: antes, guarda uma cópia do banco atual
  const copia = modo === 'substituir' && b?.versao === 2 ? copiaDeSeguranca('antes-de-restaurar') : null
  try { return { ok: true as const, inseridos: restaurarBackup(b, modo), copia } }
  catch (e) { return erro(String((e as Error).message)) }
}

export function backupArquivo() {
  const dest = copiaDeSeguranca('copia')
  if (!dest) erro('Banco em memória: não há arquivo para copiar.')
  return { ok: true as const, arquivo: dest! }
}

export function limpar({ confirmar }: { confirmar: string }) {
  if (confirmar !== 'APAGAR TUDO') erro('Confirmação inválida.')
  const copia = copiaDeSeguranca('antes-de-apagar')
  transacao(() => { for (const t of Object.values(TABELAS)) db.exec(`DELETE FROM ${t.nome}`) })
  return { ok: true as const, copia }
}

// ---------------------------------------------------------------- integração com o Finanças (mesmo processo)
/** Fluxos de investimento/resgate registrados no Finanças, agrupados por mês. */
export function financasFluxos() {
  const rows = financas.lancamentos().filter((l) => !l.foraDoFluxo && (l.tipo === 'investimento' || l.tipo === 'resgate'))
  const meses = new Map<string, { ano: number; mes: number; investimentos: number; resgates: number; liquido: number; ids: string[]; itens: Obj[] }>()
  for (const r of rows) {
    const k = chaveMes(r.ano, r.mes)
    const m = meses.get(k) ?? { ano: r.ano, mes: r.mes, investimentos: 0, resgates: 0, liquido: 0, ids: [], itens: [] }
    if (r.tipo === 'investimento') m.investimentos += r.valor; else m.resgates += r.valor
    m.liquido = Math.round((m.investimentos - m.resgates) * 100) / 100
    m.ids.push(r.id)
    m.itens.push({ id: r.id, data: r.data, tipo: r.tipo, valor: r.valor, descricao: r.descricao, subcategoria: r.subcategoria, conta: r.conta })
    meses.set(k, m)
  }
  const jaImportados = new Set(listar<FluxoConsolidado>('fluxosConsolidados').flatMap((x) => x.financasIds))
  const movsLigadas = new Set(listar<Movimentacao>('movimentacoes').map((m) => m.financasId).filter(Boolean))
  return { disponivel: true, caminho: FINANCAS_DB, meses: [...meses.values()].map((m) => ({ ...m, novos: m.ids.filter((id) => !jaImportados.has(id) && !movsLigadas.has(id)).length })) }
}

/** Cria/atualiza o fluxo consolidado de um mês a partir dos lançamentos do Finanças (guarda os ids para não repetir). */
export function financasImportarFluxo({ ano, mes, substituir }: { ano: number; mes: number; substituir?: boolean }) {
  const rows = financas.lancamentos().filter((l) => !l.foraDoFluxo && l.ano === ano && l.mes === mes && (l.tipo === 'investimento' || l.tipo === 'resgate'))
  const liquido = Math.round(rows.reduce((s, r) => s + (r.tipo === 'investimento' ? r.valor : -r.valor), 0) * 100) / 100
  const id = `fc-${ano}-${String(mes).padStart(2, '0')}`
  const ex = obter<FluxoConsolidado>('fluxosConsolidados', id)
  if (ex && ex.origem && !ex.origem.startsWith('financas') && ex.aportesLiquidos != null && Math.abs(ex.aportesLiquidos - liquido) > 0.005 && !substituir)
    erro(`Já existe um valor para ${chaveMes(ano, mes)} (${ex.aportesLiquidos}) diferente do Finanças (${liquido}).`, { conflito: true, atual: ex, novo: liquido })
  return salvar<FluxoConsolidado>('fluxosConsolidados', { ...(ex ?? {}), id, ano, mes, aportesLiquidos: liquido, proventos: ex?.proventos ?? null, proventosSituacao: ex?.proventosSituacao ?? null, resultadoExcluiProventos: false, origem: `financas:${rows.length} lançamento(s)`, origemArquivo: 'financas', financasIds: rows.map((r) => r.id), observacoes: 'Aporte líquido importado do Finanças (investimento − resgate do mês).' })
}

/** Contas cadastradas no Finanças (para vincular nomes). */
export function financasContas() {
  return financas.contas().map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo, ativo: c.ativo ? 1 : 0 }))
}

/** Registra no Finanças o lançamento de caixa correspondente a uma aplicação/resgate com dinheiro externo. */
export function financasLancamento({ movimentacaoId }: { movimentacaoId: string }) {
  const m = obter<Movimentacao>('movimentacoes', movimentacaoId)
  if (!m) erro('Movimentação não encontrada.')
  if (m!.financasId) erro('Esta movimentação já foi registrada no Finanças.', { financasId: m!.financasId })
  if (!m!.data || m!.valor == null) erro('A movimentação precisa ter data e valor.')
  const entrada = ['compra', 'aplicacao'].includes(m!.tipo)
  const saida = ['venda', 'resgate', 'amortizacao'].includes(m!.tipo)
  if (!entrada && !saida) erro('Só aplicações/compras e resgates/vendas geram lançamento de caixa.')
  if (m!.origemRecurso !== 'externo') erro('Só movimentações com dinheiro externo (conta) geram lançamento no fluxo de caixa; reinvestimentos internos não.')
  const inv = m!.investimentoId ? obter<Obj>('investimentos', m!.investimentoId) : null
  const conta = m!.contaId ? obter<Conta>('contas', m!.contaId) : null
  const origem = `patrimonio:${m!.id}`
  const existente = (financas.lancamentos() as Lancamento[]).find((l) => l.origem === origem)
  if (existente) { salvar('movimentacoes', { ...m!, financasId: existente.id }); return { ok: true as const, jaExistia: true, financasId: existente.id } }
  const l = financas.criarLancamento({
    data: m!.data!, descricao: `${entrada ? 'Aporte' : 'Resgate'} — ${(inv?.nome as string) ?? 'investimento'}`, tipo: entrada ? 'investimento' : 'resgate', valor: m!.valor!,
    grupo: 'Investimentos', categoria: 'Investimentos', subcategoria: categoriaFinancas((inv?.categoria as string) ?? null), conta: conta?.financasNome ?? conta?.nome ?? null,
    formaPagamento: null, parcela: null, totalParcelas: null, observacoes: m!.observacoes, origem, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null,
  })
  salvar('movimentacoes', { ...m!, financasId: l.id })
  return { ok: true as const, financasId: l.id }
}

function categoriaFinancas(cat: string | null): string {
  return ({ Reserva: 'Reserva', RendaFixa: 'Renda Fixa', TesouroDireto: 'Tesouro Direto', Acoes: 'Ações', FII: "FII's", Fundos: 'Fundos', Cripto: 'Outros', Previdencia: 'Previdência', Outros: 'Outros' } as Record<string, string>)[cat ?? ''] ?? 'Outros'
}
