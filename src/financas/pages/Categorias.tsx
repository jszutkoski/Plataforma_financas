import { useMemo, useState } from 'react'
import type { Categoria, TipoLancamento, Grupo } from '@fin-shared/types'
import { TIPOS, TIPO_LABEL, GRUPOS_DESPESA } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { fmtBRL } from '@fin/lib/format'
import { Card, Confirm, Vazio } from '@fin/components/ui'

export function Categorias() {
  const { categorias, lancamentos, contas, recarregar, aviso } = useStore()
  const [tipo, setTipo] = useState<TipoLancamento>('despesa')
  const [novaCat, setNovaCat] = useState(''); const [novoGrupo, setNovoGrupo] = useState<Grupo>('Variáveis')
  const [novaSub, setNovaSub] = useState<Record<number, string>>({})
  const [editando, setEditando] = useState<{ id: number; nome: string } | null>(null)
  const [excluir, setExcluir] = useState<Categoria | null>(null)
  const [novaConta, setNovaConta] = useState(''); const [tipoConta, setTipoConta] = useState('conta')

  const raizes = useMemo(() => categorias.filter((c) => c.parentId == null && c.tipo === tipo), [categorias, tipo])
  const uso = useMemo(() => {
    const m = new Map<string, { n: number; total: number }>()
    for (const l of lancamentos) {
      if (l.foraDoFluxo) continue
      for (const k of [`c|${l.tipo}|${l.categoria}`, `s|${l.tipo}|${l.categoria}|${l.subcategoria}`]) { const u = m.get(k) ?? { n: 0, total: 0 }; u.n++; u.total += l.valor; m.set(k, u) }
    }
    return m
  }, [lancamentos])

  const run = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); await recarregar(); if (ok) aviso(ok) } catch (e) { aviso((e as Error).message, 'erro') } }
  const mover = (lista: Categoria[], id: number, dir: -1 | 1) => {
    const ids = lista.map((c) => c.id); const i = ids.indexOf(id); const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    void run(() => api.reordenarCategorias(ids))
  }
  const salvarNome = () => {
    if (!editando) return
    const { id, nome } = editando
    setEditando(null)
    void (async () => {
      try {
        const r = await api.atualizarCategoria(id, { nome }) as { mesclada?: boolean }
        await recarregar()
        aviso(r.mesclada ? `Mesclada em "${nome}": lançamentos e subcategorias movidos para a categoria já existente.` : 'Categoria renomeada (lançamentos atualizados).')
      } catch (e) { aviso((e as Error).message, 'erro') }
    })()
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Categorias e contas</h1>
      <Card title="Categorias" subtitle="Renomear uma categoria atualiza todos os lançamentos vinculados. A ordem definida aqui é usada nos formulários.">
        <div className="flex flex-wrap gap-1 mb-3">{TIPOS.map((t) => <button key={t} onClick={() => setTipo(t)} className={`btn !py-1 !px-2.5 text-xs ${tipo === t ? 'bg-renda text-white' : 'bg-surface-2 text-ink-2'}`}>{TIPO_LABEL[t]}</button>)}</div>
        <form className="flex flex-wrap gap-2 mb-4" onSubmit={(e) => { e.preventDefault(); if (!novaCat.trim()) return; void run(() => api.criarCategoria({ nome: novaCat, tipo, grupo: tipo === 'despesa' ? novoGrupo : null }), 'Categoria criada.'); setNovaCat('') }}>
          <input className="input !w-64" placeholder="Nova categoria" value={novaCat} onChange={(e) => setNovaCat(e.target.value)} />
          {tipo === 'despesa' && <select className="input !w-40" value={novoGrupo} onChange={(e) => setNovoGrupo(e.target.value as Grupo)}>{GRUPOS_DESPESA.map((g) => <option key={g}>{g}</option>)}</select>}
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
        {!raizes.length ? <Vazio>Nenhuma categoria para {TIPO_LABEL[tipo]}.</Vazio> : (
          <ul className="space-y-2">
            {raizes.map((c) => {
              const subs = categorias.filter((s) => s.parentId === c.id)
              const u = uso.get(`c|${tipo}|${c.nome}`)
              return (
                <li key={c.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {editando?.id === c.id ? <input className="input !w-56" value={editando.nome} onChange={(e) => setEditando({ id: c.id, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') setEditando(null) }} onBlur={salvarNome} autoFocus /> : <span className="font-medium">{c.nome}</span>}
                    {c.grupo && tipo === 'despesa' && <select className="input !w-auto !py-0.5 text-xs" value={c.grupo} onChange={(e) => run(() => api.atualizarCategoria(c.id, { grupo: e.target.value }), 'Natureza atualizada.')} aria-label="Natureza">{GRUPOS_DESPESA.map((g) => <option key={g}>{g}</option>)}</select>}
                    {u && <span className="text-xs text-muted tnum">{u.n} lanç. · {fmtBRL(u.total)}</span>}
                    <span className="ml-auto flex gap-1">
                      <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => mover(raizes, c.id, -1)} aria-label="Subir">↑</button>
                      <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => mover(raizes, c.id, 1)} aria-label="Descer">↓</button>
                      <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setEditando({ id: c.id, nome: c.nome })}>Renomear</button>
                      <button className="btn-ghost !px-2 !py-0.5 text-xs text-bad" onClick={() => setExcluir(c)}>✕</button>
                    </span>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {subs.map((s) => {
                      const us = uso.get(`s|${tipo}|${c.nome}|${s.nome}`)
                      return (
                        <li key={s.id} className="chip gap-1.5 !py-1">
                          {editando?.id === s.id ? <input className="input !w-40 !py-0 text-xs" value={editando.nome} onChange={(e) => setEditando({ id: s.id, nome: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') salvarNome(); if (e.key === 'Escape') setEditando(null) }} onBlur={salvarNome} autoFocus /> : <span className="cursor-text" onDoubleClick={() => setEditando({ id: s.id, nome: s.nome })} title="Clique duas vezes para renomear">{s.nome}</span>}
                          {us && <span className="text-muted tnum">{us.n}</span>}
                          <button className="text-muted hover:text-ink" onClick={() => mover(subs, s.id, -1)} aria-label="Mover para a esquerda">‹</button>
                          <button className="text-muted hover:text-ink" onClick={() => mover(subs, s.id, 1)} aria-label="Mover para a direita">›</button>
                          <button className="text-muted hover:text-bad" onClick={() => setExcluir(s)} aria-label="Excluir subcategoria">✕</button>
                        </li>
                      )
                    })}
                    <li><form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); const n = (novaSub[c.id] ?? '').trim(); if (!n) return; void run(() => api.criarCategoria({ nome: n, tipo, grupo: c.grupo, parentId: c.id }), 'Subcategoria criada.'); setNovaSub((s) => ({ ...s, [c.id]: '' })) }}>
                      <input className="input !w-40 !py-0.5 text-xs" placeholder="+ subcategoria" value={novaSub[c.id] ?? ''} onChange={(e) => setNovaSub((s) => ({ ...s, [c.id]: e.target.value }))} /></form></li>
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
      <Card title="Contas e cartões" subtitle="Contas, carteiras e cartões usados como opção no cadastro de lançamentos.">
        <form className="flex flex-wrap gap-2 mb-3" onSubmit={(e) => { e.preventDefault(); if (!novaConta.trim()) return; void run(() => api.criarConta({ nome: novaConta, tipo: tipoConta }), 'Conta criada.'); setNovaConta('') }}>
          <input className="input !w-64" placeholder="Ex.: Nubank, Cartão Inter…" value={novaConta} onChange={(e) => setNovaConta(e.target.value)} />
          <select className="input !w-40" value={tipoConta} onChange={(e) => setTipoConta(e.target.value)}><option value="conta">Conta</option><option value="cartao">Cartão</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></select>
          <button className="btn-primary" type="submit">Adicionar</button>
        </form>
        {!contas.length ? <Vazio>Nenhuma conta cadastrada.</Vazio> : (
          <ul className="flex flex-wrap gap-2">{contas.map((c) => (
            <li key={c.id} className={`chip gap-2 !py-1 ${c.ativo ? '' : 'opacity-60'}`}>{c.nome} <span className="text-muted">{c.tipo}</span>
              <button className="text-muted hover:text-ink" onClick={() => run(() => api.atualizarConta(c.id, { ativo: !c.ativo }))}>{c.ativo ? 'desativar' : 'ativar'}</button>
              <button className="text-muted hover:text-bad" onClick={() => run(() => api.excluirConta(c.id), 'Conta excluída.')} aria-label="Excluir conta">✕</button></li>))}</ul>
        )}
      </Card>
      <Confirm aberto={!!excluir} titulo="Excluir categoria" perigoso confirmar="Excluir mesmo assim" onCancelar={() => setExcluir(null)}
        onConfirmar={() => { if (!excluir) return; void run(() => api.excluirCategoria(excluir.id, true), 'Categoria excluída.'); setExcluir(null) }}
        mensagem={(() => {
          if (!excluir) return null
          const pai = excluir.parentId == null ? null : categorias.find((c) => c.id === excluir.parentId)
          const n = (pai ? uso.get(`s|${excluir.tipo}|${pai.nome}|${excluir.nome}`) : uso.get(`c|${excluir.tipo}|${excluir.nome}`))?.n ?? 0
          return <>Excluir <strong>{excluir.nome}</strong>{excluir.parentId == null ? ' e suas subcategorias' : ''}?{' '}
            {n > 0 ? <><strong>{n} lançamento(s)</strong> usam esta {pai ? 'subcategoria' : 'categoria'} e continuarão com esse nome, que deixa de aparecer nas listas. Para levá-los a outra, cancele e use <em>Renomear</em> com o nome da categoria de destino (as duas são mescladas).</> : 'Nenhum lançamento a usa.'}</>
        })()} />
    </div>
  )
}
