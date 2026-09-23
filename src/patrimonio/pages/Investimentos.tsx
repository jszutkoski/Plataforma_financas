import { useMemo, useState } from 'react'
import { useStore } from '@pat/lib/store'
import { api } from '@pat/lib/api'
import { Card, Valor, Tag, Confirm, Vazio } from '@pat/components/ui'
import { InvestimentoForm } from '@pat/components/InvestimentoForm'
import { AtivoDetalhe } from '@pat/components/AtivoDetalhe'
import { baixarCSV } from '@pat/lib/csv'
import { fmtData, fmtMesAno, fmtQtd } from '@pat/lib/format'
import { CATEGORIA_LABEL, CATEGORIAS, type Investimento } from '@pat-shared/types'
import { quantidadeAte, resultadoRealizado } from '@pat-shared/calc'

export function Investimentos() {
  const { base, ix, ultimo, recarregar, aviso } = useStore()
  const [filtroSit, setFiltroSit] = useState<'todos' | 'ativo' | 'encerrado' | 'revisar'>('ativo')
  const [filtroCat, setFiltroCat] = useState('')
  const [busca, setBusca] = useState('')
  const [form, setForm] = useState<Investimento | 'novo' | null>(null)
  const [detalhe, setDetalhe] = useState<Investimento | null>(null)
  const [excluir, setExcluir] = useState<Investimento | null>(null)

  const linhas = useMemo(() => base.investimentos.map((inv) => {
    const pos = base.posicoes.filter((p) => p.investimentoId === inv.id).sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes))[0] ?? null
    const q = ultimo ? quantidadeAte(ix, inv.id, ultimo[0], ultimo[1]) : null
    const nMov = (ix.movPorInv.get(inv.id) ?? []).length
    return { inv, pos, q, nMov, real: resultadoRealizado(ix, inv.id) }
  }).filter(({ inv }) => (filtroSit === 'todos' || inv.situacao === filtroSit) && (!filtroCat || inv.categoria === filtroCat) && (!busca || `${inv.nome} ${inv.codigo ?? ''} ${inv.instituicao ?? ''}`.toLowerCase().includes(busca.toLowerCase())))
    .sort((a, b) => a.inv.categoria.localeCompare(b.inv.categoria) || a.inv.nome.localeCompare(b.inv.nome)), [base, ix, ultimo, filtroSit, filtroCat, busca])

  const contagem = { ativo: base.investimentos.filter((i) => i.situacao === 'ativo').length, encerrado: base.investimentos.filter((i) => i.situacao === 'encerrado').length, revisar: base.investimentos.filter((i) => i.situacao === 'revisar').length }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Investimentos</h1>
        <span className="text-xs text-muted">{contagem.ativo} ativos · {contagem.encerrado} encerrados · {contagem.revisar} a revisar</span>
        <div className="ml-auto flex gap-2"><button className="btn-ghost !py-1" onClick={() => baixarCSV('investimentos.csv', base.investimentos.map((i) => ({ id: i.id, nome: i.nome, codigo: i.codigo, categoria: i.categoria, subtipo: i.subtipo, instituicao: i.instituicao, inicio: i.dataInicio, encerramento: i.dataEncerramento, vencimento: i.vencimento, indexador: i.indexador, condicoes: i.condicoes, situacao: i.situacao, origem: i.origem })))}>Exportar CSV</button><button className="btn-primary !py-1" onClick={() => setForm('novo')}>Novo investimento</button></div>
      </div>
      <div className="card p-2 flex flex-wrap gap-2 items-center">
        <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: 'var(--border)' }}>
          {(['ativo', 'revisar', 'encerrado', 'todos'] as const).map((s) => <button key={s} className={`px-3 py-1 ${filtroSit === s ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => setFiltroSit(s)}>{s === 'todos' ? 'Todos' : s === 'ativo' ? 'Ativos' : s === 'revisar' ? 'Revisar' : 'Encerrados'}</button>)}
        </div>
        <select className="input !w-auto !py-1 text-xs" value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}><option value="">Todas as categorias</option>{CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}</select>
        <input className="input !w-auto !py-1 text-xs" placeholder="Buscar…" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>
      <Card title={`${linhas.length} investimento(s)`}>
        {linhas.length === 0 ? <Vazio>Nenhum investimento com esse filtro.</Vazio> : (
          <div className="overflow-x-auto">
            <table className="data whitespace-nowrap">
              <thead><tr><th>Nome</th><th>Categoria</th><th>Instituição</th><th>Início</th><th className="text-right">Última posição</th><th className="text-right">Qtd. reconstruída</th><th className="text-right">Realizado</th><th className="text-right">Mov.</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {linhas.map(({ inv, pos, q, nMov, real }) => (
                  <tr key={inv.id}>
                    <td><button className="underline decoration-dotted text-left" onClick={() => setDetalhe(inv)}>{inv.nome}</button>{inv.codigo && inv.codigo !== inv.nome && <span className="text-xs text-muted"> {inv.codigo}</span>}</td>
                    <td className="text-xs">{CATEGORIA_LABEL[inv.categoria]}{inv.subtipo ? <span className="text-muted"> · {inv.subtipo}</span> : ''}</td>
                    <td className="text-xs">{inv.instituicao ?? <span className="text-muted">—</span>}</td>
                    <td className="text-xs">{inv.dataInicio ? fmtData(inv.dataInicio) : '—'}</td>
                    <td className="text-right">{pos ? <><Valor v={pos.saldo} vazio="—" /> <span className="text-xs text-muted">{fmtMesAno(pos.ano, pos.mes)}</span></> : <span className="text-xs text-muted">sem valor</span>}</td>
                    <td className="text-right tnum text-xs">{q != null ? fmtQtd(q) : ''}</td>
                    <td className="text-right"><Valor v={nMov ? real.valor : null} sinal vazio="" /></td>
                    <td className="text-right text-xs">{nMov}</td>
                    <td><Tag s={inv.situacao} title={inv.observacoes ?? undefined} /></td>
                    <td className="text-right whitespace-nowrap"><button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setForm(inv)}>Editar</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setExcluir(inv)}>Excluir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted mt-2">"Realizado" = vendas/resgates + proventos − compras/aplicações − taxas, sem valor de mercado (completo só para ativos encerrados). A quantidade reconstruída soma compras e vendas datadas até {ultimo ? fmtMesAno(ultimo[0], ultimo[1]) : 'hoje'}.</p>
      </Card>
      {form && <InvestimentoForm inv={form === 'novo' ? undefined : form} onFechar={() => setForm(null)} onSalvo={async () => { setForm(null); await recarregar() }} />}
      {detalhe && <AtivoDetalhe inv={detalhe} onFechar={() => setDetalhe(null)} />}
      <Confirm aberto={!!excluir} titulo="Excluir investimento" perigoso confirmar="Excluir" onCancelar={() => setExcluir(null)}
        mensagem={<>Excluir <strong>{excluir?.nome}</strong> apaga também suas {base.posicoes.filter((p) => p.investimentoId === excluir?.id).length} posições e {(ix.movPorInv.get(excluir?.id ?? '') ?? []).length} movimentações. Ativos vendidos devem ficar como <em>encerrados</em>, não excluídos — exclua só cadastros errados.</>}
        onConfirmar={async () => { try { await api.excluir('investimentos', excluir!.id, 'exclusão manual'); aviso('Investimento excluído.'); setExcluir(null); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }} />
    </div>
  )
}
