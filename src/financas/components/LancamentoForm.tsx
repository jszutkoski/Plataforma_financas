import { useEffect, useMemo, useState } from 'react'
import type { Lancamento, LancamentoInput, Grupo } from '@fin-shared/types'
import { TIPOS, TIPO_LABEL, GRUPOS_DESPESA, MESES } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { hojeISO, parseValorBR, fmtBRL } from '@fin/lib/format'
import { sugerirCategoria, descricoesFrequentes } from '@fin/lib/suggest'
import { Campo, Modal } from './ui'

export const FORMAS = ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Boleto', 'Transferência', 'Débito automático', 'Outro']

interface Props { aberto: boolean; onFechar: () => void; editar?: Lancamento | null; base?: Partial<LancamentoInput> | null; onSalvo?: (l: Lancamento) => void }

const vazio = (base?: Partial<LancamentoInput> | null): LancamentoInput => ({
  data: hojeISO(), descricao: '', tipo: 'despesa', valor: 0, grupo: 'Variáveis', categoria: null, subcategoria: null, conta: null, formaPagamento: null,
  parcela: null, totalParcelas: null, observacoes: null, origem: 'manual', origemArquivo: null, diaConhecido: true, foraDoFluxo: false, ledger: null, recorrenciaId: null, ...base,
})

export function LancamentoForm({ aberto, onFechar, editar, base, onSalvo }: Props) {
  const { lancamentos, categorias, contas, recarregar, aviso } = useStore()
  const [f, setF] = useState<LancamentoInput>(vazio(base))
  const [valorTxt, setValorTxt] = useState('')
  const [compManual, setCompManual] = useState(false)
  const [gerarParcelas, setGerarParcelas] = useState(true)
  // parcelas já existentes do mesmo parcelamento (ao editar)
  const grupo = useMemo(() => (editar?.parcelamentoId ? lancamentos.filter((l) => l.parcelamentoId === editar.parcelamentoId).sort((a, b) => (a.parcela ?? 0) - (b.parcela ?? 0)) : []), [editar, lancamentos])
  const totalGrupo = useMemo(() => Math.round(grupo.reduce((s, l) => s + l.valor, 0) * 100) / 100, [grupo])
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sugestao, setSugestao] = useState<ReturnType<typeof sugerirCategoria>>(null)

  useEffect(() => {
    if (!aberto) return
    const init = editar ? { ...editar } : vazio(base)
    setF(init)
    const emGrupo = !!editar?.parcelamentoId
    const somaGrupo = emGrupo ? lancamentos.filter((l) => l.parcelamentoId === editar!.parcelamentoId).reduce((s, l) => s + l.valor, 0) : 0
    // ao editar uma compra parcelada, o campo mostra o valor TOTAL do parcelamento
    setValorTxt(emGrupo ? somaGrupo.toFixed(2).replace('.', ',') : init.valor ? init.valor.toFixed(2).replace('.', ',') : '')
    setCompManual(!!editar && (editar.ano !== Number(editar.data.slice(0, 4)) || editar.mes !== Number(editar.data.slice(5, 7))))
    setGerarParcelas(!editar || emGrupo); setErro(null); setSugestao(null)
  }, [aberto, editar, base, lancamentos])

  const set = <K extends keyof LancamentoInput>(k: K, v: LancamentoInput[K]) => setF((p) => ({ ...p, [k]: v }))

  const cats = useMemo(() => categorias.filter((c) => c.parentId == null && c.tipo === f.tipo), [categorias, f.tipo])
  const subs = useMemo(() => {
    const pai = cats.find((c) => c.nome === f.categoria)
    return pai ? categorias.filter((c) => c.parentId === pai.id) : []
  }, [categorias, cats, f.categoria])
  const sugestoesDesc = useMemo(() => descricoesFrequentes(lancamentos, f.tipo, f.descricao), [lancamentos, f.tipo, f.descricao])

  const aoSairDescricao = () => {
    if (editar || f.categoria) return
    const s = sugerirCategoria(lancamentos, f.descricao, f.tipo)
    setSugestao(s)
  }
  const aplicarSugestao = () => {
    if (!sugestao) return
    setF((p) => ({ ...p, categoria: sugestao.categoria, subcategoria: sugestao.subcategoria, grupo: sugestao.grupo ?? p.grupo, conta: p.conta ?? sugestao.conta, formaPagamento: p.formaPagamento ?? sugestao.formaPagamento }))
    setSugestao(null)
  }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const valor = parseValorBR(valorTxt)
    if (valor == null || valor <= 0) { setErro('Informe um valor maior que zero.'); return }
    const item: LancamentoInput = { ...f, valor, descricao: f.descricao.trim(), categoria: f.categoria?.trim() || null, subcategoria: f.subcategoria?.trim() || null }
    if (!compManual) { delete item.ano; delete item.mes }
    if (f.tipo !== 'despesa') item.grupo = null
    setSalvando(true); setErro(null)
    try {
      let salvo: Lancamento
      const nParc = item.totalParcelas ?? 0
      const emGrupo = !!editar?.parcelamentoId
      if (gerarParcelas && nParc > 1) {
        // valor informado = total da compra; dividido igualmente entre as parcelas, uma por mês
        const dataInicio = emGrupo ? (grupo[0]?.data ?? item.data) : item.data
        const r = await api.parcelamento({ base: { ...item, parcela: null, totalParcelas: null }, valorTotal: valor, totalParcelas: nParc, dataInicio, parcelamentoId: editar?.parcelamentoId ?? null })
        // lançamento antigo sem vínculo de parcelamento: é substituído pelas parcelas geradas
        if (editar && !emGrupo) await api.excluirLancamento(editar.id)
        aviso(emGrupo ? `Parcelamento atualizado: ${r.criados} parcelas de ${fmtBRL(valor / nParc)}.` : `${r.criados} parcelas de ${fmtBRL(valor / nParc)} criadas.`)
        await recarregar(); onFechar(); return
      }
      if (editar) {
        salvo = await api.atualizarLancamento(editar.id, item)
      } else {
        salvo = await api.criarLancamento(item)
      }
      await recarregar()
      aviso(editar ? 'Lançamento atualizado.' : 'Lançamento criado.')
      onSalvo?.(salvo)
      onFechar()
    } catch (err) {
      setErro((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const ano = Number(f.data?.slice(0, 4)) || new Date().getFullYear()
  const mes = Number(f.data?.slice(5, 7)) || 1

  return (
    <Modal aberto={aberto} titulo={editar ? 'Editar lançamento' : 'Novo lançamento'} onFechar={onFechar}>
      <form onSubmit={salvar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rotulo="Tipo">
          <div className="flex flex-wrap gap-1">
            {TIPOS.map((t) => (
              <button type="button" key={t} onClick={() => { set('tipo', t); set('categoria', null); set('subcategoria', null) }}
                className={`btn !py-1 !px-2.5 text-xs border ${f.tipo === t ? 'bg-renda text-white border-transparent' : 'bg-surface-2 border-transparent text-ink-2'}`}>{TIPO_LABEL[t]}</button>
            ))}
          </div>
        </Campo>
        <Campo rotulo="Data">
          <input type="date" className="input" value={f.data} onChange={(e) => set('data', e.target.value)} required />
        </Campo>
        <Campo rotulo="Descrição" className="sm:col-span-2">
          <input className="input" list="desc-sugestoes" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} onBlur={aoSairDescricao} required autoFocus placeholder="Ex.: Supermercado" />
          <datalist id="desc-sugestoes">{sugestoesDesc.map((d) => <option key={d} value={d} />)}</datalist>
          {sugestao && (
            <div className="mt-1 text-xs flex items-center gap-2 flex-wrap">
              <span className="text-muted">Sugestão pelo histórico:</span>
              <button type="button" className="chip hover:bg-renda/15" onClick={aplicarSugestao}>{sugestao.categoria}{sugestao.subcategoria ? ` › ${sugestao.subcategoria}` : ''} ✓</button>
              <button type="button" className="text-muted underline" onClick={() => setSugestao(null)}>ignorar</button>
            </div>
          )}
        </Campo>
        <Campo rotulo={gerarParcelas && (f.totalParcelas ?? 0) > 1 ? "Valor total (R$)" : "Valor (R$)"}>
          <input className="input tnum" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="0,00" required />
        </Campo>
        {f.tipo === 'despesa' && (
          <Campo rotulo="Natureza">
            <select className="input" value={f.grupo ?? 'Variáveis'} onChange={(e) => set('grupo', e.target.value as Grupo)}>
              {GRUPOS_DESPESA.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Campo>
        )}
        <Campo rotulo="Categoria">
          <input className="input" list="cat-lista" value={f.categoria ?? ''} onChange={(e) => { set('categoria', e.target.value || null); set('subcategoria', null) }} placeholder="Escolha ou digite uma nova" />
          <datalist id="cat-lista">{cats.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
        </Campo>
        <Campo rotulo="Subcategoria">
          <input className="input" list="sub-lista" value={f.subcategoria ?? ''} onChange={(e) => set('subcategoria', e.target.value || null)} placeholder="Opcional" />
          <datalist id="sub-lista">{subs.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
        </Campo>
        <Campo rotulo="Conta / cartão">
          <input className="input" list="conta-lista" value={f.conta ?? ''} onChange={(e) => set('conta', e.target.value || null)} placeholder="Opcional" />
          <datalist id="conta-lista">{contas.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.nome} />)}</datalist>
        </Campo>
        <Campo rotulo="Forma de pagamento">
          <input className="input" list="forma-lista" value={f.formaPagamento ?? ''} onChange={(e) => set('formaPagamento', e.target.value || null)} placeholder="Opcional" />
          <datalist id="forma-lista">{FORMAS.map((x) => <option key={x} value={x} />)}</datalist>
        </Campo>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          {!(gerarParcelas && (f.totalParcelas ?? 0) > 1) && (
            <Campo rotulo="Parcela nº">
              <input className="input tnum" type="number" min={1} value={f.parcela ?? ''} onChange={(e) => set('parcela', e.target.value ? Number(e.target.value) : null)} placeholder="—" />
            </Campo>
          )}
          <Campo rotulo="Total de parcelas">
            <input className="input tnum" type="number" min={1} value={f.totalParcelas ?? ''} onChange={(e) => set('totalParcelas', e.target.value ? Number(e.target.value) : null)} placeholder="—" />
          </Campo>
          {(f.totalParcelas ?? 0) > 1 && (
            <label className="col-span-2 text-xs flex items-start gap-2 text-ink-2">
              <input type="checkbox" className="mt-0.5" checked={gerarParcelas} onChange={(e) => setGerarParcelas(e.target.checked)} />
              <span>
                {editar?.parcelamentoId ? 'Atualizar todas as parcelas deste parcelamento' : editar ? 'Substituir este lançamento pelas parcelas nos meses seguintes' : 'Lançar as demais parcelas nos meses seguintes'} — o valor informado é o <strong>total</strong>, dividido em {f.totalParcelas} parcelas
                {parseValorBR(valorTxt) ? ` de ${fmtBRL((parseValorBR(valorTxt) ?? 0) / (f.totalParcelas ?? 1))}` : ''}{editar?.parcelamentoId ? ` (hoje: ${grupo.length} parcelas somando ${fmtBRL(totalGrupo)})` : ''}.
              </span>
            </label>
          )}
        </div>
        <Campo rotulo="Observações" className="sm:col-span-2">
          <textarea className="input" rows={2} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value || null)} />
        </Campo>
        <div className="sm:col-span-2">
          <label className="text-xs flex items-center gap-2 text-ink-2"><input type="checkbox" checked={compManual} onChange={(e) => { setCompManual(e.target.checked); if (e.target.checked) { set('ano', ano); set('mes', mes) } }} />
            Contabilizar em outro mês (competência diferente da data)</label>
          {compManual && (
            <div className="flex gap-2 mt-2">
              <select className="input" value={f.mes ?? mes} onChange={(e) => set('mes', Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
              <input className="input tnum w-28" type="number" value={f.ano ?? ano} onChange={(e) => set('ano', Number(e.target.value))} />
            </div>
          )}
        </div>
        {editar?.origem && <p className="sm:col-span-2 text-xs text-muted">Origem: {editar.origem}{editar.origemArquivo ? ` — ${editar.origemArquivo}` : ''}</p>}
        {erro && <p className="sm:col-span-2 text-sm text-bad">{erro}</p>}
        <div className="sm:col-span-2 flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : editar ? 'Salvar alterações' : 'Adicionar'}</button>
        </div>
      </form>
    </Modal>
  )
}
