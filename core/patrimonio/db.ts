import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import type { Backup, Alteracao } from '../../shared/patrimonio/types.ts'

/** Pasta base quando nenhum caminho é informado (no aplicativo, quem manda é a variável de ambiente). */
export const ROOT = process.cwd()
export const DB_PATH = process.env.PATRIMONIO_DB ?? path.join(ROOT, 'data', 'patrimonio.db')
/** Backups e anexos ficam ao lado do banco, seja qual for a pasta escolhida pelo app. */
export const DATA_DIR = path.dirname(DB_PATH)

fs.mkdirSync(DATA_DIR, { recursive: true })
export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

/**
 * Definição das tabelas. Colunas camelCase viram snake_case no SQLite; `json` guarda arrays/objetos;
 * `bool` guarda 0/1. Todas as tabelas têm id TEXT PRIMARY KEY, criado_em e atualizado_em.
 */
export interface Tabela { nome: string; colunas: string[]; json?: string[]; bool?: string[]; unico?: string[]; indices?: string[][] }

export const TABELAS: Record<string, Tabela> = {
  investimentos: { nome: 'investimentos', colunas: ['nome', 'codigo', 'categoria', 'subtipo', 'instituicao', 'dataInicio', 'dataEncerramento', 'vencimento', 'indexador', 'condicoes', 'observacoes', 'situacao', 'nomesOriginais', 'origem', 'origemArquivo'], json: ['nomesOriginais'] },
  posicoes: { nome: 'posicoes', colunas: ['investimentoId', 'ano', 'mes', 'dataPosicao', 'saldo', 'quantidade', 'custo', 'situacao', 'origem', 'origemArquivo', 'observacoes'], unico: ['investimentoId', 'ano', 'mes'], indices: [['ano', 'mes']] },
  posicoesConsolidadas: { nome: 'posicoes_consolidadas', colunas: ['ano', 'mes', 'escopo', 'categoria', 'saldo', 'dataPosicao', 'situacao', 'origem', 'origemArquivo', 'observacoes'], unico: ['ano', 'mes', 'escopo', 'categoria'] },
  movimentacoes: { nome: 'movimentacoes', colunas: ['investimentoId', 'tipo', 'data', 'ano', 'mes', 'valor', 'quantidade', 'preco', 'taxas', 'irrf', 'origemRecurso', 'contaId', 'foraDaPosicao', 'observacoes', 'origem', 'origemArquivo', 'situacao', 'financasId'], bool: ['foraDaPosicao'], indices: [['ano', 'mes'], ['investimentoId']] },
  fluxosConsolidados: { nome: 'fluxos_consolidados', colunas: ['ano', 'mes', 'aportesLiquidos', 'proventos', 'proventosSituacao', 'resultadoInformado', 'resultadoExcluiProventos', 'retornoInformado', 'ibov', 'ajuste', 'ajusteMotivo', 'origem', 'origemArquivo', 'financasIds', 'observacoes'], json: ['financasIds'], bool: ['resultadoExcluiProventos'], unico: ['ano', 'mes'] },
  contas: { nome: 'contas', colunas: ['nome', 'instituicao', 'tipo', 'financasNome', 'ativo', 'dataEncerramento', 'observacoes'], bool: ['ativo'] },
  saldosConta: { nome: 'saldos_conta', colunas: ['contaId', 'ano', 'mes', 'data', 'saldo', 'situacao', 'origem', 'observacoes'], unico: ['contaId', 'ano', 'mes'] },
  bens: { nome: 'bens', colunas: ['nome', 'categoria', 'dataAquisicao', 'valorAquisicao', 'percentualPropriedade', 'localizacao', 'area', 'marca', 'modelo', 'anoFabricacao', 'dividaId', 'situacao', 'dataVenda', 'valorVenda', 'observacoes'] },
  avaliacoesBem: { nome: 'avaliacoes_bem', colunas: ['bemId', 'data', 'valor', 'fonte', 'observacoes'] },
  dividas: { nome: 'dividas', colunas: ['nome', 'instituicao', 'tipo', 'dataInicio', 'vencimento', 'bemId', 'situacao', 'dataQuitacao', 'observacoes'] },
  saldosDivida: { nome: 'saldos_divida', colunas: ['dividaId', 'data', 'ano', 'mes', 'saldoDevedor', 'origem', 'observacoes'] },
  fechamentos: { nome: 'fechamentos', colunas: ['ano', 'mes', 'status', 'movimentacoesConfirmadas', 'observacoes', 'confirmadoEm'], bool: ['movimentacoesConfirmadas'], unico: ['ano', 'mes'] },
  alteracoes: { nome: 'alteracoes', colunas: ['data', 'entidade', 'entidadeId', 'descricao', 'antes', 'depois', 'motivo', 'periodosAfetados'], json: ['antes', 'depois', 'periodosAfetados'] },
  pendencias: { nome: 'pendencias', colunas: ['tipo', 'descricao', 'motivo', 'dados', 'origem', 'origemArquivo', 'resolvido'], json: ['dados'], bool: ['resolvido'] },
}
export type NomeTabela = keyof typeof TABELAS

const snake = (s: string): string => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())

for (const t of Object.values(TABELAS)) {
  const cols = t.colunas.map((c) => `${snake(c)} ${t.json?.includes(c) ? 'TEXT' : 'ANY'}`).join(', ')
  db.exec(`CREATE TABLE IF NOT EXISTS ${t.nome} (id TEXT PRIMARY KEY, ${cols}, criado_em TEXT NOT NULL, atualizado_em TEXT NOT NULL)`)
  if (t.unico) db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_${t.nome} ON ${t.nome}(${t.unico.map(snake).join(', ')})`)
  for (const ix of t.indices ?? []) db.exec(`CREATE INDEX IF NOT EXISTS ix_${t.nome}_${ix.join('_')} ON ${t.nome}(${ix.map(snake).join(', ')})`)
}
db.exec('CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT)')
// migração: colunas renomeadas (resultado/retorno informados na origem dos dados)
for (const [antigo, novo] of [['resultado_planilha', 'resultado_informado'], ['retorno_planilha', 'retorno_informado']]) {
  const cols = new Set((db.prepare('PRAGMA table_info(fluxos_consolidados)').all() as { name: string }[]).map((c) => c.name))
  if (cols.has(antigo) && !cols.has(novo)) db.exec(`ALTER TABLE fluxos_consolidados RENAME COLUMN ${antigo} TO ${novo}`)
}
// migração leve: colunas acrescentadas depois da criação da tabela
for (const t of Object.values(TABELAS)) {
  const existentes = new Set((db.prepare(`PRAGMA table_info(${t.nome})`).all() as { name: string }[]).map((c) => c.name))
  for (const c of t.colunas) if (!existentes.has(snake(c))) db.exec(`ALTER TABLE ${t.nome} ADD COLUMN ${snake(c)} ${t.json?.includes(c) ? 'TEXT' : 'ANY'}`)
}

type Row = Record<string, string | number | null | bigint | Uint8Array>
type Obj = Record<string, unknown>

export function newId(prefix = 'x'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function paraObj(t: Tabela, r: Row): Obj {
  const o: Obj = { id: r.id, criadoEm: r.criado_em, atualizadoEm: r.atualizado_em }
  for (const c of t.colunas) {
    let v: unknown = r[snake(c)]
    if (t.json?.includes(c)) v = v == null ? (c === 'nomesOriginais' || c === 'financasIds' || c === 'periodosAfetados' ? [] : null) : JSON.parse(v as string)
    else if (t.bool?.includes(c)) v = !!v
    else if (typeof v === 'bigint') v = Number(v)
    o[c] = v === undefined ? null : v
  }
  return o
}
function paraRow(t: Tabela, o: Obj): (string | number | null)[] {
  return t.colunas.map((c) => {
    const v = o[c]
    if (v === undefined || v === null) return null
    if (t.json?.includes(c)) return JSON.stringify(v)
    if (t.bool?.includes(c)) return v ? 1 : 0
    if (typeof v === 'number') return Number.isFinite(v) ? v : null
    return String(v)
  })
}

export function listar<T>(nome: NomeTabela, where?: string, params: (string | number)[] = []): T[] {
  const t = TABELAS[nome]
  return (db.prepare(`SELECT * FROM ${t.nome}${where ? ' WHERE ' + where : ''} ORDER BY rowid`).all(...params) as Row[]).map((r) => paraObj(t, r) as T)
}
export function obter<T>(nome: NomeTabela, id: string): T | null {
  const t = TABELAS[nome]
  const r = db.prepare(`SELECT * FROM ${t.nome} WHERE id = ?`).get(id) as Row | undefined
  return r ? (paraObj(t, r) as T) : null
}
/** Insere ou substitui (upsert por id). Preserva criado_em quando o registro já existe. */
/** Valor como gravado no SQLite (mesma conversão de paraRow), para comparar chaves. */
const valorSql = (v: unknown): string | number | null => (v == null ? null : typeof v === 'number' ? (Number.isFinite(v) ? v : null) : typeof v === 'boolean' ? (v ? 1 : 0) : String(v))

/** id do registro que já ocupa a chave natural do item (ex.: mesmo ativo e mês), se a tabela tiver uma. */
export function idPorChave(nome: NomeTabela, item: Obj): string | null {
  const t = TABELAS[nome]
  if (!t.unico) return null
  const r = db.prepare(`SELECT id FROM ${t.nome} WHERE ${t.unico.map((c) => `${snake(c)} IS ?`).join(' AND ')}`).get(...t.unico.map((c) => valorSql(item[c]))) as Row | undefined
  return r ? (r.id as string) : null
}

/**
 * Insere ou atualiza pelo id, preservando criado_em. Nunca apaga outro registro: se a chave natural
 * (ex.: ativo + mês) já pertence a OUTRO registro, uma edição é recusada; uma criação atualiza o registro existente.
 */
export function salvar<T = Obj>(nome: NomeTabela, item: Obj, opts: { prefixo?: string; criadoEm?: string } = {}): T {
  const t = TABELAS[nome]
  const now = new Date().toISOString()
  let id = (item.id as string) || newId(opts.prefixo ?? nome.slice(0, 3))
  let existente = db.prepare(`SELECT criado_em FROM ${t.nome} WHERE id = ?`).get(id) as Row | undefined
  const ocupante = idPorChave(nome, item)
  if (ocupante && ocupante !== id) {
    if (existente) throw new Error(`Já existe outro registro de ${nome} com ${t.unico!.join(' / ')} = ${t.unico!.map((c) => String(item[c] ?? '—')).join(' / ')}. Nada foi alterado.`)
    id = ocupante
    existente = db.prepare(`SELECT criado_em FROM ${t.nome} WHERE id = ?`).get(id) as Row | undefined
  }
  const criado = (existente?.criado_em as string) ?? opts.criadoEm ?? now
  const cols = ['id', ...t.colunas.map(snake), 'criado_em', 'atualizado_em']
  const atualizar = [...t.colunas.map(snake), 'atualizado_em'].map((c) => `${c} = excluded.${c}`).join(', ')
  db.prepare(`INSERT INTO ${t.nome} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${atualizar}`).run(id, ...paraRow(t, item), criado, now)
  return obter<T>(nome, id)!
}
export function excluir(nome: NomeTabela, id: string): boolean {
  return db.prepare(`DELETE FROM ${TABELAS[nome].nome} WHERE id = ?`).run(id).changes > 0
}
export function contar(nome: NomeTabela): number {
  return Number((db.prepare(`SELECT COUNT(*) AS n FROM ${TABELAS[nome].nome}`).get() as Row).n)
}
/** Cópia consistente do banco em `backups/` (VACUUM INTO). Devolve o caminho, ou null para banco em memória. */
export function copiaDeSeguranca(motivo: string): string | null {
  if (DB_PATH === ':memory:') return null
  const dir = path.join(DATA_DIR, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `patrimonio-${motivo}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
  return dest
}
let emTransacao = false
/** Executa `fn` numa transação (confirma ou desfaz tudo). Chamadas aninhadas participam da transação externa. */
export function transacao<T>(fn: () => T): T {
  if (emTransacao) return fn()
  db.exec('BEGIN')
  emTransacao = true
  try { const r = fn(); db.exec('COMMIT'); return r } catch (e) { db.exec('ROLLBACK'); throw e } finally { emTransacao = false }
}
export function getMeta(chave: string): string | null {
  const r = db.prepare('SELECT valor FROM meta WHERE chave = ?').get(chave) as Row | undefined
  return (r?.valor as string) ?? null
}
export function setMeta(chave: string, valor: string): void {
  db.prepare('INSERT INTO meta (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, valor)
}

export function registrarAlteracao(a: Omit<Alteracao, 'id' | 'data'>): void {
  salvar('alteracoes', { ...a, data: new Date().toISOString() }, { prefixo: 'alt' })
}

// ---------------------------------------------------------------- backup completo
export function gerarBackup(): Backup {
  const b = { versao: 2 as const, app: 'patrimonio' as const, geradoEm: new Date().toISOString() } as Backup
  for (const nome of Object.keys(TABELAS) as NomeTabela[]) (b as unknown as Obj)[nome] = listar(nome)
  return b
}

/** Restaura um backup. modo 'substituir' apaga tudo antes; 'mesclar' só insere ids inexistentes. */
export function restaurarBackup(b: Backup, modo: 'substituir' | 'mesclar'): Record<string, number> {
  if (b?.versao !== 2 || b.app !== 'patrimonio') throw new Error('Arquivo de backup inválido (esperado versão 2 do app Patrimônio).')
  const n: Record<string, number> = {}
  let conflitos = 0
  transacao(() => {
    if (modo === 'substituir') for (const t of Object.values(TABELAS)) db.exec(`DELETE FROM ${t.nome}`)
    for (const nome of Object.keys(TABELAS) as NomeTabela[]) {
      const itens = ((b as unknown as Obj)[nome] as Obj[] | undefined) ?? []
      n[nome] = 0
      for (const it of itens) {
        if (modo === 'mesclar' && obter(nome, it.id as string)) continue
        // mesclar só acrescenta: um registro do backup para um mês/ativo que já tem dado aqui é ignorado, nunca sobrescreve
        if (modo === 'mesclar' && idPorChave(nome, it)) { conflitos++; continue }
        salvar(nome, it, { criadoEm: it.criadoEm as string | undefined }); n[nome]++
      }
    }
  })
  if (conflitos) n['ignorados por já existirem (mesmo mês/ativo)'] = conflitos
  return n
}

