import type { Lancamento, TipoLancamento, Grupo } from '@fin-shared/types'

export interface Sugestao { categoria: string; subcategoria: string | null; grupo: Grupo | null; confianca: number; conta: string | null; formaPagamento: string | null }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').trim()
const tokens = (s: string) => norm(s).split(/\s+/).filter((t) => t.length >= 3)

/** Sugere categoria a partir do histórico: descrição igual > tokens em comum > mais frequente do tipo. */
export function sugerirCategoria(L: Lancamento[], descricao: string, tipo: TipoLancamento): Sugestao | null {
  const H = L.filter((l) => !l.foraDoFluxo && l.tipo === tipo && l.categoria)
  if (!H.length) return null
  const d = norm(descricao)
  const pick = (ls: Lancamento[], confianca: number): Sugestao | null => {
    if (!ls.length) return null
    const cont = new Map<string, { n: number; l: Lancamento }>()
    for (const l of ls) {
      const k = `${l.categoria}|${l.subcategoria ?? ''}`
      const c = cont.get(k) ?? { n: 0, l }
      c.n++; if (l.data > c.l.data) c.l = l
      cont.set(k, c)
    }
    const best = [...cont.values()].sort((a, b) => b.n - a.n)[0]
    return { categoria: best.l.categoria!, subcategoria: best.l.subcategoria, grupo: best.l.grupo, confianca, conta: best.l.conta, formaPagamento: best.l.formaPagamento }
  }
  if (d.length >= 3) {
    const exatos = H.filter((l) => norm(l.descricao) === d)
    const s1 = pick(exatos, 0.95)
    if (s1) return s1
    const tk = tokens(descricao)
    if (tk.length) {
      const scored = H.map((l) => {
        const lt = new Set(tokens(l.descricao))
        const hits = tk.filter((t) => lt.has(t) || norm(l.descricao).includes(t)).length
        return { l, score: hits / tk.length }
      }).filter((x) => x.score >= 0.5)
      const s2 = pick(scored.sort((a, b) => b.score - a.score).slice(0, 25).map((x) => x.l), 0.7)
      if (s2) return s2
    }
  }
  return null
}

/** Descrições mais usadas (para autocompletar). */
export function descricoesFrequentes(L: Lancamento[], tipo: TipoLancamento, prefixo: string, max = 8): string[] {
  const p = norm(prefixo)
  if (p.length < 2) return []
  const cont = new Map<string, number>()
  for (const l of L) {
    if (l.tipo !== tipo || l.foraDoFluxo) continue
    if (norm(l.descricao).startsWith(p) || norm(l.descricao).includes(` ${p}`)) cont.set(l.descricao, (cont.get(l.descricao) ?? 0) + 1)
  }
  return [...cont.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([d]) => d)
}
