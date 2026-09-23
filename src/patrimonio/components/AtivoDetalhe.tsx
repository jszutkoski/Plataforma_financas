import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useStore } from '@pat/lib/store'
import { Modal, Valor, Tag, Campo } from './ui'
import { api } from '@pat/lib/api'
import { fmtData, fmtMesAno, fmtQtd, fmtPct2 } from '@pat/lib/format'
import { CATEGORIA_LABEL, TIPO_MOV_LABEL, ORIGEM_RECURSO_LABEL, type Investimento, type Posicao } from '@pat-shared/types'
import { resultadoRealizado, quantidadeAte, capitalLiquidoAte } from '@pat-shared/calc'

export function AtivoDetalhe({ inv, onFechar }: { inv: Investimento; onFechar: () => void }) {
  const { base, ix, ultimo, recarregar, aviso, pendencias } = useStore()
  const posicoes = useMemo(() => base.posicoes.filter((p) => p.investimentoId === inv.id).sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes)), [base, inv])
  const movs = useMemo(() => (ix.movPorInv.get(inv.id) ?? []).slice().reverse(), [ix, inv])
  const real = useMemo(() => resultadoRealizado(ix, inv.id), [ix, inv])
  const qAtual = ultimo ? quantidadeAte(ix, inv.id, ultimo[0], ultimo[1]) : null
  const capital = ultimo ? capitalLiquidoAte(ix, inv.id, ultimo[0], ultimo[1]) : null
  const pend = pendencias.filter((p) => !p.resolvido && (p.dados?.investimentoId === inv.id || movs.some((m) => m.id === p.dados?.movimentacaoId)))
  const [corrigindo, setCorrigindo] = useState<Posicao | null>(null)
  const [novoSaldo, setNovoSaldo] = useState('')
  const [motivo, setMotivo] = useState('')
  const ultimaPos = posicoes[0]

  const salvarCorrecao = async () => {
    if (!corrigindo) return
    const v = Number(novoSaldo.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(v)) return aviso('Valor inválido.', 'erro')
    try {
      await api.atualizar('posicoes', corrigindo.id, { saldo: v, situacao: 'confirmada', motivo: motivo || 'correção de registro histórico' })
      aviso(`Posição de ${fmtMesAno(corrigindo.ano, corrigindo.mes)} corrigida. Períodos afetados: ${fmtMesAno(corrigindo.ano, corrigindo.mes)} e o mês seguinte (resultado).`)
      setCorrigindo(null); setMotivo(''); await recarregar()
    } catch (e) { aviso((e as Error).message, 'erro') }
  }

  return (
    <Modal aberto titulo={inv.nome} onFechar={onFechar} largura="max-w-4xl">
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <div className="space-y-1">
          <div><span className="text-muted">Categoria:</span> {CATEGORIA_LABEL[inv.categoria]}{inv.subtipo ? ` · ${inv.subtipo}` : ''}</div>
          <div><span className="text-muted">Instituição:</span> {inv.instituicao ?? <span className="text-muted">não informada</span>}</div>
          <div><span className="text-muted">Situação:</span> <Tag s={inv.situacao} />{inv.dataEncerramento && <span className="text-muted"> desde {fmtData(inv.dataEncerramento)}</span>}</div>
          <div><span className="text-muted">Início:</span> {inv.dataInicio ? fmtData(inv.dataInicio) : '—'}{inv.vencimento && <> · <span className="text-muted">vencimento</span> {fmtData(inv.vencimento)}</>}</div>
          {(inv.indexador || inv.condicoes) && <div><span className="text-muted">Condições:</span> {inv.condicoes ?? inv.indexador}</div>}
          {inv.nomesOriginais.length > 0 && <div className="text-xs text-muted">Grafias na origem: {inv.nomesOriginais.join(', ')}</div>}
          {inv.origem && <div className="text-xs text-muted">Origem: {inv.origemArquivo} · {inv.origem}</div>}
          {inv.observacoes && <div className="text-xs text-ink-2">{inv.observacoes}</div>}
        </div>
        <div className="space-y-1">
          <div><span className="text-muted">Última posição registrada:</span> {ultimaPos ? <><Valor v={ultimaPos.saldo} vazio="sem valor" /> em {fmtMesAno(ultimaPos.ano, ultimaPos.mes)} <Tag s={ultimaPos.situacao} /></> : <span className="text-muted">nenhuma</span>}</div>
          {qAtual != null && <div><span className="text-muted">Quantidade reconstruída (lançamentos datados):</span> {fmtQtd(qAtual)}</div>}
          {capital != null && <div><span className="text-muted">Capital líquido aplicado:</span> <Valor v={capital} /></div>}
          <div><span className="text-muted">Realizado (recebido + proventos − aplicado):</span> <Valor v={real.valor} sinal /> {real.aplicado > 0 && <span className="text-xs text-muted">({fmtPct2(real.valor / real.aplicado)} sobre {<Valor v={real.aplicado} />})</span>}</div>
          <div className="text-xs text-muted">Realizado não usa valor de mercado; para ativos encerrados é o resultado completo, para ativos abertos falta somar o saldo atual.</div>
          {pend.length > 0 && <div className="text-xs tag-bad">⚠ {pend.length} pendência(s): {pend.map((p) => p.motivo).join('; ')} — ver <Link to="/dados#pendencias" className="underline" onClick={onFechar}>Dados → Pendências</Link>.</div>}
        </div>
      </div>

      <h3 className="text-sm font-semibold mt-4 mb-1">Posições mensais registradas</h3>
      {posicoes.length === 0 ? <p className="text-xs text-muted">Nenhum valor de mercado mensal registrado para este ativo (só há quantidades/custos).</p> : (
        <div className="overflow-x-auto"><table className="data"><thead><tr><th>Mês</th><th className="text-right">Saldo</th><th className="text-right">Qtd.</th><th className="text-right">Custo</th><th>Data</th><th>Situação</th><th>Origem</th><th></th></tr></thead>
          <tbody>{posicoes.map((p) => (
            <tr key={p.id}><td>{fmtMesAno(p.ano, p.mes)}</td><td className="text-right"><Valor v={p.saldo} vazio="—" /></td><td className="text-right tnum">{fmtQtd(p.quantidade)}</td><td className="text-right"><Valor v={p.custo} vazio="" /></td><td className="text-xs">{p.dataPosicao ? fmtData(p.dataPosicao) : <span className="text-muted">não registrada</span>}</td><td><Tag s={p.situacao} title={p.observacoes ?? undefined} /></td><td className="text-xs text-muted">{p.origem}</td>
              <td><button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => { setCorrigindo(p); setNovoSaldo(p.saldo != null ? String(p.saldo).replace('.', ',') : '') }}>Corrigir</button></td></tr>
          ))}</tbody></table></div>
      )}
      {corrigindo && (
        <div className="card p-3 mt-2 space-y-2" style={{ borderColor: 'var(--resgate)' }}>
          <div className="text-sm font-medium">Correção de registro histórico — {fmtMesAno(corrigindo.ano, corrigindo.mes)}</div>
          <p className="text-xs text-muted">Isto altera um dado antigo (não é uma atualização da posição atual). Afeta o resultado de {fmtMesAno(corrigindo.ano, corrigindo.mes)} e do mês seguinte; a alteração fica registrada no histórico com o valor anterior.</p>
          <div className="grid sm:grid-cols-2 gap-2">
            <Campo rotulo="Novo saldo (R$)"><input className="input" value={novoSaldo} onChange={(e) => setNovoSaldo(e.target.value)} /></Campo>
            <Campo rotulo="Motivo"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: extrato conferido" /></Campo>
          </div>
          <div className="flex gap-2 justify-end"><button className="btn-ghost" onClick={() => setCorrigindo(null)}>Cancelar</button><button className="btn-primary" onClick={salvarCorrecao}>Salvar correção</button></div>
        </div>
      )}

      <h3 className="text-sm font-semibold mt-4 mb-1">Movimentações ({movs.length})</h3>
      {movs.length === 0 ? <p className="text-xs text-muted">Nenhuma movimentação registrada.</p> : (
        <div className="overflow-x-auto max-h-80 overflow-y-auto"><table className="data whitespace-nowrap"><thead><tr><th>Data</th><th>Tipo</th><th className="text-right">Qtd.</th><th className="text-right">Preço</th><th className="text-right">Valor</th><th className="text-right">Taxas</th><th className="text-right">IRRF</th><th>Recurso</th><th>Situação</th><th>Origem</th></tr></thead>
          <tbody>{movs.map((m) => (
            <tr key={m.id} className={m.situacao === 'pendente' ? 'text-muted' : ''}>
              <td className="text-xs">{m.data ? fmtData(m.data) : m.ano ? `${m.ano} (mês desconhecido)` : <span className="tag-bad">sem data</span>}</td>
              <td className="text-xs">{TIPO_MOV_LABEL[m.tipo]}{m.foraDaPosicao && m.tipo === 'provento' ? ' (em conta)' : ''}</td>
              <td className="text-right tnum text-xs">{fmtQtd(m.quantidade)}</td><td className="text-right"><Valor v={m.preco} vazio="" /></td><td className="text-right"><Valor v={m.valor} vazio="—" /></td>
              <td className="text-right"><Valor v={m.taxas} vazio="" /></td><td className="text-right"><Valor v={m.irrf} vazio="" /></td>
              <td className="text-xs text-muted">{m.origemRecurso === 'nao_informado' ? '' : ORIGEM_RECURSO_LABEL[m.origemRecurso]}</td>
              <td><Tag s={m.situacao} title={m.observacoes ?? undefined} /></td><td className="text-xs text-muted">{m.origem}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </Modal>
  )
}
