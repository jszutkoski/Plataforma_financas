import { useEffect, useMemo, useRef, useState } from 'react'
import type { Lancamento, LancamentoInput, Grupo } from '@fin-shared/types'
import { TIPOS, TIPO_LABEL, GRUPOS_DESPESA, MESES } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { hojeISO, parseValorBR, fmtBRL } from '@fin/lib/format'
import { sugerirCategoria, descricoesFrequentes } from '@fin/lib/suggest'
import { Campo, Modal } from './ui'
import { Calendario } from './Calendario'

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

  // o formulário é preenchido UMA vez ao abrir (ou ao trocar o lançamento editado). Antes, qualquer nova
  // renderização da página — como o aviso "Lançamento criado." sumindo — apagava o que estava sendo digitado.
  const preenchidoPara = useRef<string | null>(null)
  useEffect(() => {
    if (!aberto) { preenchidoPara.current = null; return }
    const chave = editar?.id ?? 'novo'
    if (preenchidoPara.current === chave) return
    preenchidoPara.current = chave
    const init = editar ? { ...editar } : vazio(base)
    setF(init)
    setValorTxt(init.valor ? init.valor.toFixed(2).replace('.', ',') : '')
    setCompManual(!!editar && (editar.ano !== Number(editar.data.slice(0, 4)) || editar.mes !== Number(editar.data.slice(5, 7))))
    // editar uma parcela altera só ela; regravar o parcelamento inteiro é escolha explícita
    setGerarParcelas(!editar); setErro(null); setSugestao(null)
  }, [aberto, editar, base])
  /** Ao marcar "atualizar todas as parcelas", o valor passa a ser o TOTAL da compra (e volta à parcela ao desmarcar). */
  const alternarTodasParcelas = (marcar: boolean) => {
    setGerarParcelas(marcar)
    if (editar?.parcelamentoId) setValorTxt((marcar ? totalGrupo : editar.valor).toFixed(2).replace('.', ','))
  }

  const set = <K extends keyof LancamentoInput>(k: K, v: LancamentoInput[K]) => setF((p) => ({ ...p, [k]: v }))

  const cats = useMemo(() => categorias.filter((c) => c.parentId == null && c.tipo === f.tipo), [categorias, f.tipo])
  const subs = useMemo(() => {
    const pai = cats.find((c) => c.nome === f.categoria)
    return pai ? categorias.filter((c) => c.parentId === pai.id) : []
  }, [categorias, cats, f.categoria])
  /** Ao escolher uma categoria da árvore, a natureza (Fixas/Variáveis…) passa a ser a dela; pode ser trocada depois. */
  const escolherCategoria = (v: string) => {
    const cat = cats.find((c) => c.nome === v)
    setF((p) => ({ ...p, categoria: v || null, subcategoria: null, grupo: p.tipo === 'despesa' && cat?.grupo && GRUPOS_DESPESA.includes(cat.grupo) ? cat.grupo : p.grupo }))
  }
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
    if (valor == null || valor === 0) { setErro('Informe um valor diferente de zero.'); return }
    if (valor < 0 && f.tipo !== 'despesa') { setErro('Só despesas aceitam valor negativo (estorno ou reembolso).'); return }
    if (valor < 0 && gerarParcelas && (f.totalParcelas ?? 0) > 1) { setErro('Estorno não pode ser parcelado.'); return }
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

  const parcelado = gerarParcelas && (f.totalParcelas ?? 0) > 1
  const despesa = f.tipo === 'despesa'

  return (
    <Modal aberto={aberto} titulo={editar ? 'Editar lançamento' : 'Novo lançamento'} onFechar={onFechar} largura="max-w-4xl">
      <form onSubmit={salvar} className="flex flex-col gap-4">
        <div className="grid grid-cols-5 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }} role="radiogroup" aria-label="Tipo">
          {TIPOS.map((t) => (
            <button type="button" key={t} role="radio" aria-checked={f.tipo === t} onClick={() => setF((p) => ({ ...p, tipo: t, categoria: null, subcategoria: null, grupo: t === 'despesa' ? 'Variáveis' : null }))}
              className={`py-2 text-sm font-medium transition-colors ${f.tipo === t ? 'bg-renda text-white' : 'text-ink-2 hover:bg-surface-2'}`}>{TIPO_LABEL[t]}</button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_17rem] gap-5">
          {/* campos à esquerda; o Tab segue Descrição → Valor → Categoria… e só depois a data */}
          <div className="space-y-4 min-w-0">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_11rem] gap-3">
              <Campo rotulo="Descrição">
                <input className="input" list="desc-sugestoes" value={f.descricao} onChange={(e) => set('descricao', e.target.value)} onBlur={aoSairDescricao} required autoFocus placeholder="Ex.: Supermercado" />
                <datalist id="desc-sugestoes">{sugestoesDesc.map((d) => <option key={d} value={d} />)}</datalist>
              </Campo>
              <Campo rotulo={parcelado ? 'Valor total' : 'Valor'}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted pointer-events-none">R$</span>
                  <input className="input tnum !pl-9 text-right !text-base font-semibold" inputMode="decimal" value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="0,00" required />
                </div>
              </Campo>
            </div>
            {sugestao && (
              <div className="-mt-2 text-xs flex items-center gap-2 flex-wrap">
                <span className="text-muted">Sugestão pelo histórico:</span>
                <button type="button" className="chip hover:bg-renda/15" onClick={aplicarSugestao}>{sugestao.categoria}{sugestao.subcategoria ? ` › ${sugestao.subcategoria}` : ''} ✓</button>
                <button type="button" className="text-muted underline" onClick={() => setSugestao(null)}>ignorar</button>
              </div>
            )}

            <Secao titulo="Classificação">
              <div className={`grid grid-cols-1 gap-3 ${despesa ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
                <Campo rotulo="Categoria">
                  <input className="input" list="cat-lista" value={f.categoria ?? ''} onChange={(e) => escolherCategoria(e.target.value)} placeholder="Escolha ou digite" />
                  <datalist id="cat-lista">{cats.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
                </Campo>
                <Campo rotulo="Subcategoria">
                  <input className="input" list="sub-lista" value={f.subcategoria ?? ''} onChange={(e) => set('subcategoria', e.target.value || null)} placeholder="Opcional" />
                  <datalist id="sub-lista">{subs.map((c) => <option key={c.id} value={c.nome} />)}</datalist>
                </Campo>
                {despesa && (
                  <Campo rotulo="Natureza">
                    <select className="input" value={f.grupo ?? 'Variáveis'} onChange={(e) => set('grupo', e.target.value as Grupo)}>
                      {GRUPOS_DESPESA.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Campo>
                )}
              </div>
            </Secao>

            <Secao titulo="Pagamento">
              <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_5.5rem_5.5rem] gap-3">
                <Campo rotulo="Conta / cartão">
                  <input className="input" list="conta-lista" value={f.conta ?? ''} onChange={(e) => set('conta', e.target.value || null)} placeholder="Opcional" />
                  <datalist id="conta-lista">{contas.filter((c) => c.ativo).map((c) => <option key={c.id} value={c.nome} />)}</datalist>
                </Campo>
                <Campo rotulo="Forma">
                  <input className="input" list="forma-lista" value={f.formaPagamento ?? ''} onChange={(e) => set('formaPagamento', e.target.value || null)} placeholder="Opcional" />
                  <datalist id="forma-lista">{FORMAS.map((x) => <option key={x} value={x} />)}</datalist>
                </Campo>
                <Campo rotulo="Parcela">
                  <input className="input tnum" type="number" min={1} value={parcelado ? '' : (f.parcela ?? '')} disabled={parcelado} onChange={(e) => set('parcela', e.target.value ? Number(e.target.value) : null)} placeholder="—" title={parcelado ? 'Numeradas automaticamente' : 'Número desta parcela'} />
                </Campo>
                <Campo rotulo="de">
                  <input className="input tnum" type="number" min={1} value={f.totalParcelas ?? ''} onChange={(e) => set('totalParcelas', e.target.value ? Number(e.target.value) : null)} placeholder="—" title="Total de parcelas" />
                </Campo>
              </div>
              {(f.totalParcelas ?? 0) > 1 && (
                <label className="mt-2 text-xs flex items-start gap-2 text-ink-2">
                  <input type="checkbox" className="mt-0.5" checked={gerarParcelas} onChange={(e) => alternarTodasParcelas(e.target.checked)} />
                  <span>
                    {editar?.parcelamentoId ? 'Atualizar todas as parcelas deste parcelamento' : editar ? 'Substituir este lançamento pelas parcelas nos meses seguintes' : 'Lançar as demais parcelas nos meses seguintes'}
                    {gerarParcelas ? <> — o valor informado é o <strong>total</strong>, dividido em {f.totalParcelas} parcelas{parseValorBR(valorTxt) ? ` de ${fmtBRL((parseValorBR(valorTxt) ?? 0) / (f.totalParcelas ?? 1))}` : ''}{editar?.parcelamentoId ? ` (hoje: ${grupo.length} parcelas somando ${fmtBRL(totalGrupo)}); alterações feitas só em alguma parcela serão substituídas` : ''}.</>
                      : editar?.parcelamentoId ? ' — desmarcado: só esta parcela é alterada.' : '.'}
                  </span>
                </label>
              )}
            </Secao>

            <Campo rotulo="Observações">
              <textarea className="input" rows={2} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value || null)} placeholder="Opcional" />
            </Campo>
          </div>

          {/* data à direita, com o calendário já aberto */}
          <aside className="space-y-3 md:border-l md:pl-5" style={{ borderColor: 'var(--border)' }}>
            <Campo rotulo="Data">
              <input type="date" className="input" value={f.data} onChange={(e) => set('data', e.target.value)} required />
            </Campo>
            <Calendario valor={f.data} onChange={(d) => set('data', d)} />
            <div>
              <label className="text-xs flex items-start gap-2 text-ink-2"><input type="checkbox" className="mt-0.5" checked={compManual} onChange={(e) => { setCompManual(e.target.checked); if (e.target.checked) { set('ano', ano); set('mes', mes) } }} />
                Contabilizar em outro mês (competência diferente da data)</label>
              {compManual && (
                <div className="flex gap-2 mt-2">
                  <select className="input" value={f.mes ?? mes} onChange={(e) => set('mes', Number(e.target.value))}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
                  <input className="input tnum w-24" type="number" value={f.ano ?? ano} onChange={(e) => set('ano', Number(e.target.value))} />
                </div>
              )}
            </div>
          </aside>
        </div>

        <footer className="flex items-center gap-3 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex-1 min-w-0 text-xs">
            {erro ? <p className="text-sm text-bad">{erro}</p> : editar?.origem && <p className="text-muted truncate">Origem: {editar.origem}{editar.origemArquivo ? ` — ${editar.origemArquivo}` : ''}</p>}
          </div>
          <button type="button" className="btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn-primary" disabled={salvando}>{salvando ? 'Salvando…' : editar ? 'Salvar alterações' : 'Adicionar'}</button>
        </footer>
      </form>
    </Modal>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">{titulo}</h3>
      {children}
    </section>
  )
}
