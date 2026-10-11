import { useMemo, useState } from 'react'
import type { Recorrencia, TipoLancamento, Grupo } from '@fin-shared/types'
import { TIPOS, TIPO_LABEL, GRUPOS_DESPESA } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { usePeriodo } from '@fin/lib/periodo'
import { api } from '@fin/lib/api'
import { fmtBRL, parseValorBR, competencia, hojeISO } from '@fin/lib/format'
import { Card, Campo, Confirm, Modal, Vazio } from '@fin/components/ui'
import { FORMAS } from '@fin/components/LancamentoForm'

const vazia = (): Omit<Recorrencia, 'id'> => ({ descricao: '', valor: 0, tipo: 'despesa', grupo: 'Fixas', categoria: null, subcategoria: null, conta: null, formaPagamento: null, dia: 1, inicio: hojeISO().slice(0, 7), fim: null, observacoes: null, ativo: true })

export function Recorrentes() {
  const { recorrencias, categorias, contas, lancamentos, recarregar, aviso } = useStore()
  const p = usePeriodo()
  const [form, setForm] = useState<(Omit<Recorrencia, 'id'> & { id?: string }) | null>(null)
  const [valorTxt, setValorTxt] = useState('')
  const [excluir, setExcluir] = useState<Recorrencia | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const geradasNoMes = useMemo(() => new Set(lancamentos.filter((l) => l.recorrenciaId && l.ano === p.ano && l.mes === p.mes).map((l) => l.recorrenciaId)), [lancamentos, p.ano, p.mes])
  const cats = useMemo(() => categorias.filter((c) => c.parentId == null && c.tipo === form?.tipo), [categorias, form?.tipo])
  const subs = useMemo(() => { const pai = cats.find((c) => c.nome === form?.categoria); return pai ? categorias.filter((c) => c.parentId === pai.id) : [] }, [categorias, cats, form?.categoria])

  const abrir = (r?: Recorrencia) => { setForm(r ? { ...r } : vazia()); setValorTxt(r ? r.valor.toFixed(2).replace('.', ',') : ''); setErro(null) }
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form) return
    const valor = parseValorBR(valorTxt)
    if (valor == null || valor <= 0) { setErro('Informe um valor maior que zero.'); return }
    try {
      const dados = { ...form, valor, grupo: form.tipo === 'despesa' ? form.grupo : null }
      if (form.id) await api.atualizarRecorrencia(form.id, dados as Recorrencia); else await api.criarRecorrencia(dados)
      await recarregar(); setForm(null); aviso('Recorrência salva.')
    } catch (err) { setErro((err as Error).message) }
  }
  const gerar = async () => {
    try { const r = await api.gerarRecorrencias(p.ano, p.mes); await recarregar(); aviso(r.criados ? `${r.criados} lançamento(s) gerado(s) em ${competencia(p.ano, p.mes)}.` : 'Nada a gerar: todas as recorrências deste mês já existem.') } catch (e) { aviso((e as Error).message, 'erro') }
  }
  const alternar = async (r: Recorrencia) => { try { await api.atualizarRecorrencia(r.id, { ...r, ativo: !r.ativo }); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }
  const confirmarExclusao = async () => { if (!excluir) return; try { await api.excluirRecorrencia(excluir.id); await recarregar(); aviso('Recorrência excluída.') } catch (e) { aviso((e as Error).message, 'erro') } setExcluir(null) }

  const set = <K extends keyof Recorrencia>(k: K, v: Recorrencia[K]) => setForm((f) => (f ? { ...f, [k]: v } : f))
  const totalMensal = recorrencias.filter((r) => r.ativo && r.tipo === 'despesa').reduce((s, r) => s + r.valor, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div><h1 className="text-lg font-semibold">Despesas e receitas recorrentes</h1><p className="text-xs text-muted">Modelos mensais; os lançamentos são gerados sob demanda para o mês selecionado no painel ({competencia(p.ano, p.mes)}).</p></div>
        <div className="flex gap-2"><button className="btn-ghost" onClick={gerar} disabled={!recorrencias.some((r) => r.ativo)}>Gerar lançamentos de {String(p.mes).padStart(2, '0')}/{p.ano}</button><button className="btn-primary" onClick={() => abrir()}>+ Nova recorrência</button></div>
      </div>
      <Card>
        {!recorrencias.length ? <Vazio>Nenhuma recorrência cadastrada. Use "Nova recorrência" para cadastrar aluguel, assinaturas, salário etc.</Vazio> : (
          <div className="overflow-x-auto"><table className="data min-w-[680px]">
            <thead><tr><th>Descrição</th><th>Tipo</th><th>Categoria</th><th className="text-right">Valor</th><th className="text-right">Dia</th><th>Vigência</th><th>Este mês</th><th /></tr></thead>
            <tbody>{recorrencias.map((r) => (
              <tr key={r.id} className={r.ativo ? '' : 'text-muted'}>
                <td>{r.descricao}{!r.ativo && <span className="chip ml-2">inativa</span>}</td><td>{TIPO_LABEL[r.tipo]}</td><td className="text-ink-2">{r.categoria}{r.subcategoria ? ` › ${r.subcategoria}` : ''}</td>
                <td className="text-right tnum">{fmtBRL(r.valor)}</td><td className="text-right tnum">{r.dia}</td><td className="tnum text-xs">{r.inicio}{r.fim ? ` → ${r.fim}` : ' → …'}</td>
                <td className="text-xs">{geradasNoMes.has(r.id) ? <span className="text-good">gerado</span> : <span className="text-muted">pendente</span>}</td>
                <td className="text-right whitespace-nowrap"><button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => abrir(r)}>Editar</button><button className="btn-ghost !px-2 !py-0.5 text-xs ml-1" onClick={() => alternar(r)}>{r.ativo ? 'Pausar' : 'Ativar'}</button><button className="btn-ghost !px-2 !py-0.5 text-xs ml-1 text-bad" onClick={() => setExcluir(r)}>✕</button></td>
              </tr>))}</tbody>
          </table></div>
        )}
        {totalMensal > 0 && <p className="text-xs text-ink-2 mt-3 tnum">Despesas recorrentes ativas: {fmtBRL(totalMensal)}/mês</p>}
      </Card>
      <Modal aberto={!!form} titulo={form?.id ? 'Editar recorrência' : 'Nova recorrência'} onFechar={() => setForm(null)}>
        {form && (
          <form onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo rotulo="Tipo"><select className="input" value={form.tipo} onChange={(e) => { set('tipo', e.target.value as TipoLancamento); set('categoria', null); set('subcategoria', null) }}>{TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select></Campo>
            <Campo rotulo="Descrição"><input className="input" value={form.descricao} onChange={(e) => set('descricao', e.target.value)} required autoFocus /></Campo>
            <Campo rotulo="Valor (R$)"><input className="input tnum" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} required /></Campo>
            <Campo rotulo="Dia do mês"><input className="input tnum" type="number" min={1} max={31} value={form.dia} onChange={(e) => set('dia', Number(e.target.value))} /></Campo>
            {form.tipo === 'despesa' && <Campo rotulo="Natureza"><select className="input" value={form.grupo ?? 'Fixas'} onChange={(e) => set('grupo', e.target.value as Grupo)}>{GRUPOS_DESPESA.map((g) => <option key={g}>{g}</option>)}</select></Campo>}
            <Campo rotulo="Categoria"><input className="input" list="rec-cat" value={form.categoria ?? ''} onChange={(e) => { set('categoria', e.target.value || null); set('subcategoria', null) }} /><datalist id="rec-cat">{cats.map((c) => <option key={c.id} value={c.nome} />)}</datalist></Campo>
            <Campo rotulo="Subcategoria"><input className="input" list="rec-sub" value={form.subcategoria ?? ''} onChange={(e) => set('subcategoria', e.target.value || null)} /><datalist id="rec-sub">{subs.map((c) => <option key={c.id} value={c.nome} />)}</datalist></Campo>
            <Campo rotulo="Conta / cartão"><input className="input" list="rec-conta" value={form.conta ?? ''} onChange={(e) => set('conta', e.target.value || null)} /><datalist id="rec-conta">{contas.map((c) => <option key={c.id} value={c.nome} />)}</datalist></Campo>
            <Campo rotulo="Forma de pagamento"><input className="input" list="rec-forma" value={form.formaPagamento ?? ''} onChange={(e) => set('formaPagamento', e.target.value || null)} /><datalist id="rec-forma">{FORMAS.map((f) => <option key={f} value={f} />)}</datalist></Campo>
            <Campo rotulo="Início (mês)"><input className="input" type="month" value={form.inicio} onChange={(e) => set('inicio', e.target.value)} required /></Campo>
            <Campo rotulo="Fim (mês, opcional)"><input className="input" type="month" value={form.fim ?? ''} onChange={(e) => set('fim', e.target.value || null)} /></Campo>
            <Campo rotulo="Observações" className="sm:col-span-2"><input className="input" value={form.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value || null)} /></Campo>
            {erro && <p className="sm:col-span-2 text-sm text-bad">{erro}</p>}
            <div className="sm:col-span-2 flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary" type="submit">Salvar</button></div>
          </form>
        )}
      </Modal>
      <Confirm aberto={!!excluir} titulo="Excluir recorrência" perigoso confirmar="Excluir" onCancelar={() => setExcluir(null)} onConfirmar={confirmarExclusao} mensagem={<>Excluir a recorrência <strong>{excluir?.descricao}</strong>? Os lançamentos já gerados serão mantidos.</>} />
    </div>
  )
}
