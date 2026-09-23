import { useEffect, useRef, type ReactNode } from 'react'
import { fmtBRL, fmtPct2, fmtSinal } from '@pat/lib/format'
import { useStore } from '@pat/lib/store'

export function Card({ title, subtitle, children, className = '', actions }: { title?: string; subtitle?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`card p-4 ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-2 mb-3">
          <div>
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}

/** Valor monetário que respeita o modo "ocultar valores". */
export function Valor({ v, sinal, vazio = '—', className = '' }: { v: number | null | undefined; sinal?: boolean; vazio?: string; className?: string }) {
  const { oculto } = useStore()
  if (v == null) return <span className={`text-muted ${className}`}>{vazio}</span>
  return <span className={`tnum whitespace-nowrap ${oculto ? "oculto" : ""} ${className}`}>{sinal ? fmtSinal(v) : fmtBRL(v)}</span>
}

export function Kpi({ rotulo, valor, sub, cor, delta, deltaRotulo, vazio, children }: { rotulo: string; valor: number | null | undefined; sub?: ReactNode; cor?: string; delta?: number | null; deltaRotulo?: string; vazio?: string; children?: ReactNode }) {
  const bom = delta == null ? null : delta >= 0
  return (
    <div className="card p-4 min-w-0">
      <div className="flex items-center gap-2 text-xs text-ink-2">
        {cor && <span className="inline-block w-2 h-2 rounded-full" style={{ background: cor }} aria-hidden />}
        {rotulo}
      </div>
      <div className={`${valor == null ? 'text-sm text-muted' : 'text-xl'} font-semibold mt-1 truncate`}><Valor v={valor} vazio={vazio ?? 'sem registro'} /></div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
      {delta != null && Number.isFinite(delta) && (
        <div className={`text-xs mt-1 ${bom ? 'text-good' : 'text-bad'}`}>{bom ? '▲' : '▼'} {fmtPct2(delta)} {deltaRotulo && <span className="text-muted">{deltaRotulo}</span>}</div>
      )}
      {children}
    </div>
  )
}

export function Modal({ aberto, titulo, onFechar, children, largura = 'max-w-2xl' }: { aberto: boolean; titulo: string; onFechar: () => void; children: ReactNode; largura?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [aberto, onFechar])
  if (!aberto) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={titulo} className={`card w-full ${largura} max-h-[95vh] overflow-y-auto rounded-b-none sm:rounded-b-xl`}>
        <header className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-surface z-10" style={{ borderColor: 'var(--border)' }}>
          <h2 className="font-semibold">{titulo}</h2>
          <button className="btn-ghost !px-2 !py-1" onClick={onFechar} aria-label="Fechar">✕</button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Confirm({ aberto, titulo, mensagem, confirmar = 'Confirmar', perigoso, onConfirmar, onCancelar }: { aberto: boolean; titulo: string; mensagem: ReactNode; confirmar?: string; perigoso?: boolean; onConfirmar: () => void; onCancelar: () => void }) {
  return (
    <Modal aberto={aberto} titulo={titulo} onFechar={onCancelar} largura="max-w-md">
      <div className="text-sm text-ink-2">{mensagem}</div>
      <div className="flex justify-end gap-2 mt-4">
        <button className="btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className={perigoso ? 'btn-danger' : 'btn-primary'} onClick={onConfirmar} autoFocus>{confirmar}</button>
      </div>
    </Modal>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted py-8 text-center">{children}</div>
}

export function Toast({ toast }: { toast: { msg: string; tipo: 'ok' | 'erro' } | null }) {
  if (!toast) return null
  return <div role="status" className={`fixed bottom-20 sm:bottom-4 right-4 z-[60] rounded-lg px-4 py-2 text-sm text-white shadow-lg max-w-md ${toast.tipo === 'erro' ? 'bg-bad' : 'bg-good'}`}>{toast.msg}</div>
}

export function Campo({ rotulo, children, className = '', dica }: { rotulo: string; children: ReactNode; className?: string; dica?: string }) {
  return <label className={`block ${className}`}><span className="label">{rotulo}{dica && <span className="text-muted font-normal"> · {dica}</span>}</span>{children}</label>
}

const TAGS: Record<string, string> = {
  confirmada: 'tag-ok', informada: '', estimada: 'tag-warn', pendente: 'tag-bad', sem_avaliacao: 'tag-warn', encerrado: 'text-muted',
  completo: 'tag-ok', parcial: 'tag-warn', sem_registros: 'text-muted', ativo: 'tag-ok', revisar: 'tag-bad', rascunho: 'tag-warn', confirmado: 'tag-ok',
  informado: '', estimado: 'tag-warn',
}
const ROTULOS: Record<string, string> = {
  confirmada: 'confirmada', informada: 'informada', estimada: 'estimada', pendente: 'pendente', sem_avaliacao: 'sem avaliação', encerrado: 'encerrado',
  completo: 'completo', parcial: 'parcial', sem_registros: 'sem registros', ativo: 'ativo', revisar: 'revisar', rascunho: 'rascunho', confirmado: 'confirmado',
  informado: 'informado', estimado: 'estimado',
}
export function Tag({ s, title }: { s: string; title?: string }) {
  return <span className={`chip ${TAGS[s] ?? ''}`} title={title}>{ROTULOS[s] ?? s}</span>
}

export function Aviso({ children, tipo = 'info' }: { children: ReactNode; tipo?: 'info' | 'alerta' }) {
  return <div className={`card p-3 text-xs ${tipo === 'alerta' ? 'text-resgate' : 'text-ink-2'}`} style={{ borderColor: tipo === 'alerta' ? 'var(--resgate)' : undefined }}>{children}</div>
}
