import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore as useFin } from '@fin/lib/store'
import { useStore as usePat } from '@pat/lib/store'
import { buscar, type Resultado } from '@app/lib/busca'
import { fmtBRL, fmtData } from '@fin/lib/format'

/** Busca em tudo (Ctrl+K): lançamentos de todos os anos, categorias, investimentos e telas. */
export function BuscaGlobal({ aberta, onFechar, telas }: { aberta: boolean; onFechar: () => void; telas: { rotulo: string; to: string; secao: string }[] }) {
  const fin = useFin()
  const pat = usePat()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const lista = useRef<HTMLUListElement>(null)
  // espera o usuário parar de digitar um instante: são milhares de lançamentos
  const [termo, setTermo] = useState('')
  useEffect(() => { const t = window.setTimeout(() => setTermo(q), 120); return () => window.clearTimeout(t) }, [q])
  useEffect(() => { if (aberta) { setQ(''); setTermo(''); setSel(0) } }, [aberta])

  const r = useMemo(() => buscar(termo, { telas, lancamentos: fin.lancamentos, categorias: fin.categorias, investimentos: pat.base.investimentos }), [termo, telas, fin.lancamentos, fin.categorias, pat.base.investimentos])
  const itens: Resultado[] = useMemo(() => (r.totalLancamentos > 40
    ? [...r.itens, { grupo: 'Lançamentos', titulo: `Ver todos os ${r.totalLancamentos} lançamentos em Lançamentos`, destino: `/financas/lancamentos?${new URLSearchParams({ q: termo })}` }]
    : r.itens), [r, termo])
  useEffect(() => setSel(0), [termo])
  useEffect(() => { lista.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' }) }, [sel])

  const ir = (it: Resultado) => { onFechar(); nav(it.destino) }
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, itens.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)) }
    else if (e.key === 'Enter' && itens[sel]) { e.preventDefault(); ir(itens[sel]) }
    else if (e.key === 'Escape') onFechar()
  }
  if (!aberta) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div role="dialog" aria-modal="true" aria-label="Buscar" className="card w-full max-w-2xl overflow-hidden flex flex-col max-h-[70vh]">
        <div className="flex items-center gap-2 px-4 border-b" style={{ borderColor: 'var(--border)' }}>
          <span aria-hidden className="text-muted">⌕</span>
          <input autoFocus className="flex-1 bg-transparent py-3 text-base outline-none" placeholder="Buscar lançamentos, categorias, investimentos, telas… (ex.: unimed, 1.234,56)" value={q}
            onChange={(e) => setQ(e.target.value)} onKeyDown={teclas} aria-controls="busca-resultados" aria-activedescendant={itens[sel] ? `busca-${sel}` : undefined} />
          <kbd className="text-[10px] text-muted border rounded px-1.5 py-0.5" style={{ borderColor: 'var(--border)' }}>Esc</kbd>
        </div>
        <ul id="busca-resultados" ref={lista} role="listbox" className="overflow-y-auto py-1">
          {!termo.trim() ? <li className="px-4 py-6 text-sm text-muted text-center">Digite para buscar em todos os anos. ↑ ↓ para escolher, Enter para abrir.</li>
            : !itens.length ? <li className="px-4 py-6 text-sm text-muted text-center">Nada encontrado para “{termo}”.</li>
            : itens.map((it, i) => (
              <li key={`${it.grupo}-${i}`}>
                {(i === 0 || itens[i - 1].grupo !== it.grupo) && <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{it.grupo}{it.grupo === 'Lançamentos' && r.totalLancamentos ? ` (${r.totalLancamentos})` : ''}</div>}
                <div id={`busca-${i}`} data-i={i} role="option" aria-selected={sel === i} onMouseEnter={() => setSel(i)} onClick={() => ir(it)}
                  className={`mx-1 px-3 py-1.5 rounded-md flex items-center gap-3 cursor-pointer text-sm ${sel === i ? 'bg-renda/12' : ''}`}>
                  {it.data && <span className="text-xs text-muted tnum w-20 shrink-0">{fmtData(it.data)}</span>}
                  <span className="flex-1 min-w-0 truncate">{it.titulo}{it.detalhe && <span className="text-muted"> · {it.detalhe}</span>}</span>
                  {it.valor != null && <span className={`tnum shrink-0 ${it.valor > 0 ? 'text-good' : ''} ${pat.oculto ? 'oculto' : ''}`}>{fmtBRL(it.valor)}</span>}
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
