import { useMemo, useState } from 'react'
import { useStore } from '@pat/lib/store'
import { api } from '@pat/lib/api'
import { Card, Valor, Tag, Confirm, Vazio } from '@pat/components/ui'
import { MovimentacaoForm } from '@pat/components/MovimentacaoForm'
import { baixarCSV } from '@pat/lib/csv'
import { fmtData, fmtQtd } from '@pat/lib/format'
import { TIPOS_MOV, TIPO_MOV_LABEL, ORIGEM_RECURSO_LABEL, type Movimentacao } from '@pat-shared/types'

export function Movimentacoes() {
  const { base, ix, recarregar, aviso, anos, info } = useStore()
  const [ano, setAno] = useState<string>('')
  const [tipo, setTipo] = useState('')
  const [invId, setInvId] = useState('')
  const [sit, setSit] = useState('')
  const [form, setForm] = useState<Movimentacao | 'nova' | null>(null)
  const [excluir, setExcluir] = useState<Movimentacao | null>(null)

  const lista = useMemo(() => [...base.movimentacoes]
    .filter((m) => (!ano || (ano === 'sem' ? !m.ano : m.ano === Number(ano))) && (!tipo || m.tipo === tipo) && (!invId || m.investimentoId === invId) && (!sit || m.situacao === sit))
    .sort((a, b) => (b.data ?? '0').localeCompare(a.data ?? '0')), [base, ano, tipo, invId, sit])

  const registrarFinancas = async (m: Movimentacao) => {
    try { const r = await api.financasLancamento(m.id); aviso(r.jaExistia ? 'Já existia no Finanças; vínculo registrado.' : 'Lançamento criado no Finanças.'); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">Movimentações</h1><span className="text-xs text-muted">{base.movimentacoes.length} registros</span>
        <div className="ml-auto flex gap-2">
          <button className="btn-ghost !py-1" onClick={() => baixarCSV('movimentacoes.csv', lista.map((m) => ({ id: m.id, data: m.data, ano: m.ano, mes: m.mes, investimento: m.investimentoId ? ix.invPorId.get(m.investimentoId)?.nome : '', tipo: m.tipo, valor: m.valor, quantidade: m.quantidade, preco: m.preco, taxas: m.taxas, irrf: m.irrf, origemRecurso: m.origemRecurso, foraDaPosicao: m.foraDaPosicao, situacao: m.situacao, origem: m.origem, origemArquivo: m.origemArquivo, observacoes: m.observacoes })))}>Exportar CSV</button>
          <button className="btn-primary !py-1" onClick={() => setForm('nova')}>Nova movimentação</button>
        </div>
      </div>
      <div className="card p-2 flex flex-wrap gap-2 text-xs">
        <select className="input !w-auto !py-1" value={ano} onChange={(e) => setAno(e.target.value)}><option value="">Todos os anos</option>{anos.map((a) => <option key={a} value={a}>{a}</option>)}<option value="sem">Sem data</option></select>
        <select className="input !w-auto !py-1" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Todos os tipos</option>{TIPOS_MOV.map((t) => <option key={t} value={t}>{TIPO_MOV_LABEL[t]}</option>)}</select>
        <select className="input !w-auto !py-1 max-w-60" value={invId} onChange={(e) => setInvId(e.target.value)}><option value="">Todos os ativos</option>{[...base.investimentos].sort((a, b) => a.nome.localeCompare(b.nome)).map((i) => <option key={i.id} value={i.id}>{i.nome}</option>)}</select>
        <select className="input !w-auto !py-1" value={sit} onChange={(e) => setSit(e.target.value)}><option value="">Qualquer situação</option><option value="confirmada">Confirmadas</option><option value="revisar">Revisar</option><option value="pendente">Pendentes</option></select>
      </div>
      <Card title={`${lista.length} movimentação(ões)`} subtitle="Valores brutos; IRRF e taxas informativos, registrados uma vez. Aplicações/resgates com dinheiro externo podem ser enviados ao fluxo de caixa do Finanças.">
        {lista.length === 0 ? <Vazio>Nada com esse filtro.</Vazio> : (
          <div className="overflow-x-auto">
            <table className="data whitespace-nowrap">
              <thead><tr><th>Data</th><th>Ativo</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Preço</th><th className="text-right">Valor</th><th className="text-right">Taxas</th><th>Recurso</th><th>Situação</th><th>Origem</th><th></th></tr></thead>
              <tbody>
                {lista.slice(0, 500).map((m) => (
                  <tr key={m.id} className={m.situacao === 'pendente' ? 'text-muted' : ''}>
                    <td className="text-xs">{m.data ? fmtData(m.data) : m.ano ? `${m.ano} (mês ?)` : <span className="tag-bad">sem data</span>}</td>
                    <td>{m.investimentoId ? ix.invPorId.get(m.investimentoId)?.nome ?? '?' : <span className="text-muted">consolidado</span>}</td>
                    <td className="text-xs">{TIPO_MOV_LABEL[m.tipo]}</td>
                    <td className="text-right tnum text-xs">{fmtQtd(m.quantidade)}</td><td className="text-right"><Valor v={m.preco} vazio="" /></td><td className="text-right"><Valor v={m.valor} vazio="—" /></td><td className="text-right"><Valor v={m.taxas} vazio="" /></td>
                    <td className="text-xs text-muted">{m.origemRecurso === 'nao_informado' ? '' : ORIGEM_RECURSO_LABEL[m.origemRecurso]}</td>
                    <td><Tag s={m.situacao} title={m.observacoes ?? undefined} /></td>
                    <td className="text-xs text-muted" title={m.origemArquivo ?? undefined}>{m.origem}{m.financasId && <span className="tag-ok"> · Finanças</span>}</td>
                    <td className="text-right whitespace-nowrap">
                      {info?.financas.disponivel && !m.financasId && m.origemRecurso === 'externo' && ['aplicacao', 'compra', 'resgate', 'venda', 'amortizacao'].includes(m.tipo) && m.data && <button className="btn-ghost !py-0.5 !px-2 text-xs" title="Criar o lançamento de caixa correspondente no app Finanças" onClick={() => registrarFinancas(m)}>→ Finanças</button>}
                      <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setForm(m)}>Editar</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setExcluir(m)}>Excluir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {lista.length > 500 && <p className="text-xs text-muted mt-2">Mostrando 500 de {lista.length}; refine o filtro ou exporte o CSV.</p>}
          </div>
        )}
      </Card>
      {form && <MovimentacaoForm mov={form === 'nova' ? undefined : form} onFechar={() => setForm(null)} onSalvo={async () => { setForm(null); await recarregar() }} />}
      <Confirm aberto={!!excluir} titulo="Excluir movimentação" perigoso confirmar="Excluir" onCancelar={() => setExcluir(null)} mensagem={<>Excluir {excluir && TIPO_MOV_LABEL[excluir.tipo]} de <Valor v={excluir?.valor} /> ({excluir?.data ? fmtData(excluir.data) : 'sem data'})? A exclusão fica no histórico de alterações.</>}
        onConfirmar={async () => { try { await api.excluir('movimentacoes', excluir!.id, 'exclusão manual'); setExcluir(null); aviso('Movimentação excluída.'); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }} />
    </div>
  )
}
