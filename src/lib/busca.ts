import type { Lancamento, Categoria } from '@fin-shared/types'
import type { Investimento } from '@pat-shared/types'

export interface Resultado {
  grupo: 'Telas' | 'Lançamentos' | 'Categorias' | 'Investimentos'
  titulo: string
  detalhe?: string
  valor?: number
  data?: string
  destino: string
}

/** minúsculas e sem acento: "Saúde" casa com "saude" */
export const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** "1.234,56", "1234.56" ou "120" → número; texto comum → null */
function valorDaBusca(q: string): number | null {
  const t = q.trim().replace(/^r\$\s*/i, '')
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/.test(t)) return null
  const n = Number(/,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/**
 * Busca em telas, categorias, investimentos e lançamentos de todos os anos.
 * Cada palavra precisa aparecer (em qualquer campo); um número também casa com o valor exato.
 */
export function buscar(q: string, fontes: { telas: { rotulo: string; to: string; secao: string }[]; lancamentos: Lancamento[]; categorias: Categoria[]; investimentos: Investimento[] }, limite = 40): { itens: Resultado[]; totalLancamentos: number } {
  const palavras = normalizar(q).split(/\s+/).filter(Boolean)
  if (!palavras.length) return { itens: [], totalLancamentos: 0 }
  const casa = (texto: string) => { const t = normalizar(texto); return palavras.every((p) => t.includes(p)) }
  const valor = valorDaBusca(q)
  const out: Resultado[] = []

  for (const t of fontes.telas) if (casa(`${t.secao} ${t.rotulo}`)) out.push({ grupo: 'Telas', titulo: t.rotulo, detalhe: t.secao, destino: t.to })

  const porId = new Map(fontes.categorias.map((c) => [c.id, c]))
  for (const c of fontes.categorias) {
    const pai = c.parentId != null ? porId.get(c.parentId) : null
    const nome = pai ? `${pai.nome} › ${c.nome}` : c.nome
    if (!casa(nome)) continue
    const cat = pai?.nome ?? c.nome
    const sub = pai ? c.nome : null
    const destino = c.tipo === 'despesa'
      ? `/financas/tendencias?${new URLSearchParams(sub ? { cat, sub } : { cat })}`
      : `/financas/lancamentos?${new URLSearchParams(sub ? { cat, sub } : { cat })}`
    out.push({ grupo: 'Categorias', titulo: nome, detalhe: c.tipo === 'despesa' ? 'ver tendência' : 'ver lançamentos', destino })
  }

  for (const i of fontes.investimentos) if (casa(`${i.nome} ${i.codigo ?? ''} ${i.instituicao ?? ''}`)) {
    out.push({ grupo: 'Investimentos', titulo: i.nome, detalhe: [i.instituicao, i.situacao !== 'ativo' ? i.situacao : null].filter(Boolean).join(' · '), destino: `/patrimonio/investimentos?id=${encodeURIComponent(i.id)}` })
  }

  const lanc = fontes.lancamentos.filter((l) => (valor != null && Math.abs(Math.abs(l.valor) - valor) < 0.005)
    || casa(`${l.descricao} ${l.categoria ?? ''} ${l.subcategoria ?? ''} ${l.observacoes ?? ''} ${l.conta ?? ''} ${l.ledger ?? ''}`))
    .sort((a, b) => b.data.localeCompare(a.data))
  for (const l of lanc.slice(0, limite)) {
    out.push({
      grupo: 'Lançamentos', titulo: l.descricao, valor: l.tipo === 'despesa' || l.tipo === 'investimento' || l.tipo === 'deducao' ? -l.valor : l.valor, data: l.data,
      detalhe: l.foraDoFluxo ? `projeto ${l.ledger ?? ''}`.trim() : [l.categoria, l.subcategoria].filter(Boolean).join(' › '),
      destino: l.foraDoFluxo ? '/financas/projetos' : `/financas/lancamentos?id=${encodeURIComponent(l.id)}`,
    })
  }
  return { itens: out, totalLancamentos: lanc.length }
}
