import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useStore } from '@pat/lib/store'
import { api, type FechamentoCorpo } from '@pat/lib/api'
import { Card, Valor, Tag, Campo, Aviso, Modal, Confirm } from '@pat/components/ui'
import { InvestimentoForm } from '@pat/components/InvestimentoForm'
import { fmtBRL, fmtData, fmtMesAno, fmtQtd, nomeMes, parseValorBR } from '@pat/lib/format'
import { CATEGORIA_LABEL, MESES, chaveMes, mesAnterior, mesSeguinte, type Investimento, type Movimentacao, type OrigemRecurso } from '@pat-shared/types'
import { resumoMes, saldoCarteira, vigenteNoMes, quantidadeAte } from '@pat-shared/calc'

interface Linha {
  inv: Investimento
  saldo: string; quantidade: string; aplicacao: string; resgate: string; provento: string; origemRecurso: OrigemRecurso; encerrar: boolean; obs: string
  dataPosicao: string
}
const ultimoDia = (a: number, m: number) => `${chaveMes(a, m)}-${String(new Date(a, m, 0).getDate()).padStart(2, '0')}`
const idMov = (a: number, m: number, inv: string, tipo: string) => `mov-fech-${a}-${String(m).padStart(2, '0')}-${inv}-${tipo}`
const num = (s: string): number | null => (s.trim() === '' ? null : parseValorBR(s))
const str = (v: number | null | undefined): string => (v == null ? '' : v.toLocaleString('pt-BR', { maximumFractionDigits: 8 }))

export function AtualizarMes() {
  const { base, ix, ultimo, recarregar, aviso, anos } = useStore()
  const [params, setParams] = useSearchParams()
  const proximo = ultimo ? mesSeguinte(ultimo[0], ultimo[1]) : [new Date().getFullYear(), new Date().getMonth() + 1]
  const ano = Number(params.get('ano')) || proximo[0]
  const mes = Number(params.get('mes')) || proximo[1]
  const irPara = (a: number, m: number) => { const p = new URLSearchParams(); p.set('ano', String(a)); p.set('mes', String(m)); setParams(p) }
  const k = chaveMes(ano, mes)
  const [aa, ma] = mesAnterior(ano, mes)

  const fech = ix.fechamentos.get(k) ?? null
  const fluxo = ix.fluxos.get(k) ?? null
  const rm = useMemo(() => resumoMes(base, ix, ano, mes), [base, ix, ano, mes])
  const ant = useMemo(() => saldoCarteira(base, ix, aa, ma), [base, ix, aa, ma])
  const consol = ix.consCarteira.get(k) ?? null

  const [linhas, setLinhas] = useState<Linha[]>([])
  const [totalCarteira, setTotalCarteira] = useState('')
  const [aportesLiq, setAportesLiq] = useState('')
  const [proventosCons, setProventosCons] = useState('')
  const [movsConf, setMovsConf] = useState(false)
  const [obs, setObs] = useState('')
  const [contas, setContas] = useState<Record<string, string>>({})
  const [dividas, setDividas] = useState<Record<string, string>>({})
  const [addInv, setAddInv] = useState(false)
  const [novoInv, setNovoInv] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [excluir, setExcluir] = useState<string[]>([])

  // monta as linhas: ativos vigentes (não encerrados antes do mês) + ativos com posição/movimentação no mês
  useEffect(() => {
    const ids = new Set<string>()
    for (const inv of base.investimentos) {
      const temPos = ix.posPorInv.get(inv.id)?.has(k)
      const temMov = (ix.movPorMes.get(k) ?? []).some((m) => m.investimentoId === inv.id)
      const vig = vigenteNoMes(ix, inv, ano, mes) && inv.situacao !== 'encerrado'
      const encerradoNoMes = inv.dataEncerramento?.slice(0, 7) === k
      if (temPos || temMov || vig || encerradoNoMes) ids.add(inv.id)
    }
    const movDo = (inv: string, tipo: string) => base.movimentacoes.find((m) => m.id === idMov(ano, mes, inv, tipo))
    setLinhas([...ids].map((id) => {
      const inv = ix.invPorId.get(id)!
      const p = ix.posPorInv.get(id)?.get(k)
      const ap = movDo(id, 'aplicacao'), re = movDo(id, 'resgate'), pr = movDo(id, 'provento')
      return { inv, saldo: str(p?.saldo), quantidade: str(p?.quantidade), aplicacao: str(ap?.valor), resgate: str(re?.valor), provento: str(pr?.valor), origemRecurso: ap?.origemRecurso ?? re?.origemRecurso ?? 'externo', encerrar: inv.dataEncerramento?.slice(0, 7) === k, obs: p?.observacoes ?? '', dataPosicao: p?.dataPosicao ?? ultimoDia(ano, mes) }
    }).sort((x, y) => x.inv.categoria.localeCompare(y.inv.categoria) || x.inv.nome.localeCompare(y.inv.nome)))
    setTotalCarteira(consol && consol.origem === 'manual' ? str(consol.saldo) : '')
    setAportesLiq(fluxo?.aportesLiquidos != null ? str(fluxo.aportesLiquidos) : '')
    setProventosCons(fluxo?.proventos != null ? str(fluxo.proventos) : '')
    setMovsConf(fech?.movimentacoesConfirmadas ?? false)
    setObs(fech?.observacoes ?? '')
    const c: Record<string, string> = {}
    for (const ct of base.contas) { const s = base.saldosConta.find((s) => s.contaId === ct.id && s.ano === ano && s.mes === mes); c[ct.id] = str(s?.saldo) }
    setContas(c)
    const d: Record<string, string> = {}
    for (const dv of base.dividas) { const s = base.saldosDivida.find((s) => s.dividaId === dv.id && s.ano === ano && s.mes === mes); d[dv.id] = str(s?.saldoDevedor) }
    setDividas(d)
    setExcluir([])
  }, [base, ix, k, ano, mes, consol, fluxo, fech])

  const setL = (id: string, patch: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.inv.id === id ? { ...l, ...patch } : l)))
  const outrasMovs = (inv: string): Movimentacao[] => (ix.movPorMes.get(k) ?? []).filter((m) => m.investimentoId === inv && !m.id.startsWith(`mov-fech-${ano}-${String(mes).padStart(2, '0')}-`) && !excluir.includes(m.id))

  const somaSaldos = linhas.reduce((s, l) => s + (num(l.saldo) ?? 0), 0)
  const semSaldo = linhas.filter((l) => num(l.saldo) == null && !l.encerrar && !(num(l.quantidade) != null) && l.inv.situacao === 'ativo')
  const pendencias: string[] = []
  if (ant.valor == null) pendencias.push(`Falta o saldo inicial (não há fechamento de ${fmtMesAno(aa, ma)})`)
  if (semSaldo.length && !num(totalCarteira)) pendencias.push(`Falta o saldo final de: ${semSaldo.map((l) => l.inv.nome).join(', ')}`)
  if (!movsConf && !num(aportesLiq)) pendencias.push('Movimentações do mês ainda não confirmadas (marque a confirmação abaixo ou informe o aporte líquido)')
  const resultadoPrevisto = ant.valor != null && (num(totalCarteira) != null || (!semSaldo.length && linhas.length)) && (movsConf || num(aportesLiq) != null)
    ? (num(totalCarteira) ?? somaSaldos) - ant.valor - (num(aportesLiq) ?? linhas.reduce((s, l) => s + (l.origemRecurso === 'externo' ? (num(l.aplicacao) ?? 0) - (num(l.resgate) ?? 0) : 0), 0)) : null

  const salvar = async (status: 'rascunho' | 'confirmado') => {
    setSalvando(true)
    try {
      const corpo: FechamentoCorpo = {
        ano, mes, status, movimentacoesConfirmadas: movsConf, observacoes: obs || null, posicoes: [], movimentacoes: [], excluirMovimentacoes: excluir, encerrar: [],
        fluxo: num(aportesLiq) != null || num(proventosCons) != null ? { aportesLiquidos: num(aportesLiq), proventos: num(proventosCons), proventosSituacao: num(proventosCons) != null ? 'informado' : null, origem: 'manual', observacoes: 'Informado na tela Atualizar mês.' } : null,
      }
      for (const l of linhas) {
        const saldo = num(l.saldo), qtd = num(l.quantidade)
        if (saldo != null || qtd != null || l.encerrar) corpo.posicoes.push({ investimentoId: l.inv.id, saldo: l.encerrar && saldo == null ? 0 : saldo, quantidade: qtd, dataPosicao: l.dataPosicao || null, observacoes: l.obs || null, origem: 'manual', situacao: saldo == null && !l.encerrar ? 'pendente' : status === 'confirmado' ? 'confirmada' : 'informada' })
        else corpo.posicoes.push({ investimentoId: l.inv.id, saldo: null, quantidade: null })
        for (const [tipo, campo] of [['aplicacao', l.aplicacao], ['resgate', l.resgate], ['provento', l.provento]] as const) {
          const v = num(campo)
          const id = idMov(ano, mes, l.inv.id, tipo)
          if (v != null && v > 0) corpo.movimentacoes.push({ id, investimentoId: l.inv.id, tipo, data: ultimoDia(ano, mes), valor: v, origemRecurso: tipo === 'provento' ? 'externo' : l.origemRecurso, foraDaPosicao: tipo === 'provento', origem: `fechamento:${k}`, situacao: 'confirmada', observacoes: 'Informado na tela Atualizar mês (data = último dia do mês).' })
          else if (base.movimentacoes.some((m) => m.id === id)) corpo.excluirMovimentacoes!.push(id)
        }
        if (l.encerrar) corpo.encerrar!.push({ investimentoId: l.inv.id, data: ultimoDia(ano, mes) })
      }
      const r = await api.fechamento(corpo)
      // total consolidado (quando informado só o total)
      const tc = num(totalCarteira)
      const idC = `pc-${ano}-${String(mes).padStart(2, '0')}-carteira`
      if (tc != null) await (consol ? api.atualizar('posicoesConsolidadas', idC, { saldo: tc, situacao: status === 'confirmado' ? 'confirmada' : 'informada', dataPosicao: ultimoDia(ano, mes), motivo: consol.origem !== 'manual' ? 'total consolidado informado manualmente sobre valor importado' : undefined }) : api.criar('posicoesConsolidadas', { id: idC, ano, mes, escopo: 'carteira', categoria: null, saldo: tc, situacao: status === 'confirmado' ? 'confirmada' : 'informada', dataPosicao: ultimoDia(ano, mes), origem: 'manual' }))
      else if (consol && consol.origem === 'manual') await api.excluir('posicoesConsolidadas', idC)
      for (const [id, v] of Object.entries(contas)) { const s = num(v); const sid = `sc-${id}-${ano}-${String(mes).padStart(2, '0')}`; if (s != null) await api.criar('saldosConta', { id: sid, contaId: id, ano, mes, data: ultimoDia(ano, mes), saldo: s, situacao: status === 'confirmado' ? 'confirmada' : 'informada', origem: 'manual' }) }
      for (const [id, v] of Object.entries(dividas)) { const s = num(v); if (s != null) { const ex = base.saldosDivida.find((x) => x.dividaId === id && x.ano === ano && x.mes === mes); if (ex) await api.atualizar('saldosDivida', ex.id, { saldoDevedor: s }); else await api.criar('saldosDivida', { dividaId: id, data: ultimoDia(ano, mes), saldoDevedor: s, origem: 'manual' }) } }
      if (r.erros.length) aviso(`Salvo com avisos: ${r.erros.join(' ')}`, 'erro')
      else aviso(status === 'confirmado' ? `Fechamento de ${fmtMesAno(ano, mes)} confirmado.` : `Rascunho de ${fmtMesAno(ano, mes)} salvo.`)
      await recarregar()
    } catch (e) { aviso((e as Error).message, 'erro') } finally { setSalvando(false); setConfirmar(false) }
  }

  const candidatos = base.investimentos.filter((i) => !linhas.some((l) => l.inv.id === i.id))

  return (
    <div className="space-y-4">
      <div className="card p-2 flex flex-wrap items-center gap-2">
        <button className="btn-ghost !px-2 !py-1" onClick={() => irPara(aa, ma)} aria-label="Mês anterior">‹</button>
        <select className="input !w-auto !py-1" value={mes} onChange={(e) => irPara(ano, Number(e.target.value))} aria-label="Mês">{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select>
        <select className="input !w-auto !py-1 font-semibold" value={ano} onChange={(e) => irPara(Number(e.target.value), mes)} aria-label="Ano">{[...new Set([...anos, ano, anos.at(-1)! + 1])].sort().map((a) => <option key={a} value={a}>{a}</option>)}</select>
        <button className="btn-ghost !px-2 !py-1" onClick={() => irPara(...mesSeguinte(ano, mes))} aria-label="Próximo mês">›</button>
        <div className="ml-auto text-xs text-muted">{fech ? <>Fechamento <Tag s={fech.status} />{fech.confirmadoEm && ` em ${fmtData(fech.confirmadoEm.slice(0, 10))}`}</> : 'Sem fechamento salvo'} · <Link className="underline" to={`/anos?ano=${ano}&mes=${mes}`}>ver no ano</Link></div>
      </div>

      <h1 className="text-lg font-semibold">Atualizar {nomeMes(mes)} de {ano}</h1>
      {fech?.status === 'confirmado' && <Aviso tipo="alerta">Este mês já foi <strong>confirmado</strong>. Alterar saldos aqui é uma <strong>correção de registro histórico</strong>: os valores anteriores ficam guardados no histórico de alterações e o resultado deste mês e do seguinte é recalculado.</Aviso>}
      {ant.valor != null ? <p className="text-xs text-muted">Saldo inicial (fechamento de {fmtMesAno(aa, ma)}): <Valor v={ant.valor} /> <Tag s={ant.situacao ?? 'informada'} /></p> : <Aviso tipo="alerta">Não há fechamento de {fmtMesAno(aa, ma)}: o saldo inicial deste mês é desconhecido e o resultado não poderá ser apurado. Você pode registrar a posição mesmo assim (ela vale como fechamento de {fmtMesAno(ano, mes)}).</Aviso>}

      <Card title="Ativos" subtitle="Informe o saldo de fechamento de cada ativo. O saldo do mês anterior aparece só como referência — não é copiado automaticamente. Aplicações/resgates aqui criam uma movimentação no último dia do mês; para detalhar datas, use Movimentações."
        actions={<div className="flex gap-2"><button className="btn-ghost !py-1" onClick={() => setAddInv(true)}>Adicionar ativo existente</button><button className="btn-ghost !py-1" onClick={() => setNovoInv(true)}>Novo investimento</button></div>}>
        <div className="overflow-x-auto">
          <table className="data whitespace-nowrap">
            <thead><tr><th>Ativo</th><th className="text-right">Saldo anterior</th><th className="text-right">Aplicações/compras</th><th className="text-right">Resgates/vendas</th><th>Recurso</th><th className="text-right">Proventos (em conta)</th><th className="text-right">Saldo final</th><th className="text-right">Qtd.</th><th>Encerrar</th><th>Obs.</th></tr></thead>
            <tbody>
              {linhas.map((l) => {
                const pa = ix.posPorInv.get(l.inv.id)?.get(chaveMes(aa, ma))
                const outras = outrasMovs(l.inv.id)
                const qAnt = quantidadeAte(ix, l.inv.id, aa, ma)
                return (
                  <tr key={l.inv.id}>
                    <td><div>{l.inv.nome}</div><div className="text-xs text-muted">{CATEGORIA_LABEL[l.inv.categoria]}{l.inv.instituicao ? ` · ${l.inv.instituicao}` : ''}{l.inv.situacao !== 'ativo' && <> · <Tag s={l.inv.situacao} title="ativos a revisar não bloqueiam o fechamento" /></>}</div>
                      {outras.length > 0 && <div className="text-xs text-muted">{outras.length} mov. detalhada(s): {outras.map((m) => <span key={m.id}>{m.tipo} {fmtBRL(m.valor ?? 0)} <button className="underline" onClick={() => setExcluir((x) => [...x, m.id])} title="remover">×</button>; </span>)}</div>}
                    </td>
                    <td className="text-right"><Valor v={pa?.saldo} vazio="—" />{qAnt != null && <div className="text-xs text-muted">{fmtQtd(qAnt)} un.</div>}</td>
                    <td><input className="input-cell w-28" inputMode="decimal" value={l.aplicacao} onChange={(e) => setL(l.inv.id, { aplicacao: e.target.value })} placeholder="0,00" aria-label={`Aplicações ${l.inv.nome}`} /></td>
                    <td><input className="input-cell w-28" inputMode="decimal" value={l.resgate} onChange={(e) => setL(l.inv.id, { resgate: e.target.value })} placeholder="0,00" aria-label={`Resgates ${l.inv.nome}`} /></td>
                    <td><select className="input-cell !text-left min-w-28" value={l.origemRecurso} onChange={(e) => setL(l.inv.id, { origemRecurso: e.target.value as OrigemRecurso })} aria-label="Origem do recurso" title="Dinheiro novo vem de uma conta; interno = financiado por outro investimento/reinvestimento"><option value="externo">dinheiro novo</option><option value="interno">interno</option></select></td>
                    <td><input className="input-cell w-24" inputMode="decimal" value={l.provento} onChange={(e) => setL(l.inv.id, { provento: e.target.value })} placeholder="0,00" aria-label={`Proventos ${l.inv.nome}`} /></td>
                    <td><input className="input-cell w-32 font-medium" inputMode="decimal" value={l.saldo} onChange={(e) => setL(l.inv.id, { saldo: e.target.value })} placeholder={pa?.saldo != null ? `ref. ${fmtBRL(pa.saldo)}` : 'em branco = pendente'} aria-label={`Saldo final ${l.inv.nome}`} /></td>
                    <td><input className="input-cell w-20" inputMode="decimal" value={l.quantidade} onChange={(e) => setL(l.inv.id, { quantidade: e.target.value })} placeholder="qtd." aria-label={`Quantidade ${l.inv.nome}`} /></td>
                    <td className="text-center"><input type="checkbox" checked={l.encerrar} onChange={(e) => setL(l.inv.id, { encerrar: e.target.checked })} aria-label={`Encerrar ${l.inv.nome}`} title="Totalmente vendido/resgatado neste mês (saldo final 0)" /></td>
                    <td><input className="input-cell !text-left w-36" value={l.obs} onChange={(e) => setL(l.inv.id, { obs: e.target.value })} aria-label="Observações" /></td>
                  </tr>
                )
              })}
              {linhas.length === 0 && <tr><td colSpan={10} className="text-sm text-muted py-4 text-center">Nenhum ativo vigente neste mês. Adicione um ativo existente ou cadastre um novo.</td></tr>}
              <tr className="font-semibold"><td>Soma dos saldos informados</td><td></td><td></td><td></td><td></td><td></td><td className="text-right"><Valor v={linhas.length ? somaSaldos : null} /></td><td colSpan={3} className="text-xs text-muted font-normal">{semSaldo.length ? `${semSaldo.length} ativo(s) sem saldo` : ''}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 mt-3">
          <Campo rotulo="Total consolidado da carteira (opcional)" dica="use quando só souber o total, sem detalhar os ativos"><input className="input" inputMode="decimal" value={totalCarteira} onChange={(e) => setTotalCarteira(e.target.value)} placeholder={consol && consol.origem !== 'manual' ? `importado: ${fmtBRL(consol.saldo)} (${consol.origem})` : 'R$'} /></Campo>
          <div className="text-xs text-muted self-end pb-2">{consol && consol.origem !== 'manual' && <>Este mês já tem total consolidado importado ({consol.origem}). Informar um valor aqui substitui o total usado nos cálculos e fica registrado como correção.</>}</div>
        </div>
      </Card>

      <Card title="Fluxo do mês e movimentações" subtitle="Dinheiro novo que entrou/saiu da carteira. Sem essa informação (ou sem confirmar as movimentações) o resultado não é apurado.">
        <div className="grid sm:grid-cols-3 gap-3">
          <Campo rotulo="Aporte líquido do mês (R$)" dica="+ entrou, − saiu; vazio = usar as movimentações"><input className="input" inputMode="decimal" value={aportesLiq} onChange={(e) => setAportesLiq(e.target.value)} placeholder={fluxo?.origem?.startsWith('financas') ? `Finanças: ${fmtBRL(fluxo.aportesLiquidos ?? 0)}` : ''} /></Campo>
          <Campo rotulo="Proventos do mês (R$)" dica="total, se preferir informar consolidado"><input className="input" inputMode="decimal" value={proventosCons} onChange={(e) => setProventosCons(e.target.value)} /></Campo>
          <label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={movsConf} onChange={(e) => setMovsConf(e.target.checked)} /> Movimentações do mês conferidas (não houve outras além das registradas)</label>
        </div>
        <p className="text-xs text-muted mt-2">Dica: em <Link className="underline" to="/dados#financas">Dados → Finanças</Link> você pode importar o aporte líquido do mês a partir dos lançamentos de investimento/resgate do app Finanças.</p>
      </Card>

      {(base.contas.length > 0 || base.dividas.length > 0) && (
        <Card title="Contas e dívidas" subtitle="Saldos no fechamento do mês (opcional; compõem o patrimônio total).">
          <div className="grid md:grid-cols-2 gap-4">
            {base.contas.filter((c) => c.ativo).length > 0 && <div><div className="label">Contas (dinheiro disponível)</div>{base.contas.filter((c) => c.ativo).map((c) => <div key={c.id} className="flex items-center gap-2 mb-1 text-sm"><span className="flex-1">{c.nome}</span><input className="input-cell w-32" inputMode="decimal" value={contas[c.id] ?? ''} onChange={(e) => setContas({ ...contas, [c.id]: e.target.value })} placeholder="saldo" /></div>)}</div>}
            {base.dividas.filter((d) => d.situacao === 'ativa').length > 0 && <div><div className="label">Dívidas (saldo devedor de minha responsabilidade)</div>{base.dividas.filter((d) => d.situacao === 'ativa').map((d) => <div key={d.id} className="flex items-center gap-2 mb-1 text-sm"><span className="flex-1">{d.nome}</span><input className="input-cell w-32" inputMode="decimal" value={dividas[d.id] ?? ''} onChange={(e) => setDividas({ ...dividas, [d.id]: e.target.value })} placeholder="saldo devedor" /></div>)}</div>}
          </div>
        </Card>
      )}

      <Card title="Conferência">
        {pendencias.length ? <ul className="text-sm tag-warn list-disc pl-5">{pendencias.map((p) => <li key={p}>{p}</li>)}</ul> : <p className="text-sm tag-ok">Dados suficientes para apurar o resultado.</p>}
        {resultadoPrevisto != null && <p className="text-sm mt-2">Resultado previsto do mês: <Valor v={Math.round(resultadoPrevisto * 100) / 100} sinal /> <span className="text-xs text-muted">(saldo final − saldo inicial − aporte líquido)</span></p>}
        {rm.resultado != null && <p className="text-xs text-muted mt-1">Resultado já registrado com os dados salvos: <Valor v={rm.resultado} sinal /></p>}
        <Campo rotulo="Observações do mês" className="mt-3"><textarea className="input" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></Campo>
        <div className="flex flex-wrap gap-2 justify-end mt-3">
          <button className="btn-ghost" disabled={salvando} onClick={() => salvar('rascunho')}>Salvar como rascunho</button>
          <button className="btn-primary" disabled={salvando} onClick={() => setConfirmar(true)}>Confirmar fechamento</button>
        </div>
      </Card>

      <Confirm aberto={confirmar} titulo={`Confirmar fechamento de ${fmtMesAno(ano, mes)}`} confirmar="Confirmar" onCancelar={() => setConfirmar(false)} onConfirmar={() => salvar('confirmado')}
        mensagem={<>As posições informadas passam a <strong>confirmadas</strong>.{pendencias.length > 0 && <> Ainda há pendências: {pendencias.join('; ')}. O mês ficará como <strong>parcial</strong> até que sejam resolvidas.</>}{fech?.status === 'confirmado' && <> Este mês já estava confirmado — as alterações serão registradas como correção histórica.</>}</>} />

      <Modal aberto={addInv} titulo="Adicionar ativo existente ao mês" onFechar={() => setAddInv(false)}>
        {candidatos.length === 0 ? <p className="text-sm text-muted">Todos os investimentos cadastrados já estão na tabela.</p> : (
          <ul className="divide-y" style={{ borderColor: 'var(--border)' }}>{candidatos.map((i) => <li key={i.id} className="flex items-center gap-2 py-2 text-sm"><span className="flex-1">{i.nome} <span className="text-xs text-muted">{CATEGORIA_LABEL[i.categoria]} · <Tag s={i.situacao} /></span></span><button className="btn-ghost !py-1" onClick={() => { setLinhas((ls) => [...ls, { inv: i, saldo: '', quantidade: '', aplicacao: '', resgate: '', provento: '', origemRecurso: 'externo', encerrar: false, obs: '', dataPosicao: ultimoDia(ano, mes) }]); setAddInv(false) }}>Adicionar</button></li>)}</ul>
        )}
      </Modal>
      {novoInv && <InvestimentoForm onFechar={() => setNovoInv(false)} onSalvo={async (inv) => { setNovoInv(false); await recarregar(); setLinhas((ls) => [...ls, { inv, saldo: '', quantidade: '', aplicacao: '', resgate: '', provento: '', origemRecurso: 'externo', encerrar: false, obs: '', dataPosicao: ultimoDia(ano, mes) }]) }} />}
    </div>
  )
}
