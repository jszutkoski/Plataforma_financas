import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { Lancamento, TipoLancamento } from '@fin-shared/types'
import { TIPOS, TIPO_LABEL } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { usePeriodo } from '@fin/lib/periodo'
import { api } from '@fin/lib/api'
import { fmtBRL, fmtData, hojeISO } from '@fin/lib/format'
import { lancamentosParaCSV, baixarArquivo } from '@fin/lib/csv'
import { Campo, Card, Confirm, Modal, Vazio } from '@fin/components/ui'
import { LancamentoForm } from '@fin/components/LancamentoForm'

const COR_TIPO: Record<TipoLancamento, string> = { receita: 'var(--renda)', despesa: 'var(--gastos)', investimento: 'var(--invest)', resgate: 'var(--resgate)', deducao: 'var(--muted)' }

export function Lancamentos() {
  const { lancamentos, categorias, recarregar, aviso } = useStore()
  const p = usePeriodo()
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState('')
  const [tipo, setTipo] = useState<string>('')
  const [cat, setCat] = useState('')
  const [sub, setSub] = useState('')
  const [periodo, setPeriodo] = useState<'mes' | 'ano' | 'tudo' | 'intervalo'>('mes')
  const [de, setDe] = useState(''); const [ate, setAte] = useState('')
  const [editar, setEditar] = useState<Lancamento | null>(null)
  const [novo, setNovo] = useState(false)
  const [excluir, setExcluir] = useState<Lancamento | null>(null)
  const [pagina, setPagina] = useState(0)
  const POR_PAG = 100
  // seleção para edição em lote
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [lote, setLote] = useState<{ categoria: string; subcategoria: string } | null>(null)

  useEffect(() => {
    const id = params.get('id')
    if (!id) return
    const l = lancamentos.find((x) => x.id === id)
    if (l) { setEditar(l); setParams({}, { replace: true }) }
  }, [params, lancamentos, setParams])

  const filtrados = useMemo(() => {
    const qn = q.trim().toLowerCase()
    return lancamentos.filter((l) => {
      if (l.foraDoFluxo) return false
      if (periodo === 'mes' && (l.ano !== p.ano || l.mes !== p.mes)) return false
      if (periodo === 'ano' && l.ano !== p.ano) return false
      if (periodo === 'intervalo' && ((de && l.data < de) || (ate && l.data > ate))) return false
      if (tipo && l.tipo !== tipo) return false
      if (cat && l.categoria !== cat) return false
      if (sub && l.subcategoria !== sub) return false
      if (qn && !`${l.descricao} ${l.categoria ?? ''} ${l.subcategoria ?? ''} ${l.observacoes ?? ''}`.toLowerCase().includes(qn)) return false
      return true
    }).sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm))
  }, [lancamentos, q, tipo, cat, sub, periodo, de, ate, p.ano, p.mes])

  useEffect(() => { setPagina(0); setSel(new Set()) }, [q, tipo, cat, sub, periodo, de, ate, p.ano, p.mes])

  const totais = useMemo(() => {
    const t = { receita: 0, despesa: 0, investimento: 0, resgate: 0, deducao: 0 }
    for (const l of filtrados) t[l.tipo] += l.valor
    return t
  }, [filtrados])

  const duplicar = async (l: Lancamento) => {
    try { await api.duplicarLancamento(l.id, hojeISO()); await recarregar(); aviso('Lançamento duplicado com a data de hoje.') } catch (e) { aviso((e as Error).message, 'erro') }
  }
  const confirmarExclusao = async () => {
    if (!excluir) return
    try { await api.excluirLancamento(excluir.id); await recarregar(); aviso('Lançamento excluído.') } catch (e) { aviso((e as Error).message, 'erro') }
    setExcluir(null)
  }
  const exportar = () => baixarArquivo(`lancamentos-${periodo === 'mes' ? `${p.ano}-${String(p.mes).padStart(2, '0')}` : periodo === 'ano' ? p.ano : 'filtro'}.csv`, lancamentosParaCSV(filtrados))

  const catsRaiz = categorias.filter((c) => c.parentId == null && (!tipo || c.tipo === tipo))
  // subcategorias da categoria escolhida; sem categoria, todas (sem repetir nomes)
  const catSel = catsRaiz.find((c) => c.nome === cat)
  const subsDisponiveis = [...new Set(categorias.filter((c) => c.parentId != null && (catSel ? c.parentId === catSel.id : catsRaiz.some((r) => r.id === c.parentId))).map((c) => c.nome))].sort((a, b) => a.localeCompare(b))
  useEffect(() => { if (sub && !subsDisponiveis.includes(sub)) setSub('') }, [sub, subsDisponiveis])
  const pag = filtrados.slice(pagina * POR_PAG, (pagina + 1) * POR_PAG)

  // ---- edição em lote ----
  const selecionados = useMemo(() => lancamentos.filter((l) => sel.has(l.id)), [lancamentos, sel])
  const tiposSel = [...new Set(selecionados.map((l) => l.tipo))]
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const todosPagina = pag.length > 0 && pag.every((l) => sel.has(l.id))
  const alternarPagina = () => setSel((s) => { const n = new Set(s); if (todosPagina) pag.forEach((l) => n.delete(l.id)); else pag.forEach((l) => n.add(l.id)); return n })
  // categorias aplicáveis: só as do tipo dos lançamentos escolhidos (um único tipo por vez)
  const catsLote = tiposSel.length === 1 ? categorias.filter((c) => c.parentId == null && c.tipo === tiposSel[0]) : []
  const catLote = catsLote.find((c) => c.nome === lote?.categoria)
  const subsLote = catLote ? categorias.filter((c) => c.parentId === catLote.id) : []
  const aplicarLote = async () => {
    if (!lote?.categoria) return
    try {
      const r = await api.recategorizar({ ids: [...sel], categoria: lote.categoria, subcategoria: lote.subcategoria || null, grupo: catLote?.grupo ?? null })
      await recarregar(); setLote(null); setSel(new Set())
      aviso(`${r.atualizados} lançamento(s) movido(s) para ${lote.categoria}${lote.subcategoria ? ` › ${lote.subcategoria}` : ''}.`)
    } catch (e) { aviso((e as Error).message, 'erro') }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Lançamentos</h1>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={exportar} disabled={!filtrados.length}>Exportar CSV</button>
          <button className="btn-primary" onClick={() => setNovo(true)}>+ Novo</button>
        </div>
      </div>
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <input className="input col-span-2" placeholder="Pesquisar descrição, categoria, observações…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Pesquisar" />
          <select className="input" value={periodo} onChange={(e) => setPeriodo(e.target.value as typeof periodo)} aria-label="Período">
            <option value="mes">Mês selecionado ({String(p.mes).padStart(2, '0')}/{p.ano})</option><option value="ano">Ano {p.ano}</option><option value="intervalo">Intervalo</option><option value="tudo">Todo o histórico</option>
          </select>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Tipo"><option value="">Todos os tipos</option>{TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select>
          <select className="input" value={cat} onChange={(e) => { setCat(e.target.value); setSub('') }} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {catsRaiz.map((c) => <option key={c.id} value={c.nome}>{c.nome}{tipo ? '' : ` (${TIPO_LABEL[c.tipo]})`}</option>)}
          </select>
          <select className="input" value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subcategoria">
            <option value="">Todas as subcategorias</option>
            {subsDisponiveis.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          {periodo === 'intervalo' && (<>
            <input type="date" className="input" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De" />
            <input type="date" className="input" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até" />
          </>)}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2 mt-3 tnum">
          <span>{filtrados.length} lançamento(s)</span>
          {totais.receita > 0 && <span>Receitas {fmtBRL(totais.receita)}</span>}
          {totais.deducao > 0 && <span>Deduções {fmtBRL(totais.deducao)}</span>}
          {totais.despesa > 0 && <span>Despesas {fmtBRL(totais.despesa)}</span>}
          {totais.investimento > 0 && <span>Investimentos {fmtBRL(totais.investimento)}</span>}
          {totais.resgate > 0 && <span>Resgates {fmtBRL(totais.resgate)}</span>}
        </div>
      </Card>
      {sel.size > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-2 text-sm sticky top-2 z-30">
          <span className="font-medium tnum">{sel.size} selecionado(s)</span>
          {tiposSel.length > 1 && <span className="text-xs text-bad">Selecione lançamentos de um só tipo para alterar a categoria.</span>}
          {sel.size < filtrados.length && <button className="btn-ghost !py-1 text-xs" onClick={() => setSel(new Set(filtrados.map((l) => l.id)))}>Selecionar todos os {filtrados.length} filtrados</button>}
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost !py-1" onClick={() => setSel(new Set())}>Limpar</button>
            <button className="btn-primary !py-1" disabled={tiposSel.length !== 1} onClick={() => setLote({ categoria: '', subcategoria: '' })}>Alterar categoria…</button>
          </div>
        </div>
      )}
      <Card className="!p-0 overflow-hidden">
        {!pag.length ? <Vazio>Nenhum lançamento com esses filtros.</Vazio> : (
          <div className="overflow-x-auto">
            <table className="data min-w-[760px]">
              <thead><tr><th className="w-8"><input type="checkbox" checked={todosPagina} onChange={alternarPagina} aria-label="Selecionar todos da página" /></th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th className="text-right">Valor</th><th className="w-28"></th></tr></thead>
              <tbody>
                {pag.map((l) => (
                  <tr key={l.id} className={sel.has(l.id) ? 'bg-renda/8' : ''}>
                    <td><input type="checkbox" checked={sel.has(l.id)} onChange={() => alternar(l.id)} aria-label={`Selecionar ${l.descricao}`} /></td>
                    <td className="tnum whitespace-nowrap text-ink-2">{fmtData(l.data)}{!l.diaConhecido && <span className="text-muted" title="Dia não informado na origem (lançado no dia 1)"> *</span>}{(l.ano !== Number(l.data.slice(0, 4)) || l.mes !== Number(l.data.slice(5, 7))) && <span className="text-muted text-xs" title="Competência diferente da data"> ({String(l.mes).padStart(2, '0')}/{l.ano})</span>}</td>
                    <td><div className="flex items-center gap-2"><span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: COR_TIPO[l.tipo] }} title={TIPO_LABEL[l.tipo]} /><span className="truncate max-w-[320px]" title={l.observacoes ?? undefined}>{l.descricao}</span>{l.parcela && <span className="chip">{l.parcela}/{l.totalParcelas ?? '?'}</span>}</div></td>
                    <td className="text-ink-2 whitespace-nowrap">{l.categoria}{l.subcategoria ? <span className="text-muted"> › {l.subcategoria}</span> : ''}</td>
                    <td className="text-muted whitespace-nowrap">{l.conta ?? ''}{l.formaPagamento ? <span className="text-xs"> · {l.formaPagamento}</span> : ''}</td>
                    <td className={`text-right tnum whitespace-nowrap ${l.tipo === 'receita' || l.tipo === 'resgate' ? 'text-good' : ''}`}>{l.tipo === 'despesa' || l.tipo === 'deducao' || l.tipo === 'investimento' ? '−' : '+'}{fmtBRL(l.valor)}</td>
                    <td className="text-right whitespace-nowrap">
                      <button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => setEditar(l)} aria-label="Editar">Editar</button>
                      <button className="btn-ghost !px-2 !py-0.5 text-xs ml-1" onClick={() => duplicar(l)} aria-label="Duplicar" title="Duplicar com a data de hoje">⧉</button>
                      <button className="btn-ghost !px-2 !py-0.5 text-xs ml-1 text-bad" onClick={() => setExcluir(l)} aria-label="Excluir">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtrados.length > POR_PAG && (
          <div className="flex items-center justify-between p-2 text-xs text-ink-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button className="btn-ghost !py-1" disabled={pagina === 0} onClick={() => setPagina((x) => x - 1)}>‹ Anteriores</button>
            <span>{pagina * POR_PAG + 1}–{Math.min((pagina + 1) * POR_PAG, filtrados.length)} de {filtrados.length}</span>
            <button className="btn-ghost !py-1" disabled={(pagina + 1) * POR_PAG >= filtrados.length} onClick={() => setPagina((x) => x + 1)}>Próximos ›</button>
          </div>
        )}
      </Card>
      <p className="text-xs text-muted">* dia não informado na origem (lançado no 1º dia do mês). Entre parênteses: mês de competência quando difere da data.</p>
      <LancamentoForm aberto={novo} onFechar={() => setNovo(false)} base={{ data: periodo === 'mes' ? `${p.ano}-${String(p.mes).padStart(2, '0')}-01` : hojeISO() }} />
      <LancamentoForm aberto={!!editar} onFechar={() => setEditar(null)} editar={editar} />
      <Modal aberto={!!lote} titulo={`Alterar categoria de ${sel.size} lançamento(s)`} onFechar={() => setLote(null)} largura="max-w-md">
        {lote && (
          <div className="space-y-3">
            <p className="text-xs text-muted">Tipo: {tiposSel.map((t) => TIPO_LABEL[t]).join(', ')}. A nova categoria substitui a atual em todos os selecionados{catLote?.grupo ? ` (grupo ${catLote.grupo})` : ''}.</p>
            <Campo rotulo="Categoria">
              <select className="input" value={lote.categoria} onChange={(e) => setLote({ categoria: e.target.value, subcategoria: '' })} autoFocus>
                <option value="">Escolha…</option>
                {catsLote.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Subcategoria">
              <select className="input" value={lote.subcategoria} onChange={(e) => setLote({ ...lote, subcategoria: e.target.value })} disabled={!catLote}>
                <option value="">Sem subcategoria</option>
                {subsLote.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </Campo>
            <ul className="text-xs text-ink-2 max-h-40 overflow-y-auto space-y-0.5 border rounded-lg p-2" style={{ borderColor: 'var(--border)' }}>
              {selecionados.slice(0, 50).map((l) => <li key={l.id} className="flex justify-between gap-2"><span className="truncate">{fmtData(l.data)} · {l.descricao}</span><span className="text-muted whitespace-nowrap">{l.categoria}{l.subcategoria ? ` › ${l.subcategoria}` : ''}</span></li>)}
              {selecionados.length > 50 && <li className="text-muted">… e mais {selecionados.length - 50}</li>}
            </ul>
            <div className="flex justify-end gap-2 pt-1"><button className="btn-ghost" onClick={() => setLote(null)}>Cancelar</button><button className="btn-primary" disabled={!lote.categoria} onClick={aplicarLote}>Aplicar a {sel.size}</button></div>
          </div>
        )}
      </Modal>
      <Confirm aberto={!!excluir} titulo="Excluir lançamento" perigoso confirmar="Excluir" onCancelar={() => setExcluir(null)} onConfirmar={confirmarExclusao}
        mensagem={excluir ? <>Excluir <strong>{excluir.descricao}</strong> ({fmtData(excluir.data)}, {fmtBRL(excluir.valor)})? Esta ação não pode ser desfeita.</> : null} />
    </div>
  )
}
