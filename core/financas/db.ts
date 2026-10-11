import { DatabaseSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import type { Lancamento, LancamentoInput, Categoria, Conta, Recorrencia, TipoLancamento, Grupo, Projeto } from '../../shared/financas/types.ts'

/** Pasta base quando nenhum caminho é informado (no aplicativo, quem manda é a variável de ambiente). */
export const ROOT = process.cwd()
export const DB_PATH = process.env.FINANCAS_DB ?? path.join(ROOT, 'data', 'financas.db')
/** Backups e anexos ficam ao lado do banco, seja qual for a pasta escolhida pelo app. */
export const DATA_DIR = path.dirname(DB_PATH)

fs.mkdirSync(DATA_DIR, { recursive: true })
export const db = new DatabaseSync(DB_PATH)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

let emTransacao = false
/**
 * Executa `fn` numa transação: confirma no fim ou desfaz tudo se algo falhar. Nunca deixa a conexão
 * presa numa transação aberta (o que faria as gravações seguintes se perderem ao fechar o app).
 * Chamadas aninhadas participam da transação externa.
 */
export function transacao<T>(fn: () => T): T {
  if (emTransacao) return fn()
  db.exec('BEGIN')
  emTransacao = true
  try {
    const r = fn()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  } finally {
    emTransacao = false
  }
}

/** Cópia consistente do banco em `backups/` (VACUUM INTO). Devolve o caminho, ou null para banco em memória. */
export function copiaDeSeguranca(motivo: string): string | null {
  if (DB_PATH === ':memory:') return null
  const dir = path.join(DATA_DIR, 'backups')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, `financas-${motivo}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`)
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`)
  return dest
}

db.exec(`
CREATE TABLE IF NOT EXISTS lancamentos (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  ano INTEGER NOT NULL,
  mes INTEGER NOT NULL,
  descricao TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita','despesa','investimento','resgate','deducao')),
  valor REAL NOT NULL,
  grupo TEXT,
  categoria TEXT,
  subcategoria TEXT,
  conta TEXT,
  forma_pagamento TEXT,
  parcela INTEGER,
  total_parcelas INTEGER,
  observacoes TEXT,
  origem TEXT,
  origem_arquivo TEXT,
  dia_conhecido INTEGER NOT NULL DEFAULT 1,
  fora_do_fluxo INTEGER NOT NULL DEFAULT 0,
  ledger TEXT,
  recorrencia_id TEXT,
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_lanc_comp ON lancamentos(ano, mes);
CREATE INDEX IF NOT EXISTS idx_lanc_data ON lancamentos(data);
CREATE INDEX IF NOT EXISTS idx_lanc_tipo ON lancamentos(tipo);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  grupo TEXT,
  parent_id INTEGER REFERENCES categorias(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL DEFAULT 0,
  UNIQUE(nome, tipo, parent_id)
);

CREATE TABLE IF NOT EXISTS contas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'conta',
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS recorrencias (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  valor REAL NOT NULL,
  tipo TEXT NOT NULL,
  grupo TEXT,
  categoria TEXT,
  subcategoria TEXT,
  conta TEXT,
  forma_pagamento TEXT,
  dia INTEGER NOT NULL DEFAULT 1,
  inicio TEXT NOT NULL,
  fim TEXT,
  observacoes TEXT,
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS meta (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS projetos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  criado_em TEXT NOT NULL
);
`)

// migração: coluna de agrupamento de parcelas (bancos criados antes desta versão)
if (!(db.prepare("PRAGMA table_info(lancamentos)").all() as { name: string }[]).some((c) => c.name === 'parcelamento_id')) {
  db.exec('ALTER TABLE lancamentos ADD COLUMN parcelamento_id TEXT')
}

/** Garante um projeto para cada nome usado por custos fora do fluxo (ex.: custos vindos de uma importação). */
export function garantirProjetosDosRazoes() {
  db.prepare(`INSERT OR IGNORE INTO projetos (nome, descricao, criado_em)
    SELECT DISTINCT ledger, NULL, ? FROM lancamentos WHERE fora_do_fluxo = 1 AND ledger IS NOT NULL AND ledger <> ''`).run(new Date().toISOString())
}
garantirProjetosDosRazoes() // migração de bancos criados antes da tabela projetos

/**
 * Categorias raiz com o mesmo nome e tipo (o UNIQUE da tabela não as impedia, porque parent_id é NULL):
 * mescla na mais antiga — os lançamentos já apontam para o nome, então nada muda neles — e cria o índice
 * que impede novas duplicatas.
 */
function unificarCategoriasRaiz() {
  type Dup = { nome: string; tipo: string; manter: number }
  const dups = db.prepare('SELECT nome, tipo, MIN(id) AS manter FROM categorias WHERE parent_id IS NULL GROUP BY nome, tipo HAVING COUNT(*) > 1').all() as unknown as Dup[]
  transacao(() => {
    for (const d of dups) {
      for (const { id } of db.prepare('SELECT id FROM categorias WHERE parent_id IS NULL AND nome = ? AND tipo = ? AND id <> ?').all(d.nome, d.tipo, d.manter) as { id: number }[]) {
        for (const f of db.prepare('SELECT id, nome FROM categorias WHERE parent_id = ?').all(id) as { id: number; nome: string }[]) {
          if (db.prepare('SELECT 1 FROM categorias WHERE parent_id = ? AND nome = ?').get(d.manter, f.nome)) db.prepare('DELETE FROM categorias WHERE id = ?').run(f.id)
          else db.prepare('UPDATE categorias SET parent_id = ? WHERE id = ?').run(d.manter, f.id)
        }
        db.prepare('DELETE FROM categorias WHERE id = ?').run(id)
      }
    }
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_categorias_raiz ON categorias(nome, tipo) WHERE parent_id IS NULL')
  })
}
unificarCategoriasRaiz()

// ---------- helpers ----------
type Row = Record<string, string | number | null | bigint | Uint8Array>

export function rowToProjeto(r: Row): Projeto {
  return { id: Number(r.id), nome: r.nome as string, descricao: (r.descricao as string) ?? null, criadoEm: r.criado_em as string }
}
export function listarProjetos(): Projeto[] {
  return (db.prepare('SELECT * FROM projetos ORDER BY nome COLLATE NOCASE').all() as Row[]).map(rowToProjeto)
}

export function rowToLancamento(r: Row): Lancamento {
  return {
    id: r.id as string,
    data: r.data as string,
    ano: r.ano as number,
    mes: r.mes as number,
    descricao: r.descricao as string,
    tipo: r.tipo as TipoLancamento,
    valor: r.valor as number,
    grupo: (r.grupo as Grupo) ?? null,
    categoria: (r.categoria as string) ?? null,
    subcategoria: (r.subcategoria as string) ?? null,
    conta: (r.conta as string) ?? null,
    formaPagamento: (r.forma_pagamento as string) ?? null,
    parcela: (r.parcela as number) ?? null,
    totalParcelas: (r.total_parcelas as number) ?? null,
    observacoes: (r.observacoes as string) ?? null,
    origem: (r.origem as string) ?? null,
    origemArquivo: (r.origem_arquivo as string) ?? null,
    diaConhecido: !!r.dia_conhecido,
    foraDoFluxo: !!r.fora_do_fluxo,
    ledger: (r.ledger as string) ?? null,
    recorrenciaId: (r.recorrencia_id as string) ?? null,
    parcelamentoId: (r.parcelamento_id as string) ?? null,
    criadoEm: r.criado_em as string,
    atualizadoEm: r.atualizado_em as string,
  }
}

export function newId(prefix = 'l'): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function dataValida(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function validarLancamento(input: Partial<LancamentoInput>): string[] {
  const erros: string[] = []
  if (!input.data || !ISO_DATE.test(input.data) || !dataValida(input.data)) erros.push('Data inválida (use AAAA-MM-DD).')
  if (!input.descricao || !String(input.descricao).trim()) erros.push('Descrição obrigatória.')
  if (!['receita', 'despesa', 'investimento', 'resgate', 'deducao'].includes(input.tipo as string)) erros.push('Tipo inválido.')
  // despesa negativa = estorno/reembolso (abate o gasto); os demais tipos são sempre positivos
  if (typeof input.valor !== 'number' || !Number.isFinite(input.valor) || input.valor === 0 || (input.valor < 0 && input.tipo !== 'despesa'))
    erros.push(input.tipo === 'despesa' ? 'Valor deve ser diferente de zero (negativo para estorno).' : 'Valor deve ser um número maior que zero.')
  if (input.parcela != null && input.totalParcelas != null && input.parcela > input.totalParcelas) erros.push('Número da parcela maior que o total de parcelas.')
  return erros
}

const insertLanc = db.prepare(`INSERT INTO lancamentos
 (id, data, ano, mes, descricao, tipo, valor, grupo, categoria, subcategoria, conta, forma_pagamento, parcela, total_parcelas,
  observacoes, origem, origem_arquivo, dia_conhecido, fora_do_fluxo, ledger, recorrencia_id, parcelamento_id, criado_em, atualizado_em)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)

const GRUPOS_DE_DESPESA: Grupo[] = ['Fixas', 'Variáveis', 'Extras', 'Adicionais']

/**
 * Natureza do lançamento. Receitas, deduções e investimentos têm a natureza do próprio tipo (um grupo
 * de despesa herdado de uma edição anterior é ignorado). Despesas usam a natureza informada se for válida;
 * senão a da categoria na árvore; senão "Variáveis".
 */
export function grupoPadrao(tipo: TipoLancamento, grupo?: Grupo | null, categoria?: string | null): Grupo | null {
  if (tipo === 'receita') return 'Receita'
  if (tipo === 'deducao') return 'Dedução'
  if (tipo === 'investimento' || tipo === 'resgate') return 'Investimentos'
  if (grupo && GRUPOS_DE_DESPESA.includes(grupo)) return grupo
  if (categoria) {
    const c = db.prepare("SELECT grupo FROM categorias WHERE nome = ? AND tipo = 'despesa' AND parent_id IS NULL").get(categoria) as Row | undefined
    if (c?.grupo && GRUPOS_DE_DESPESA.includes(c.grupo as Grupo)) return c.grupo as Grupo
  }
  return 'Variáveis'
}

export function inserirLancamento(input: LancamentoInput, opts: { criadoEm?: string } = {}): Lancamento {
  const now = new Date().toISOString()
  const id = input.id ?? newId()
  const ano = input.ano ?? Number(input.data.slice(0, 4))
  const mes = input.mes ?? Number(input.data.slice(5, 7))
  const grupo = input.foraDoFluxo ? 'Fora do fluxo' : grupoPadrao(input.tipo, input.grupo, input.categoria)
  insertLanc.run(
    id, input.data, ano, mes, input.descricao.trim(), input.tipo, Math.round(input.valor * 100) / 100, grupo,
    input.categoria ?? null, input.subcategoria ?? null, input.conta ?? null, input.formaPagamento ?? null,
    input.parcela ?? null, input.totalParcelas ?? null, input.observacoes ?? null, input.origem ?? 'manual',
    input.origemArquivo ?? null, input.diaConhecido === false ? 0 : 1, input.foraDoFluxo ? 1 : 0, input.ledger ?? null,
    input.recorrenciaId ?? null, input.parcelamentoId ?? null, opts.criadoEm ?? now, now,
  )
  return rowToLancamento(db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id) as Row)
}

export function atualizarLancamento(id: string, input: LancamentoInput): Lancamento | null {
  const existente = db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id) as Row | undefined
  if (!existente) return null
  const now = new Date().toISOString()
  const ano = input.ano ?? Number(input.data.slice(0, 4))
  const mes = input.mes ?? Number(input.data.slice(5, 7))
  const grupo = input.foraDoFluxo ? 'Fora do fluxo' : grupoPadrao(input.tipo, input.grupo, input.categoria)
  db.prepare(`UPDATE lancamentos SET data=?, ano=?, mes=?, descricao=?, tipo=?, valor=?, grupo=?, categoria=?, subcategoria=?, conta=?,
    forma_pagamento=?, parcela=?, total_parcelas=?, observacoes=?, dia_conhecido=?, fora_do_fluxo=?, ledger=?, parcelamento_id=?, atualizado_em=? WHERE id=?`).run(
    input.data, ano, mes, input.descricao.trim(), input.tipo, Math.round(input.valor * 100) / 100, grupo, input.categoria ?? null,
    input.subcategoria ?? null, input.conta ?? null, input.formaPagamento ?? null, input.parcela ?? null, input.totalParcelas ?? null,
    input.observacoes ?? null, input.diaConhecido === false ? 0 : 1, input.foraDoFluxo ? 1 : 0, input.ledger ?? null,
    input.parcelamentoId ?? (existente.parcelamento_id as string | null) ?? null, now, id,
  )
  return rowToLancamento(db.prepare('SELECT * FROM lancamentos WHERE id = ?').get(id) as Row)
}

/**
 * Gera (ou regenera) as parcelas de uma compra parcelada: o valor total é dividido igualmente,
 * com o resto de centavos na última parcela; uma parcela por mês a partir da data inicial.
 * Se `parcelamentoId` já existir, as parcelas anteriores desse grupo são substituídas.
 */
export function gerarParcelamento(base: LancamentoInput, valorTotal: number, totalParcelas: number, dataInicio: string, parcelamentoId?: string | null): { parcelamentoId: string; criados: number } {
  const pid = parcelamentoId ?? newId('parc')
  const centavos = Math.round(valorTotal * 100)
  const porParcela = Math.floor(centavos / totalParcelas)
  const resto = centavos - porParcela * totalParcelas
  const [y, m, d] = dataInicio.split('-').map(Number)
  transacao(() => {
    if (parcelamentoId) db.prepare('DELETE FROM lancamentos WHERE parcelamento_id = ?').run(parcelamentoId)
    for (let p = 1; p <= totalParcelas; p++) {
      const dt = new Date(y, m - 1 + (p - 1), 1)
      const ultimo = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
      const data = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`
      const valor = (porParcela + (p === totalParcelas ? resto : 0)) / 100
      inserirLancamento({ ...base, id: undefined, data, ano: undefined, mes: undefined, valor, parcela: p, totalParcelas, parcelamentoId: pid, origem: base.origem ?? 'manual' })
    }
  })
  return { parcelamentoId: pid, criados: totalParcelas }
}

export function listarLancamentos(): Lancamento[] {
  return (db.prepare('SELECT * FROM lancamentos ORDER BY data, criado_em').all() as Row[]).map(rowToLancamento)
}

// ---------- categorias / contas / recorrências ----------
export function rowToCategoria(r: Row): Categoria {
  return { id: r.id as number, nome: r.nome as string, tipo: r.tipo as TipoLancamento, grupo: (r.grupo as Grupo) ?? null, parentId: (r.parent_id as number) ?? null, ordem: r.ordem as number }
}
export function listarCategorias(): Categoria[] {
  return (db.prepare('SELECT * FROM categorias ORDER BY parent_id IS NOT NULL, ordem, nome').all() as Row[]).map(rowToCategoria)
}
export function rowToConta(r: Row): Conta {
  return { id: r.id as number, nome: r.nome as string, tipo: r.tipo as Conta['tipo'], ativo: !!r.ativo }
}
export function listarContas(): Conta[] {
  return (db.prepare('SELECT * FROM contas ORDER BY nome').all() as Row[]).map(rowToConta)
}
export function rowToRecorrencia(r: Row): Recorrencia {
  return {
    id: r.id as string, descricao: r.descricao as string, valor: r.valor as number, tipo: r.tipo as TipoLancamento,
    grupo: (r.grupo as Grupo) ?? null, categoria: (r.categoria as string) ?? null, subcategoria: (r.subcategoria as string) ?? null,
    conta: (r.conta as string) ?? null, formaPagamento: (r.forma_pagamento as string) ?? null, dia: r.dia as number,
    inicio: r.inicio as string, fim: (r.fim as string) ?? null, observacoes: (r.observacoes as string) ?? null, ativo: !!r.ativo,
  }
}
export function listarRecorrencias(): Recorrencia[] {
  return (db.prepare('SELECT * FROM recorrencias ORDER BY dia, descricao').all() as Row[]).map(rowToRecorrencia)
}

/** Garante que a árvore de categorias contenha (tipo, grupo, categoria, subcategoria). */
export function garantirCategoria(tipo: TipoLancamento, grupo: Grupo | null, categoria: string | null, subcategoria: string | null): void {
  if (!categoria) return
  const sel = db.prepare('SELECT id FROM categorias WHERE nome = ? AND tipo = ? AND parent_id IS NULL')
  let cat = sel.get(categoria, tipo) as Row | undefined
  if (!cat) {
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0)+1 AS o FROM categorias WHERE parent_id IS NULL').get() as Row).o as number
    db.prepare('INSERT INTO categorias (nome, tipo, grupo, parent_id, ordem) VALUES (?,?,?,NULL,?)').run(categoria, tipo, grupo, ordem)
    cat = sel.get(categoria, tipo) as Row
  }
  if (!subcategoria) return
  const selSub = db.prepare('SELECT id FROM categorias WHERE nome = ? AND tipo = ? AND parent_id = ?')
  if (!selSub.get(subcategoria, tipo, cat.id as number)) {
    const ordem = (db.prepare('SELECT COALESCE(MAX(ordem),0)+1 AS o FROM categorias WHERE parent_id = ?').get(cat.id as number) as Row).o as number
    db.prepare('INSERT INTO categorias (nome, tipo, grupo, parent_id, ordem) VALUES (?,?,?,?,?)').run(subcategoria, tipo, grupo, cat.id as number, ordem)
  }
}

export function getMeta(chave: string): string | null {
  const r = db.prepare('SELECT valor FROM meta WHERE chave = ?').get(chave) as Row | undefined
  return (r?.valor as string) ?? null
}
export function setMeta(chave: string, valor: string): void {
  db.prepare('INSERT INTO meta (chave, valor) VALUES (?,?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, valor)
}

// ---------- primeira execução ----------
/** Categorias sugeridas em um banco novo. São apenas um ponto de partida: podem ser renomeadas, removidas ou ampliadas. */
const CATEGORIAS_PADRAO: { tipo: TipoLancamento; grupo: Grupo | null; nome: string; subs: string[] }[] = [
  { tipo: 'receita', grupo: 'Receita', nome: 'Salário', subs: ['Salário', '13º salário', 'Férias'] },
  { tipo: 'receita', grupo: 'Receita', nome: 'Outras receitas', subs: ['Reembolsos', 'Vendas', 'Rendimentos'] },
  { tipo: 'deducao', grupo: 'Dedução', nome: 'Descontos', subs: ['INSS', 'Imposto de renda', 'Plano de saúde'] },
  { tipo: 'despesa', grupo: 'Fixas', nome: 'Moradia', subs: ['Aluguel/Financiamento', 'Condomínio', 'Energia', 'Água', 'Gás', 'Internet'] },
  { tipo: 'despesa', grupo: 'Fixas', nome: 'Assinaturas', subs: ['Streaming', 'Telefonia', 'Aplicativos'] },
  { tipo: 'despesa', grupo: 'Fixas', nome: 'Educação', subs: ['Mensalidade', 'Cursos', 'Material'] },
  { tipo: 'despesa', grupo: 'Variáveis', nome: 'Alimentação', subs: ['Supermercado', 'Restaurantes', 'Delivery'] },
  { tipo: 'despesa', grupo: 'Variáveis', nome: 'Transporte', subs: ['Combustível', 'Transporte público', 'Aplicativos', 'Manutenção'] },
  { tipo: 'despesa', grupo: 'Variáveis', nome: 'Saúde', subs: ['Consultas', 'Farmácia', 'Exames'] },
  { tipo: 'despesa', grupo: 'Variáveis', nome: 'Casa', subs: ['Manutenção', 'Limpeza', 'Utensílios'] },
  { tipo: 'despesa', grupo: 'Adicionais', nome: 'Lazer', subs: ['Viagens', 'Passeios', 'Restaurantes/bares'] },
  { tipo: 'despesa', grupo: 'Adicionais', nome: 'Vestuário', subs: [] },
  { tipo: 'despesa', grupo: 'Adicionais', nome: 'Outros', subs: [] },
  { tipo: 'investimento', grupo: 'Investimentos', nome: 'Aportes', subs: ['Reserva de emergência', 'Renda fixa', 'Renda variável', 'Previdência'] },
  { tipo: 'resgate', grupo: 'Investimentos', nome: 'Resgates', subs: [] },
]

/** Em um banco recém-criado (sem categorias), cria o conjunto inicial. Nunca mexe em bancos que já têm dados. */
export function prepararBancoNovo(): { categorias: number } {
  const n = (db.prepare('SELECT COUNT(*) AS n FROM categorias').get() as Row).n as number
  if (n > 0) return { categorias: 0 }
  let criadas = 0
  transacao(() => {
    for (const c of CATEGORIAS_PADRAO) {
      garantirCategoria(c.tipo, c.grupo, c.nome, null); criadas++
      for (const s of c.subs) { garantirCategoria(c.tipo, c.grupo, c.nome, s); criadas++ }
    }
    setMeta('criado_em', new Date().toISOString())
  })
  return { categorias: criadas }
}
