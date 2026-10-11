/**
 * Operações do app Finanças. Cada função equivale a uma rota da API anterior — mesma lógica,
 * chamada diretamente pelo processo principal do Electron (sem HTTP).
 */
import {
  db, DB_PATH, prepararBancoNovo, listarLancamentos, inserirLancamento, atualizarLancamento, validarLancamento,
  rowToLancamento, gerarParcelamento, listarCategorias, rowToCategoria, listarContas, rowToConta, listarRecorrencias,
  rowToRecorrencia, listarProjetos, rowToProjeto, garantirProjetosDosRazoes, garantirCategoria, newId, getMeta,
  transacao, copiaDeSeguranca,
} from './db.ts'
import { erro, errosDeValidacao } from '../erros.ts'
import type { LancamentoInput, Backup, Recorrencia, Grupo, Categoria } from '../../shared/financas/types.ts'

/** Erros do SQLite (restrição única etc.) viram uma mensagem legível; os demais seguem como estão. */
const unico = (e: unknown, mensagem: string): never => { if (String(e).includes('UNIQUE')) erro(mensagem); throw e }

type Row = Record<string, string | number | null | bigint | Uint8Array>

export function iniciar() {
  const inicial = prepararBancoNovo()
  if (inicial.categorias) console.log(`[financas] ${inicial.categorias} categorias padrão criadas.`)
}

// ---------- lançamentos ----------
export const lancamentos = () => listarLancamentos()

export function criarLancamento(input: LancamentoInput) {
  const erros = validarLancamento(input)
  if (erros.length) errosDeValidacao(erros)
  const l = inserirLancamento({ ...input, origem: input.origem ?? 'manual' })
  if (!l.foraDoFluxo) garantirCategoria(l.tipo, l.grupo, l.categoria, l.subcategoria)
  return l
}

/** Inserção em lote (importação). Devolve ids criados; rejeita individualmente os inválidos. */
export function lote({ itens = [], origemArquivo = null }: { itens: LancamentoInput[]; origemArquivo: string | null }) {
  const criados: string[] = []
  const rejeitados: { indice: number; erros: string[] }[] = []
  transacao(() => {
    itens.forEach((it, i) => {
      const erros = validarLancamento(it)
      if (erros.length) { rejeitados.push({ indice: i, erros }); return }
      const l = inserirLancamento({ ...it, origem: it.origem ?? `importação: ${origemArquivo ?? 'arquivo'}`, origemArquivo: it.origemArquivo ?? origemArquivo })
      if (!l.foraDoFluxo) garantirCategoria(l.tipo, l.grupo, l.categoria, l.subcategoria)
      criados.push(l.id)
    })
    garantirProjetosDosRazoes() // custos importados criam o projeto correspondente
  })
  return { criados: criados.length, rejeitados }
}

/** Cria ou regenera as parcelas de uma compra parcelada (valor total dividido pelo nº de parcelas). */
export function parcelamento({ base, valorTotal, totalParcelas, dataInicio, parcelamentoId }: { base: LancamentoInput; valorTotal: number; totalParcelas: number; dataInicio: string; parcelamentoId?: string | null }) {
  const erros = validarLancamento({ ...base, data: dataInicio, valor: valorTotal, parcela: null, totalParcelas: null })
  if (!(totalParcelas >= 1) || !Number.isInteger(totalParcelas)) erros.push('Número de parcelas inválido.')
  if (valorTotal < 0) erros.push('Compra parcelada deve ter valor positivo.')
  if (erros.length) errosDeValidacao(erros)
  const r = gerarParcelamento(base, valorTotal, totalParcelas, dataInicio, parcelamentoId ?? null)
  if (!base.foraDoFluxo) garantirCategoria(base.tipo, base.grupo, base.categoria, base.subcategoria)
  return r
}

/** Troca categoria/subcategoria de vários lançamentos de uma vez (edição em lote). */
export function recategorizar({ ids, categoria, subcategoria, grupo }: { ids: string[]; categoria: string; subcategoria?: string | null; grupo?: Grupo | null }) {
  if (!Array.isArray(ids) || !ids.length) erro('Nenhum lançamento selecionado.')
  if (!categoria?.trim()) erro('Categoria obrigatória.')
  const cat = categoria.trim(); const sub = subcategoria?.trim() || null
  const agora = new Date().toISOString()
  return transacao(() => {
    let atualizados = 0
    const upd = db.prepare('UPDATE lancamentos SET categoria = ?, subcategoria = ?, grupo = ?, atualizado_em = ? WHERE id = ? AND fora_do_fluxo = 0')
    for (const id of ids) {
      const l = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id) as Row | undefined
      if (!l) continue
      const lanc = rowToLancamento(l)
      // grupo só faz sentido em despesas; nos demais tipos mantém o padrão do tipo
      const novoGrupo = lanc.tipo === 'despesa' ? (grupo ?? lanc.grupo) : lanc.grupo
      atualizados += Number(upd.run(cat, sub, novoGrupo, agora, id).changes)
      if (!lanc.foraDoFluxo) garantirCategoria(lanc.tipo, novoGrupo, cat, sub)
    }
    return { atualizados }
  })
}

export function atualizarLanc({ id, input }: { id: string; input: LancamentoInput }) {
  const erros = validarLancamento(input)
  if (erros.length) errosDeValidacao(erros)
  const l = atualizarLancamento(id, input)
  if (!l) erro('Lançamento não encontrado.')
  if (!l!.foraDoFluxo) garantirCategoria(l!.tipo, l!.grupo, l!.categoria, l!.subcategoria)
  return l!
}

export function excluirLancamento({ id }: { id: string }) {
  const r = db.prepare('DELETE FROM lancamentos WHERE id = ?').run(id)
  if (!r.changes) erro('Lançamento não encontrado.')
  return { ok: true as const }
}

export function duplicarLancamento({ id, data }: { id: string; data?: string }) {
  const row = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id) as Row | undefined
  if (!row) erro('Lançamento não encontrado.')
  const orig = rowToLancamento(row!)
  return inserirLancamento({ ...orig, id: undefined, data: data ?? orig.data, ano: undefined, mes: undefined, origem: `cópia de ${orig.id}`, origemArquivo: null, recorrenciaId: null, parcelamentoId: null })
}

// ---------- categorias ----------
export const categorias = () => listarCategorias()

export function criarCategoria({ nome, tipo, grupo, parentId }: { nome: string; tipo: string; grupo?: string | null; parentId?: number | null }) {
  if (!nome?.trim() || !tipo) erro('Nome e tipo são obrigatórios.')
  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0)+1 AS o FROM categorias WHERE parent_id IS ?').get(parentId ?? null) as Row).o as number
  try {
    const r = db.prepare('INSERT INTO categorias (nome, tipo, grupo, parent_id, ordem) VALUES (?,?,?,?,?)').run(nome.trim(), tipo, grupo ?? null, parentId ?? null, ordem)
    return rowToCategoria(db.prepare('SELECT * FROM categorias WHERE id = ?').get(Number(r.lastInsertRowid)) as Row)
  } catch {
    return erro('Já existe uma categoria com esse nome.')
  }
}

/** Renomear/mover categoria; propaga o novo nome aos lançamentos. Nome já existente no mesmo nível = mesclagem. */
export function atualizarCategoria({ id, nome, grupo, parentId }: { id: number; nome?: string; grupo?: string | null; parentId?: number | null }): Categoria & { mesclada?: boolean } {
  const atual = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id) as Row | undefined
  if (!atual) erro('Categoria não encontrada.')
  const novoNome = nome?.trim() || (atual!.nome as string)
  const novoGrupo = (grupo === undefined ? (atual!.grupo as string | null) : grupo) as Grupo | null
  const novoParent = parentId === undefined ? (atual!.parent_id as number | null) : parentId
  const tipo = atual!.tipo as string
  const alvo = db.prepare('SELECT * FROM categorias WHERE nome = ? AND tipo = ? AND parent_id IS ? AND id <> ?').get(novoNome, tipo, novoParent, id) as Row | undefined
  const mescla = transacao(() => {
    if (alvo) {
      if (atual!.parent_id == null) {
        db.prepare('UPDATE lancamentos SET categoria = ?, grupo = COALESCE(?, grupo) WHERE categoria = ? AND tipo = ? AND fora_do_fluxo = 0').run(alvo.nome as string, (alvo.grupo as string) ?? null, atual!.nome as string, tipo)
        // subcategorias da antiga passam para a nova; as que já existem lá são apenas removidas
        for (const f of db.prepare('SELECT * FROM categorias WHERE parent_id = ?').all(id) as Row[]) {
          const ja = db.prepare('SELECT 1 FROM categorias WHERE parent_id = ? AND nome = ?').get(alvo.id as number, f.nome as string)
          if (ja) db.prepare('DELETE FROM categorias WHERE id = ?').run(f.id as number)
          else db.prepare('UPDATE categorias SET parent_id = ?, grupo = ? WHERE id = ?').run(alvo.id as number, (alvo.grupo as string) ?? null, f.id as number)
        }
        db.prepare('UPDATE recorrencias SET categoria = ? WHERE categoria = ? AND tipo = ?').run(alvo.nome as string, atual!.nome as string, tipo)
      } else {
        const paiAntigo = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(atual!.parent_id as number) as Row
        const paiNovo = db.prepare('SELECT nome, grupo FROM categorias WHERE id = ?').get(alvo.parent_id as number) as Row
        db.prepare('UPDATE lancamentos SET subcategoria = ?, categoria = ?, grupo = COALESCE(?, grupo) WHERE subcategoria = ? AND categoria = ? AND tipo = ? AND fora_do_fluxo = 0')
          .run(alvo.nome as string, paiNovo.nome as string, (paiNovo.grupo as string) ?? null, atual!.nome as string, paiAntigo.nome as string, tipo)
        db.prepare('UPDATE recorrencias SET subcategoria = ?, categoria = ? WHERE subcategoria = ? AND categoria = ? AND tipo = ?').run(alvo.nome as string, paiNovo.nome as string, atual!.nome as string, paiAntigo.nome as string, tipo)
      }
      db.prepare('DELETE FROM categorias WHERE id = ?').run(id)
      return { ...rowToCategoria(alvo), mesclada: true }
    }
    db.prepare('UPDATE categorias SET nome = ?, grupo = ?, parent_id = ? WHERE id = ?').run(novoNome, novoGrupo, novoParent, id)
    if (atual!.parent_id == null) {
      // categoria raiz: renomeia em lançamentos e propaga grupo às filhas
      db.prepare('UPDATE lancamentos SET categoria = ?, grupo = COALESCE(?, grupo) WHERE categoria = ? AND tipo = ? AND fora_do_fluxo = 0').run(novoNome, novoGrupo, atual!.nome as string, tipo)
      db.prepare('UPDATE categorias SET grupo = ? WHERE parent_id = ?').run(novoGrupo, id)
      // recorrências também guardam o nome: sem isto, gerariam lançamentos na categoria antiga
      db.prepare('UPDATE recorrencias SET categoria = ? WHERE categoria = ? AND tipo = ?').run(novoNome, atual!.nome as string, tipo)
    } else {
      const paiAntigo = db.prepare('SELECT nome FROM categorias WHERE id = ?').get(atual!.parent_id as number) as Row
      const paiNovo = db.prepare('SELECT nome, grupo FROM categorias WHERE id = ?').get(novoParent as number) as Row | undefined
      db.prepare('UPDATE lancamentos SET subcategoria = ?, categoria = ?, grupo = COALESCE(?, grupo) WHERE subcategoria = ? AND categoria = ? AND tipo = ? AND fora_do_fluxo = 0')
        .run(novoNome, (paiNovo?.nome ?? paiAntigo.nome) as string, (paiNovo?.grupo as string) ?? null, atual!.nome as string, paiAntigo.nome as string, tipo)
      db.prepare('UPDATE recorrencias SET subcategoria = ?, categoria = ? WHERE subcategoria = ? AND categoria = ? AND tipo = ?')
        .run(novoNome, (paiNovo?.nome ?? paiAntigo.nome) as string, atual!.nome as string, paiAntigo.nome as string, tipo)
    }
    return null
  })
  if (mescla) return mescla
  return rowToCategoria(db.prepare('SELECT * FROM categorias WHERE id = ?').get(id) as Row)
}

export function reordenarCategorias({ ids = [] }: { ids: number[] }) {
  transacao(() => ids.forEach((id, i) => db.prepare('UPDATE categorias SET ordem = ? WHERE id = ?').run(i + 1, id)))
  return { ok: true as const }
}

export function excluirCategoria({ id, forcar }: { id: number; forcar?: boolean }) {
  const cat = db.prepare('SELECT * FROM categorias WHERE id = ?').get(id) as Row | undefined
  if (!cat) erro('Categoria não encontrada.')
  const emUso = cat!.parent_id == null
    ? (db.prepare('SELECT COUNT(*) AS n FROM lancamentos WHERE categoria = ? AND tipo = ?').get(cat!.nome as string, cat!.tipo as string) as Row).n
    : (db.prepare('SELECT COUNT(*) AS n FROM lancamentos l JOIN categorias p ON p.id = ? WHERE l.subcategoria = ? AND l.categoria = p.nome AND l.tipo = ?').get(cat!.parent_id as number, cat!.nome as string, cat!.tipo as string) as Row).n
  if ((emUso as number) > 0 && !forcar) erro(`Categoria em uso por ${emUso} lançamento(s).`, { emUso })
  db.prepare('DELETE FROM categorias WHERE id = ?').run(id)
  return { ok: true as const }
}

// ---------- contas ----------
export const contas = () => listarContas()

export function criarConta({ nome, tipo }: { nome: string; tipo?: string }) {
  if (!nome?.trim()) erro('Nome obrigatório.')
  try {
    const r = db.prepare('INSERT INTO contas (nome, tipo) VALUES (?, ?)').run(nome.trim(), tipo ?? 'conta')
    return rowToConta(db.prepare('SELECT * FROM contas WHERE id = ?').get(Number(r.lastInsertRowid)) as Row)
  } catch { return erro('Já existe uma conta com esse nome.') }
}

export function atualizarConta({ id, nome, tipo, ativo }: { id: number; nome?: string; tipo?: string; ativo?: boolean }) {
  const atual = db.prepare('SELECT * FROM contas WHERE id = ?').get(id) as Row | undefined
  if (!atual) erro('Conta não encontrada.')
  const novoNome = nome?.trim() || (atual!.nome as string)
  try {
    transacao(() => {
      db.prepare('UPDATE contas SET nome = ?, tipo = ?, ativo = ? WHERE id = ?').run(novoNome, tipo ?? (atual!.tipo as string), ativo == null ? (atual!.ativo as number) : (ativo ? 1 : 0), id)
      if (novoNome !== atual!.nome) db.prepare('UPDATE lancamentos SET conta = ? WHERE conta = ?').run(novoNome, atual!.nome as string)
    })
  } catch (e) { unico(e, 'Já existe uma conta com esse nome.') }
  return rowToConta(db.prepare('SELECT * FROM contas WHERE id = ?').get(id) as Row)
}

export function excluirConta({ id }: { id: number }) {
  db.prepare('DELETE FROM contas WHERE id = ?').run(id)
  return { ok: true as const }
}

// ---------- projetos (custos fora do fluxo) ----------
export const projetos = () => listarProjetos()

export function criarProjeto({ nome, descricao }: { nome: string; descricao?: string | null }) {
  if (!nome?.trim()) erro('Nome obrigatório.')
  try {
    const r = db.prepare('INSERT INTO projetos (nome, descricao, criado_em) VALUES (?, ?, ?)').run(nome.trim(), descricao?.trim() || null, new Date().toISOString())
    return rowToProjeto(db.prepare('SELECT * FROM projetos WHERE id = ?').get(Number(r.lastInsertRowid)) as Row)
  } catch { return erro('Já existe um projeto com esse nome.') }
}

export function atualizarProjeto({ id, nome, descricao }: { id: number; nome?: string; descricao?: string | null }) {
  const atual = db.prepare('SELECT * FROM projetos WHERE id = ?').get(id) as Row | undefined
  if (!atual) erro('Projeto não encontrado.')
  const novoNome = nome?.trim() || (atual!.nome as string)
  if (novoNome !== atual!.nome && db.prepare('SELECT 1 FROM projetos WHERE nome = ? AND id <> ?').get(novoNome, atual!.id as number)) erro('Já existe um projeto com esse nome.')
  transacao(() => {
    db.prepare('UPDATE projetos SET nome = ?, descricao = ? WHERE id = ?').run(novoNome, descricao === undefined ? (atual!.descricao as string | null) : (descricao?.trim() || null), id)
    // os custos ficam ligados ao projeto pelo nome (ledger)
    if (novoNome !== atual!.nome) db.prepare('UPDATE lancamentos SET ledger = ?, atualizado_em = ? WHERE fora_do_fluxo = 1 AND ledger = ?').run(novoNome, new Date().toISOString(), atual!.nome as string)
  })
  return rowToProjeto(db.prepare('SELECT * FROM projetos WHERE id = ?').get(id) as Row)
}

/** Remove o projeto e todos os seus custos. */
export function excluirProjeto({ id }: { id: number }) {
  const atual = db.prepare('SELECT * FROM projetos WHERE id = ?').get(id) as Row | undefined
  if (!atual) erro('Projeto não encontrado.')
  const removidos = transacao(() => {
    const r = db.prepare('DELETE FROM lancamentos WHERE fora_do_fluxo = 1 AND ledger = ?').run(atual!.nome as string)
    db.prepare('DELETE FROM projetos WHERE id = ?').run(id)
    return Number(r.changes)
  })
  return { ok: true as const, custosRemovidos: removidos }
}

// ---------- recorrências ----------
export const recorrencias = () => listarRecorrencias()

export function criarRecorrencia(r: Recorrencia) {
  if (!r.descricao?.trim() || !(r.valor > 0) || !r.tipo || !r.inicio) erro('Descrição, valor, tipo e início são obrigatórios.')
  const id = newId('rec')
  db.prepare(`INSERT INTO recorrencias (id, descricao, valor, tipo, grupo, categoria, subcategoria, conta, forma_pagamento, dia, inicio, fim, observacoes, ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`).run(id, r.descricao.trim(), r.valor, r.tipo, r.grupo ?? null, r.categoria ?? null, r.subcategoria ?? null,
    r.conta ?? null, r.formaPagamento ?? null, r.dia || 1, r.inicio, r.fim ?? null, r.observacoes ?? null)
  return rowToRecorrencia(db.prepare('SELECT * FROM recorrencias WHERE id = ?').get(id) as Row)
}

export function atualizarRecorrencia({ id, r }: { id: string; r: Recorrencia }) {
  const ex = db.prepare('SELECT * FROM recorrencias WHERE id = ?').get(id)
  if (!ex) erro('Recorrência não encontrada.')
  db.prepare(`UPDATE recorrencias SET descricao=?, valor=?, tipo=?, grupo=?, categoria=?, subcategoria=?, conta=?, forma_pagamento=?, dia=?, inicio=?, fim=?, observacoes=?, ativo=? WHERE id=?`)
    .run(r.descricao.trim(), r.valor, r.tipo, r.grupo ?? null, r.categoria ?? null, r.subcategoria ?? null, r.conta ?? null, r.formaPagamento ?? null,
      r.dia || 1, r.inicio, r.fim ?? null, r.observacoes ?? null, r.ativo === false ? 0 : 1, id)
  return rowToRecorrencia(db.prepare('SELECT * FROM recorrencias WHERE id = ?').get(id) as Row)
}

export function excluirRecorrencia({ id }: { id: string }) {
  db.prepare('DELETE FROM recorrencias WHERE id = ?').run(id)
  return { ok: true as const }
}

/** Gera os lançamentos das recorrências ativas para um mês (ignora as já geradas). */
export function gerarRecorrencias({ ano, mes }: { ano: number; mes: number }) {
  if (!ano || !mes) erro('Informe ano e mês.')
  const comp = `${ano}-${String(mes).padStart(2, '0')}`
  const recs = listarRecorrencias().filter((r) => r.ativo && r.inicio <= comp && (!r.fim || r.fim >= comp))
  const criados: string[] = []
  transacao(() => { for (const r of recs) {
    const ja = db.prepare('SELECT 1 FROM lancamentos WHERE recorrencia_id = ? AND ano = ? AND mes = ?').get(r.id, ano, mes)
    if (ja) continue
    const ultimoDia = new Date(ano, mes, 0).getDate()
    const dia = Math.min(r.dia, ultimoDia)
    const l = inserirLancamento({
      data: `${comp}-${String(dia).padStart(2, '0')}`, descricao: r.descricao, tipo: r.tipo, valor: r.valor, grupo: r.grupo,
      categoria: r.categoria, subcategoria: r.subcategoria, conta: r.conta, formaPagamento: r.formaPagamento, parcela: null, totalParcelas: null,
      observacoes: r.observacoes, origem: `recorrência: ${r.descricao}`, origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: r.id,
    })
    criados.push(l.id)
  } })
  return { criados: criados.length }
}

// ---------- dados: backup / restauração / limpeza ----------
export function backup(): Backup {
  return { versao: 1, geradoEm: new Date().toISOString(), lancamentos: listarLancamentos(), categorias: listarCategorias(), contas: listarContas(), recorrencias: listarRecorrencias(), projetos: listarProjetos() }
}

/**
 * Categorias do backup entram pelo NOME (tipo + categoria pai), não pelo id: os ids de outro banco podem
 * pertencer a outras categorias aqui. As que já existem são reaproveitadas; as novas são criadas.
 */
function restaurarCategorias(cats: Categoria[]) {
  const mapa = new Map<number, number>() // id no backup → id neste banco
  const buscar = db.prepare('SELECT id FROM categorias WHERE nome = ? AND tipo = ? AND parent_id IS ?')
  const inserir = db.prepare('INSERT INTO categorias (nome, tipo, grupo, parent_id, ordem) VALUES (?,?,?,?,?)')
  for (const raizes of [true, false]) {
    for (const c of cats) {
      if ((c.parentId == null) !== raizes) continue
      const pai = c.parentId == null ? null : mapa.get(c.parentId)
      if (pai === undefined) continue // pai ausente do backup
      const ja = buscar.get(c.nome, c.tipo, pai) as { id: number } | undefined
      mapa.set(c.id, ja ? ja.id : Number(inserir.run(c.nome, c.tipo, c.grupo, pai, c.ordem).lastInsertRowid))
    }
  }
}

export function restaurar({ b, modo = 'substituir' }: { b: Backup; modo: 'substituir' | 'mesclar' }) {
  if (b?.versao !== 1 || !Array.isArray(b.lancamentos)) erro('Arquivo de backup inválido.')
  // substituir apaga tudo: antes, guarda uma cópia do banco atual
  const copia = modo === 'substituir' ? copiaDeSeguranca('antes-de-restaurar') : null
  return transacao(() => {
    if (modo === 'substituir') {
      db.exec('DELETE FROM lancamentos; DELETE FROM categorias; DELETE FROM contas; DELETE FROM recorrencias; DELETE FROM projetos;')
    }
    let n = 0
    for (const l of b.lancamentos) {
      if (db.prepare('SELECT 1 FROM lancamentos WHERE id = ?').get(l.id)) continue
      inserirLancamento({ ...l }, { criadoEm: l.criadoEm }); n++
    }
    restaurarCategorias(b.categorias ?? [])
    for (const c of b.contas ?? []) db.prepare('INSERT OR IGNORE INTO contas (id, nome, tipo, ativo) VALUES (?,?,?,?)').run(c.id, c.nome, c.tipo, c.ativo ? 1 : 0)
    for (const r of b.recorrencias ?? []) db.prepare(`INSERT OR IGNORE INTO recorrencias (id, descricao, valor, tipo, grupo, categoria, subcategoria, conta, forma_pagamento, dia, inicio, fim, observacoes, ativo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(r.id, r.descricao, r.valor, r.tipo, r.grupo, r.categoria, r.subcategoria, r.conta, r.formaPagamento, r.dia, r.inicio, r.fim, r.observacoes, r.ativo ? 1 : 0)
    for (const p of b.projetos ?? []) db.prepare('INSERT OR IGNORE INTO projetos (nome, descricao, criado_em) VALUES (?,?,?)').run(p.nome, p.descricao, p.criadoEm)
    garantirProjetosDosRazoes() // backups antigos (sem projetos) ganham um projeto por nome de custo
    return { ok: true as const, lancamentos: n, copia }
  })
}

/** Cópia do arquivo .db em backups/, ao lado do banco (backup físico, consistente mesmo com gravações pendentes). */
export function backupArquivo() {
  const dest = copiaDeSeguranca('copia')
  if (!dest) erro('Banco em memória: não há arquivo para copiar.')
  return { ok: true as const, arquivo: dest! }
}

export function limpar({ confirmar }: { confirmar: string }) {
  if (confirmar !== 'APAGAR TUDO') erro('Confirmação inválida.')
  const copia = copiaDeSeguranca('antes-de-apagar')
  transacao(() => db.exec('DELETE FROM lancamentos; DELETE FROM categorias; DELETE FROM contas; DELETE FROM recorrencias; DELETE FROM projetos;'))
  return { ok: true as const, copia }
}

export function info() {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM lancamentos').get() as Row).n
  return { banco: DB_PATH, lancamentos: n as number, criadoEm: getMeta('criado_em') }
}
