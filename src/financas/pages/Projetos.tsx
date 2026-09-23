import { useMemo, useState, type FormEvent } from 'react'
import type { Lancamento, LancamentoInput, Projeto } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { fmtBRL, fmtData, hojeISO } from '@fin/lib/format'
import { Campo, Card, Confirm, Modal, Vazio } from '@fin/components/ui'

/** Custos de um projeto = lançamentos fora do fluxo com ledger = nome do projeto. */
type Custo = Lancamento

interface FormCusto { data: string; descricao: string; secao: string; valor: string; tipo: 'despesa' | 'receita'; observacoes: string }
const custoVazio = (): FormCusto => ({ data: hojeISO(), descricao: '', secao: '', valor: '', tipo: 'despesa', observacoes: '' })

export function Projetos() {
  const { lancamentos, projetos, recarregar, aviso } = useStore()
  const custos = useMemo(() => lancamentos.filter((l) => l.foraDoFluxo), [lancamentos])
  const totais = useMemo(() => {
    const m = new Map<string, { saidas: number; entradas: number; n: number }>()
    for (const c of custos) {
      const k = c.ledger ?? ''
      const t = m.get(k) ?? { saidas: 0, entradas: 0, n: 0 }
      if (c.tipo === 'receita') t.entradas += c.valor; else t.saidas += c.valor
      t.n++; m.set(k, t)
    }
    return m
  }, [custos])

  const [selId, setSelId] = useState<number | null>(null)
  // sem seleção (ou projeto removido) cai no primeiro da lista
  const projeto = projetos.find((p) => p.id === selId) ?? projetos[0] ?? null

  const lista = useMemo(() => (projeto ? custos.filter((c) => c.ledger === projeto.nome).sort((a, b) => a.data.localeCompare(b.data)) : []), [custos, projeto])
  const porSecao = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of lista) if (c.tipo !== 'receita') m.set(c.subcategoria || c.categoria || '—', (m.get(c.subcategoria || c.categoria || '—') ?? 0) + c.valor)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [lista])
  const secoes = useMemo(() => [...new Set(custos.map((c) => c.subcategoria).filter((s): s is string => !!s))].sort((a, b) => a.localeCompare(b)), [custos])
  const tot = projeto ? totais.get(projeto.nome) ?? { saidas: 0, entradas: 0, n: 0 } : { saidas: 0, entradas: 0, n: 0 }

  // ---- projeto: criar / renomear / remover ----
  const [formProj, setFormProj] = useState<{ editar: Projeto | null; nome: string; descricao: string } | null>(null)
  const [removerProj, setRemoverProj] = useState<Projeto | null>(null)
  const salvarProjeto = async (e: FormEvent) => {
    e.preventDefault()
    if (!formProj) return
    try {
      if (formProj.editar) { await api.atualizarProjeto(formProj.editar.id, { nome: formProj.nome, descricao: formProj.descricao }); aviso('Projeto atualizado.') }
      else { const p = await api.criarProjeto({ nome: formProj.nome, descricao: formProj.descricao }); setSelId(p.id); aviso('Projeto criado.') }
      setFormProj(null); await recarregar()
    } catch (err) { aviso((err as Error).message, 'erro') }
  }
  const confirmarRemoverProjeto = async () => {
    if (!removerProj) return
    try {
      const r = await api.excluirProjeto(removerProj.id)
      aviso(r.custosRemovidos ? `Projeto removido com ${r.custosRemovidos} custo(s).` : 'Projeto removido.')
      setRemoverProj(null); setSelId(null); await recarregar()
    } catch (err) { aviso((err as Error).message, 'erro') }
  }

  // ---- custos: criar / editar / remover ----
  const [formCusto, setFormCusto] = useState<{ editar: Custo | null; f: FormCusto } | null>(null)
  const [removerCusto, setRemoverCusto] = useState<Custo | null>(null)
  const abrirCusto = (c: Custo | null) => setFormCusto({ editar: c, f: c ? { data: c.data, descricao: c.descricao, secao: c.subcategoria ?? '', valor: String(c.valor), tipo: c.tipo === 'receita' ? 'receita' : 'despesa', observacoes: c.observacoes ?? '' } : custoVazio() })
  const setF = <K extends keyof FormCusto>(k: K, v: FormCusto[K]) => setFormCusto((s) => (s ? { ...s, f: { ...s.f, [k]: v } } : s))
  const salvarCusto = async (e: FormEvent) => {
    e.preventDefault()
    if (!formCusto || !projeto) return
    const { editar, f } = formCusto
    const valor = Number(String(f.valor).replace(',', '.'))
    const base: LancamentoInput = editar
      ? { ...editar, data: f.data, descricao: f.descricao.trim(), subcategoria: f.secao.trim() || null, valor, tipo: f.tipo, observacoes: f.observacoes.trim() || null, foraDoFluxo: true, ledger: projeto.nome }
      : { data: f.data, descricao: f.descricao.trim(), tipo: f.tipo, valor, grupo: null, categoria: null, subcategoria: f.secao.trim() || null, conta: null, formaPagamento: null, parcela: null, totalParcelas: null,
          observacoes: f.observacoes.trim() || null, origem: 'manual', origemArquivo: null, diaConhecido: true, foraDoFluxo: true, ledger: projeto.nome, recorrenciaId: null }
    try {
      if (editar) await api.atualizarLancamento(editar.id, base); else await api.criarLancamento(base)
      aviso(editar ? 'Custo atualizado.' : 'Custo adicionado.')
      setFormCusto(null); await recarregar()
    } catch (err) { aviso((err as Error).message, 'erro') }
  }
  const confirmarRemoverCusto = async () => {
    if (!removerCusto) return
    try { await api.excluirLancamento(removerCusto.id); aviso('Custo removido.'); setRemoverCusto(null); await recarregar() } catch (err) { aviso((err as Error).message, 'erro') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-lg font-semibold">Projetos</h1><p className="text-xs text-muted">Quanto custou cada projeto (reforma, carro, dívida…). Os custos ficam fora do fluxo mensal: não entram nos totais do painel.</p></div>
        <button className="btn-primary" onClick={() => setFormProj({ editar: null, nome: '', descricao: '' })}>+ Novo projeto</button>
      </div>

      {!projetos.length ? <Card><Vazio>Nenhum projeto ainda. Crie um para começar a registrar custos.</Vazio></Card> : (<>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {projetos.map((p) => { const t = totais.get(p.nome) ?? { saidas: 0, entradas: 0, n: 0 }; const ativo = projeto?.id === p.id; return (
            <button key={p.id} onClick={() => setSelId(p.id)} className={`card p-4 text-left transition ${ativo ? 'ring-2 ring-renda' : 'hover:bg-surface-2'}`} aria-pressed={ativo}>
              <div className="text-sm font-medium truncate" title={p.descricao ?? undefined}>{p.nome}</div>
              <div className="text-xl font-semibold tnum mt-1">{fmtBRL(t.saidas - t.entradas)}</div>
              <div className="text-xs text-muted mt-1">{t.n} custo(s){t.entradas > 0 ? ` · ${fmtBRL(t.entradas)} de entradas` : ''}</div>
            </button>) })}
        </div>

        {projeto && (<>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0"><h2 className="font-semibold truncate">{projeto.nome}</h2>{projeto.descricao && <p className="text-xs text-muted">{projeto.descricao}</p>}</div>
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary !py-1.5" onClick={() => abrirCusto(null)}>+ Adicionar custo</button>
              <button className="btn-ghost !py-1.5" onClick={() => setFormProj({ editar: projeto, nome: projeto.nome, descricao: projeto.descricao ?? '' })}>Renomear</button>
              <button className="btn-ghost !py-1.5 text-bad" onClick={() => setRemoverProj(projeto)}>Remover projeto</button>
            </div>
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card title="Resumo" className="lg:col-span-1">
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-ink-2">Custo total</dt><dd className="tnum font-semibold">{fmtBRL(tot.saidas)}</dd></div>
                {tot.entradas > 0 && <><div className="flex justify-between"><dt className="text-ink-2">Entradas</dt><dd className="tnum font-medium text-good">{fmtBRL(tot.entradas)}</dd></div>
                  <div className="flex justify-between border-t pt-1" style={{ borderColor: 'var(--border)' }}><dt className="text-ink-2">Custo líquido</dt><dd className="tnum font-semibold">{fmtBRL(tot.saidas - tot.entradas)}</dd></div></>}
              </dl>
              {porSecao.length > 0 && <><div className="label mt-4">Por seção</div>
                <ul className="text-xs space-y-1">{porSecao.slice(0, 15).map(([n, v]) => <li key={n} className="flex justify-between gap-2"><span className="text-ink-2 truncate">{n}</span><span className="tnum">{fmtBRL(v)}</span></li>)}</ul></>}
            </Card>
            <Card title={`Custos (${lista.length})`} className="lg:col-span-2 !p-0 overflow-hidden">
              {!lista.length ? <Vazio>Nenhum custo registrado neste projeto.</Vazio> : (
                <div className="overflow-x-auto max-h-[600px]"><table className="data min-w-[600px]">
                  <thead><tr><th>Data</th><th>Descrição</th><th>Seção</th><th className="text-right">Valor</th><th /></tr></thead>
                  <tbody>{lista.map((c) => (
                    <tr key={c.id}><td className="tnum whitespace-nowrap text-ink-2">{fmtData(c.data)}{!c.diaConhecido && '*'}</td><td title={c.observacoes ?? undefined}>{c.descricao}</td><td className="text-muted">{c.subcategoria}</td>
                      <td className={`text-right tnum whitespace-nowrap ${c.tipo === 'receita' ? 'text-good' : ''}`}>{c.tipo === 'receita' ? '+' : '−'}{fmtBRL(c.valor)}</td>
                      <td className="text-right whitespace-nowrap"><button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => abrirCusto(c)}>Editar</button> <button className="btn-ghost !px-2 !py-0.5 text-xs text-bad" onClick={() => setRemoverCusto(c)}>Remover</button></td></tr>))}</tbody>
                  <tfoot><tr><td colSpan={3} className="font-medium">Total</td><td className="text-right tnum font-semibold">{fmtBRL(tot.saidas - tot.entradas)}</td><td /></tr></tfoot>
                </table></div>)}
            </Card>
          </div>
          {lista.some((c) => !c.diaConhecido) && <p className="text-xs text-muted">* dia não informado na origem (lançado no 1º dia do mês).</p>}
        </>)}
      </>)}

      <Modal aberto={!!formProj} titulo={formProj?.editar ? 'Renomear projeto' : 'Novo projeto'} onFechar={() => setFormProj(null)} largura="max-w-md">
        {formProj && <form onSubmit={salvarProjeto} className="space-y-3">
          <Campo rotulo="Nome"><input className="input" value={formProj.nome} onChange={(e) => setFormProj({ ...formProj, nome: e.target.value })} required autoFocus placeholder="Ex.: Reforma da cozinha" /></Campo>
          <Campo rotulo="Descrição (opcional)"><input className="input" value={formProj.descricao} onChange={(e) => setFormProj({ ...formProj, descricao: e.target.value })} /></Campo>
          <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={() => setFormProj(null)}>Cancelar</button><button type="submit" className="btn-primary">Salvar</button></div>
        </form>}
      </Modal>

      <Modal aberto={!!formCusto} titulo={formCusto?.editar ? 'Editar custo' : `Adicionar custo — ${projeto?.nome ?? ''}`} onFechar={() => setFormCusto(null)} largura="max-w-lg">
        {formCusto && <form onSubmit={salvarCusto} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Data"><input type="date" className="input" value={formCusto.f.data} onChange={(e) => setF('data', e.target.value)} required /></Campo>
            <Campo rotulo="Tipo"><select className="input" value={formCusto.f.tipo} onChange={(e) => setF('tipo', e.target.value as 'despesa' | 'receita')}><option value="despesa">Saída (custo)</option><option value="receita">Entrada (venda, reembolso)</option></select></Campo>
          </div>
          <Campo rotulo="Descrição"><input className="input" value={formCusto.f.descricao} onChange={(e) => setF('descricao', e.target.value)} required autoFocus /></Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Valor (R$)"><input className="input tnum" type="number" step="0.01" min="0.01" value={formCusto.f.valor} onChange={(e) => setF('valor', e.target.value)} required /></Campo>
            <Campo rotulo="Seção (opcional)"><input className="input" list="secoes-projeto" value={formCusto.f.secao} onChange={(e) => setF('secao', e.target.value)} placeholder="Ex.: Material, Mão de obra" /><datalist id="secoes-projeto">{secoes.map((s) => <option key={s} value={s} />)}</datalist></Campo>
          </div>
          <Campo rotulo="Observações (opcional)"><textarea className="input" rows={2} value={formCusto.f.observacoes} onChange={(e) => setF('observacoes', e.target.value)} /></Campo>
          <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={() => setFormCusto(null)}>Cancelar</button><button type="submit" className="btn-primary">Salvar</button></div>
        </form>}
      </Modal>

      <Confirm aberto={!!removerProj} titulo="Remover projeto" perigoso confirmar="Remover" onCancelar={() => setRemoverProj(null)} onConfirmar={confirmarRemoverProjeto}
        mensagem={removerProj ? <>Remover <strong>{removerProj.nome}</strong>{(totais.get(removerProj.nome)?.n ?? 0) > 0 ? <> e seus <strong>{totais.get(removerProj.nome)?.n}</strong> custo(s)</> : null}? Esta ação não pode ser desfeita.</> : null} />
      <Confirm aberto={!!removerCusto} titulo="Remover custo" perigoso confirmar="Remover" onCancelar={() => setRemoverCusto(null)} onConfirmar={confirmarRemoverCusto}
        mensagem={removerCusto ? <>Remover <strong>{removerCusto.descricao}</strong> ({fmtBRL(removerCusto.valor)})?</> : null} />
    </div>
  )
}
