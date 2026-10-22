import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { Conciliacao as Dados, MesConciliacao, SituacaoConciliacao } from '@pat-shared/types'
import { TIPO_MOV_LABEL } from '@pat-shared/types'
import { useStore } from '@pat/lib/store'
import { useStore as useFin } from '@fin/lib/store'
import { api } from '@pat/lib/api'
import { Card, Confirm, Modal, Valor, Vazio, Campo } from '@pat/components/ui'
import { fmtData, fmtMesAno } from '@pat/lib/format'

const SITUACAO: Record<SituacaoConciliacao, { rotulo: string; classe: string; dica: string }> = {
  confere: { rotulo: 'confere', classe: 'tag-ok', dica: 'O aporte do Patrimônio é igual ao líquido do Finanças.' },
  diferente: { rotulo: 'valor diferente', classe: 'tag-warn', dica: 'Os dois lados têm valores, mas não batem.' },
  nao_importado: { rotulo: 'não importado', classe: 'tag-warn', dica: 'Há lançamentos no Finanças, mas o Patrimônio não tem aporte no mês.' },
  so_patrimonio: { rotulo: 'só no Patrimônio', classe: 'tag-warn', dica: 'O Patrimônio tem aporte ou movimentação, e o Finanças não tem lançamento de investimento no mês.' },
  desatualizado: { rotulo: 'Finanças mudou', classe: 'tag-warn', dica: 'O valor bate, mas os lançamentos do Finanças mudaram depois da importação.' },
}

export function Conciliacao() {
  const pat = useStore()
  const fin = useFin()
  const { base, aviso } = pat
  const [dados, setDados] = useState<Dados | null>(null)
  const [filtro, setFiltro] = useState<'pendentes' | 'todos'>('pendentes')
  const [aberto, setAberto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [criarMov, setCriarMov] = useState<MesConciliacao['itens'][number] | null>(null)
  const [invId, setInvId] = useState('')
  const [conflito, setConflito] = useState<{ ano: number; mes: number; atual: number; novo: number } | null>(null)

  const carregar = useCallback(async () => { try { setDados(await api.conciliacao()) } catch (e) { aviso((e as Error).message, 'erro') } }, [aviso])
  useEffect(() => { void carregar() }, [carregar, base, fin.lancamentos])

  /** Executa uma ação que grava; recarrega os dois lados (Finanças e Patrimônio). Um clique por vez. */
  const agir = async (fn: () => Promise<unknown>, ok: string) => {
    if (ocupado) return
    setOcupado(true)
    try { await fn(); aviso(ok); await Promise.all([pat.recarregar(), fin.recarregar()]) } catch (e) {
      const c = (e as Error & { corpo?: { conflito?: boolean; atual?: { aportesLiquidos: number }; novo?: number; ano?: number; mes?: number } }).corpo
      if (!c?.conflito) aviso((e as Error).message, 'erro')
      else throw e
    } finally { setOcupado(false) }
  }
  const importar = async (m: { ano: number; mes: number }, substituir = false) => {
    try { await agir(() => api.financasImportarFluxo(m.ano, m.mes, substituir), `Aporte de ${fmtMesAno(m.ano, m.mes)} importado do Finanças.`) } catch (e) {
      const c = (e as Error & { corpo?: { atual?: { aportesLiquidos: number }; novo?: number } }).corpo!
      setConflito({ ano: m.ano, mes: m.mes, atual: c.atual!.aportesLiquidos, novo: c.novo! })
    }
  }

  const meses = dados?.meses ?? []
  const conta = (s: SituacaoConciliacao) => meses.filter((m) => m.situacao === s).length
  const lista = filtro === 'todos' ? meses : meses.filter((m) => m.situacao !== 'confere')
  const investimentos = useMemo(() => [...base.investimentos].sort((a, b) => Number(a.situacao !== 'ativo') - Number(b.situacao !== 'ativo') || a.nome.localeCompare(b.nome, 'pt-BR')), [base.investimentos])

  if (!dados) return <div className="text-sm text-muted p-6">Carregando…</div>
  if (!dados.inicio) return <Card><Vazio>Nenhum lançamento no Finanças ainda.</Vazio></Card>

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Conciliação com o Finanças</h1>
        <p className="text-xs text-muted">Desde {fmtMesAno(Number(dados.inicio.slice(0, 4)), Number(dados.inicio.slice(5, 7)))}, primeiro mês com lançamentos no Finanças. Só mostra; nada muda sem um clique seu.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Contagem rotulo="Meses que conferem" valor={`${conta('confere')} de ${meses.length}`} />
        <Contagem rotulo="Valor diferente" valor={String(conta('diferente') + conta('desatualizado'))} />
        <Contagem rotulo="Não importados" valor={String(conta('nao_importado'))} />
        <Contagem rotulo="Só no Patrimônio" valor={String(conta('so_patrimonio'))} />
        <Contagem rotulo="Movimentações sem lançamento" valor={String(dados.semLancamento.length)} />
      </div>

      <Card title="Mês a mês" subtitle="Finanças: investimentos − resgates do mês. Patrimônio: aporte líquido consolidado do mês."
        actions={<div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: 'var(--border)' }} role="tablist">
          {(['pendentes', 'todos'] as const).map((f) => <button key={f} role="tab" aria-selected={filtro === f} className={`px-2.5 py-1 ${filtro === f ? 'bg-renda text-white' : 'text-ink-2 hover:bg-surface-2'}`} onClick={() => setFiltro(f)}>{f === 'pendentes' ? `Com diferença (${meses.length - conta('confere')})` : `Todos (${meses.length})`}</button>)}
        </div>}>
        {!lista.length ? <Vazio>Todos os meses conferem.</Vazio> : (
          <div className="overflow-x-auto"><table className="data text-sm whitespace-nowrap">
            <thead><tr><th>Mês</th><th className="text-right">Finanças</th><th className="text-right">Patrimônio</th><th className="text-right">Diferença</th><th>Situação</th><th /></tr></thead>
            <tbody>{lista.map((m) => {
              const k = `${m.ano}-${m.mes}`
              const s = SITUACAO[m.situacao]
              return (
                <Fragment key={k}>
                  <tr>
                    <td>{fmtMesAno(m.ano, m.mes)}</td>
                    <td className="text-right">{m.itens.length ? <Valor v={m.liquido} sinal /> : <span className="text-muted">—</span>}</td>
                    <td className="text-right"><Valor v={m.aporte} sinal /></td>
                    <td className={`text-right ${m.diferenca ? 'text-resgate' : ''}`}><Valor v={m.diferenca} sinal /></td>
                    <td><span className={s.classe} title={s.dica}>{s.rotulo}</span></td>
                    <td className="text-right space-x-1">
                      <button className="btn-ghost !py-0.5 !px-2 text-xs" aria-expanded={aberto === k} onClick={() => setAberto(aberto === k ? null : k)}>{aberto === k ? 'Fechar' : 'Ver itens'}</button>
                      {m.itens.length > 0 && m.situacao !== 'confere' && <button className="btn-ghost !py-0.5 !px-2 text-xs" disabled={ocupado} onClick={() => importar(m)} title="Grava no Patrimônio o líquido do Finanças como aporte do mês">Importar</button>}
                    </td>
                  </tr>
                  {aberto === k && (
                    <tr><td colSpan={6} className="!p-0">
                      <div className="grid md:grid-cols-2 gap-4 p-3 bg-surface-2 whitespace-normal">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Finanças ({m.itens.length})</div>
                          {!m.itens.length ? <p className="text-xs text-muted">Nenhum lançamento de investimento ou resgate.</p> : (
                            <table className="data text-xs"><tbody>{m.itens.map((i) => (
                              <tr key={i.id}><td>{fmtData(i.data)}</td><td>{i.descricao}{i.conta && <span className="text-muted"> · {i.conta}</span>}</td>
                                <td className="text-right"><Valor v={i.tipo === 'investimento' ? i.valor : -i.valor} sinal /></td>
                                <td className="text-right">{i.movimentacaoId ? <span className="tag-ok">com movimentação</span>
                                  : <button className="btn-ghost !py-0.5 !px-2" disabled={ocupado} onClick={() => { setCriarMov(i); setInvId('') }}>Criar movimentação</button>}</td></tr>))}</tbody></table>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">Patrimônio</div>
                          <p className="text-xs mb-1">Aporte consolidado: <Valor v={m.aporte} sinal />{m.origemAporte && <span className="text-muted"> ({m.origemAporte})</span>}</p>
                          {!m.movimentacoes.length ? <p className="text-xs text-muted">Nenhuma movimentação com dinheiro de conta.</p> : (
                            <table className="data text-xs"><tbody>{m.movimentacoes.map((x) => (
                              <tr key={x.id}><td>{fmtData(x.data)}</td><td>{TIPO_MOV_LABEL[x.tipo]} · {x.investimento ?? '—'}</td>
                                <td className="text-right"><Valor v={x.entrada ? x.valor : -x.valor} sinal /></td>
                                <td className="text-right">{x.financasId ? <span className="tag-ok">no Finanças</span> : <span className="text-muted">sem lançamento</span>}</td></tr>))}</tbody></table>
                          )}
                          {m.movimentacoes.length > 0 && <p className="text-xs text-muted mt-1">Soma das movimentações: <Valor v={m.liquidoMovs} sinal /></p>}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              )
            })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Movimentações sem lançamento no Finanças (${dados.semLancamento.length})`} subtitle={`Aplicações e resgates pagos com dinheiro de conta.${dados.semLancamentoAntes ? ` Outras ${dados.semLancamentoAntes} são anteriores ao início do Finanças e não aparecem aqui.` : ''}`}>
        {!dados.semLancamento.length ? <Vazio>Nenhuma.</Vazio> : (
          <div className="overflow-x-auto"><table className="data text-sm">
            <thead><tr><th>Data</th><th>Investimento</th><th>Tipo</th><th className="text-right">Valor</th><th /></tr></thead>
            <tbody>{dados.semLancamento.map((x) => (
              <tr key={x.id}><td className="whitespace-nowrap">{fmtData(x.data)}</td><td>{x.investimento ?? '—'}</td><td>{TIPO_MOV_LABEL[x.tipo]}</td><td className="text-right"><Valor v={x.entrada ? x.valor : -x.valor} sinal /></td>
                <td className="text-right whitespace-nowrap space-x-1">
                  {x.candidato && <button className="btn-ghost !py-0.5 !px-2 text-xs" disabled={ocupado} title={`Já existe no Finanças: ${x.candidato.descricao} (${fmtData(x.candidato.data)})`}
                    onClick={() => agir(() => api.vincularFinancas(x.id, x.candidato!.id), 'Movimentação ligada ao lançamento existente.')}>Vincular a “{x.candidato.descricao}”</button>}
                  <button className="btn-ghost !py-0.5 !px-2 text-xs" disabled={ocupado} onClick={() => agir(() => api.financasLancamento(x.id), 'Lançamento criado no Finanças.')}>Criar lançamento</button>
                </td></tr>))}</tbody>
          </table></div>
        )}
      </Card>

      <Modal aberto={!!criarMov} titulo="Criar movimentação a partir do Finanças" onFechar={() => setCriarMov(null)} largura="max-w-md">
        {criarMov && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (!invId) return; const l = criarMov; setCriarMov(null); void agir(() => api.criarMovimentacaoDoFinancas(l.id, invId), 'Movimentação criada no Patrimônio.') }}>
            <p className="text-sm text-ink-2">{criarMov.tipo === 'investimento' ? 'Aplicação' : 'Resgate'} de <Valor v={criarMov.valor} /> em {fmtData(criarMov.data)} — “{criarMov.descricao}”{criarMov.conta ? `, conta ${criarMov.conta}` : ''}.</p>
            <Campo rotulo="Investimento"><select className="input" value={invId} onChange={(e) => setInvId(e.target.value)} required autoFocus>
              <option value="">Escolha…</option>{investimentos.map((i) => <option key={i.id} value={i.id}>{i.nome}{i.situacao !== 'ativo' ? ` (${i.situacao})` : ''}</option>)}
            </select></Campo>
            <p className="text-xs text-muted">A movimentação entra como dinheiro externo, confirmada, ligada a este lançamento. O aporte consolidado do mês não muda.</p>
            <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={() => setCriarMov(null)}>Cancelar</button><button type="submit" className="btn-primary" disabled={!invId}>Criar</button></div>
          </form>
        )}
      </Modal>
      <Confirm aberto={!!conflito} titulo="Valor diferente já registrado" confirmar="Substituir pelo valor do Finanças" onCancelar={() => setConflito(null)}
        mensagem={<>Em {conflito && fmtMesAno(conflito.ano, conflito.mes)} o Patrimônio registra aporte líquido de <Valor v={conflito?.atual} sinal /> e o Finanças soma <Valor v={conflito?.novo} sinal />. Nada foi alterado. Se substituir, a alteração fica registrada como correção histórica e o resultado do mês é recalculado.</>}
        onConfirmar={async () => { const c = conflito!; setConflito(null); await importar(c, true) }} />
    </div>
  )
}

function Contagem({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="card p-4 min-w-0">
      <div className="text-xs text-ink-2">{rotulo}</div>
      <div className={`text-xl font-semibold mt-1 tnum ${alerta ? 'text-resgate' : ''}`}>{valor}</div>
    </div>
  )
}
