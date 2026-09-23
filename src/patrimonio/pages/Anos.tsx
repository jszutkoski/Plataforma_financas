import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useStore } from '@pat/lib/store'
import { Card, Valor, Tag, Vazio, Aviso } from '@pat/components/ui'
import { ResultadoMensalChart } from '@pat/components/charts/Charts'
import { AtivoDetalhe } from '@pat/components/AtivoDetalhe'
import { fmtBRL, fmtData, fmtPct2, fmtQtd, nomeMes, nomeMesCurto } from '@pat/lib/format'
import { CATEGORIA_LABEL, CATEGORIAS, chaveMes, type Investimento } from '@pat-shared/types'
import { resumoAno, linhasAtivosMes, patrimonioEm, quantidadeAte, vigenteNoMes, type LinhaAtivoMes, type ResumoMes } from '@pat-shared/calc'

export function Anos() {
  const { base, ix, anos, ultimo, oculto } = useStore()
  const [params, setParams] = useSearchParams()
  const anoParam = Number(params.get('ano'))
  const ano = anos.includes(anoParam) ? anoParam : (ultimo?.[0] ?? anos.at(-1)!)
  const mesParam = Number(params.get('mes'))
  const mes = mesParam >= 1 && mesParam <= 12 ? mesParam : null
  const [ativoAberto, setAtivoAberto] = useState<Investimento | null>(null)
  const irPara = (a: number, m: number | null) => { const p = new URLSearchParams(); p.set('ano', String(a)); if (m) p.set('mes', String(m)); setParams(p) }

  const ra = useMemo(() => resumoAno(base, ix, ano), [base, ix, ano])
  const idx = anos.indexOf(ano)

  // tabela anual: ativos × meses
  const tabela = useMemo(() => {
    const linhasPorMes = ra.meses.map((m) => linhasAtivosMes(base, ix, ano, m.mes))
    const invs = new Map<string, Investimento>()
    for (const ls of linhasPorMes) for (const l of ls) if (l.posicao || l.movimentacoes.length || (l.quantidadeFinal != null && l.quantidadeFinal !== 0) || (l.quantidadeInicial != null && l.quantidadeInicial !== 0) || l.situacao === 'pendente' || l.situacao === 'sem_avaliacao') invs.set(l.inv.id, l.inv)
    const cats = CATEGORIAS.filter((c) => [...invs.values()].some((i) => i.categoria === c) || ra.meses.some((m) => (ix.consCategoria.get(chaveMes(ano, m.mes)) ?? []).some((x) => x.categoria === c)))
    const extraCats = ra.meses.flatMap((m) => (ix.consCategoria.get(chaveMes(ano, m.mes)) ?? []).map((x) => x.categoria)).filter((c) => c && !cats.includes(c as never)) as string[]
    return { linhasPorMes, invs: [...invs.values()].sort((a, b) => a.nome.localeCompare(b.nome)), cats: [...cats, ...new Set(extraCats)] }
  }, [base, ix, ano, ra])

  const patr = useMemo(() => ra.meses.map((m) => patrimonioEm(base, ix, ano, m.mes)), [base, ix, ano, ra])

  return (
    <div className="space-y-4">
      <div className="card p-2 flex flex-wrap items-center gap-2">
        <button className="btn-ghost !px-2 !py-1" onClick={() => idx > 0 && irPara(anos[idx - 1], null)} disabled={idx <= 0} aria-label="Ano anterior">‹</button>
        <div className="flex gap-1 flex-wrap" role="tablist">
          {anos.map((a) => <button key={a} role="tab" aria-selected={a === ano} onClick={() => irPara(a, null)} className={`rounded-md px-3 py-1 text-sm font-medium ${a === ano ? 'bg-renda text-white' : 'bg-surface-2 text-ink hover:bg-renda/15'}`}>{a}</button>)}
        </div>
        <button className="btn-ghost !px-2 !py-1" onClick={() => idx < anos.length - 1 && irPara(anos[idx + 1], null)} disabled={idx >= anos.length - 1} aria-label="Próximo ano">›</button>
        <Link to={`/atualizar?ano=${ano}${mes ? `&mes=${mes}` : ''}`} className="btn-primary ml-auto !py-1">Atualizar mês</Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <Resumo rotulo={`Carteira no fim${ra.carteiraFim && ra.carteiraFim.mes !== 12 ? ` (${nomeMesCurto(ra.carteiraFim.mes)})` : ''}`} v={ra.carteiraFim?.valor ?? null} vazio="sem fechamento" />
        <Resumo rotulo="Aportes (dinheiro novo)" v={ra.aportes || null} />
        <Resumo rotulo="Resgates" v={ra.resgates || null} />
        <Resumo rotulo="Proventos" v={ra.proventos || null} />
        <Resumo rotulo={`Resultado apurado (${ra.mesesComResultado} m.)`} v={ra.resultado} sinal vazio="dados insuficientes" />
        <div className="card p-4 min-w-0"><div className="text-xs text-ink-2">Rentabilidade no ano</div><div className="text-lg font-semibold mt-1 tnum">{ra.rentabilidade != null ? fmtPct2(ra.rentabilidade) : <span className="text-sm text-muted">dados insuficientes</span>}</div><div className="text-xs text-muted mt-0.5">{ra.rentabilidade != null ? 'meses encadeados (não somados)' : `${ra.mesesComResultado}/12 meses com resultado`}</div></div>
      </div>

      <Card title={`Meses de ${ano}`} subtitle="Saldo no fechamento, fluxos e resultado apurado de cada mês. Clique num mês para ver os ativos.">
        <ul className="sm:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
          {ra.meses.map((m) => (
            <li key={m.mes} className={`py-2 ${m.mes === mes ? 'bg-renda/10 -mx-2 px-2 rounded' : ''}`} onClick={() => irPara(ano, m.mes)}>
              <div className="flex items-center justify-between"><span className="font-medium">{nomeMes(m.mes)}</span><Tag s={m.situacao} /></div>
              <div className="flex justify-between text-sm"><span className="text-muted">Saldo</span><Valor v={m.saldoFinal} vazio="—" /></div>
              <div className="flex justify-between text-sm"><span className="text-muted">Aporte líquido</span><Valor v={m.aportesLiquidos} sinal vazio="—" /></div>
              <div className="flex justify-between text-sm"><span className="text-muted">Resultado</span><span><Valor v={m.resultado} sinal vazio="—" />{m.rentabilidade != null && <span className="text-xs text-muted"> {fmtPct2(m.rentabilidade)}</span>}</span></div>
            </li>
          ))}
        </ul>
        <div className="overflow-x-auto hidden sm:block">
          <table className="data">
            <thead><tr><th>Mês</th><th className="text-right">Saldo no fechamento</th><th className="text-right">Aplicações/compras</th><th className="text-right">Resgates/vendas</th><th className="text-right">Proventos</th><th className="text-right">Resultado</th><th className="text-right">Rentab.</th><th className="text-right">Patrimônio total</th><th>Situação</th></tr></thead>
            <tbody>
              {ra.meses.map((m, i) => (
                <tr key={m.mes} className={m.mes === mes ? 'bg-renda/10' : ''} onClick={() => irPara(ano, m.mes)} style={{ cursor: 'pointer' }}>
                  <td className="font-medium">{nomeMes(m.mes)}</td>
                  <td className="text-right"><Valor v={m.saldoFinal} vazio="—" />{m.saldoFinalInfo.situacao === 'estimada' && <span className="text-xs text-muted" title="data da atualização não registrada"> ~</span>}</td>
                  <td className="text-right"><Valor v={m.aportes} vazio="—" />{!m.aportesBrutos && m.aportesLiquidos != null && <span className="text-xs text-muted" title="só o líquido é conhecido"> (líq.)</span>}</td>
                  <td className="text-right"><Valor v={m.resgates} vazio="—" /></td>
                  <td className="text-right"><Valor v={m.proventos} vazio="—" />{m.proventosSituacao === 'estimado' && <span className="text-xs text-muted" title="valor estimado"> ~</span>}</td>
                  <td className="text-right"><Valor v={m.resultado} sinal vazio="—" /></td>
                  <td className="text-right tnum text-xs">{m.rentabilidade != null ? fmtPct2(m.rentabilidade) : '—'}</td>
                  <td className="text-right"><Valor v={patr[i].bruto != null && (patr[i].cobertura.bens || patr[i].cobertura.contas || patr[i].cobertura.dividas) ? patr[i].liquido : null} vazio="—" /></td>
                  <td><Tag s={m.situacao} title={m.pendencias.join('; ')} />{m.fechamento && <> <Tag s={m.fechamento.status} /></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3"><ResultadoMensalChart meses={ra.meses} /></div>
      </Card>

      <Card title="Tabela anual — ativos × meses" subtitle="Saldo de cada ativo no fechamento de cada mês. Célula vazia = sem registro. Quando só a quantidade é conhecida, ela aparece entre colchetes (sem avaliação). Clique numa célula para abrir o mês.">
        {tabela.invs.length === 0 && !ra.meses.some((m) => m.saldoFinal != null) ? <Vazio>Nenhum ativo ou posição registrada em {ano}.</Vazio> : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="data whitespace-nowrap">
              <thead className="sticky">
                <tr><th className="sticky-col min-w-[180px]">Ativo</th>{ra.meses.map((m) => <th key={m.mes} className="text-right min-w-[92px]">{nomeMesCurto(m.mes)}</th>)}</tr>
              </thead>
              <tbody>
                {tabela.cats.map((cat) => {
                  const invsCat = tabela.invs.filter((i) => i.categoria === cat)
                  const consol = ra.meses.map((m) => (ix.consCategoria.get(chaveMes(ano, m.mes)) ?? []).find((x) => x.categoria === cat) ?? null)
                  if (!invsCat.length && !consol.some(Boolean)) return null
                  return [
                    <tr key={cat + '-h'}><td className="sticky-col text-xs font-semibold text-muted uppercase" colSpan={13}>{CATEGORIA_LABEL[cat as keyof typeof CATEGORIA_LABEL] ?? cat}</td></tr>,
                    ...invsCat.map((inv) => (
                      <tr key={inv.id}>
                        <td className="sticky-col"><button className="underline decoration-dotted text-left" onClick={() => setAtivoAberto(inv)}>{inv.nome}</button>{inv.situacao === 'revisar' && <span className="tag-bad text-xs"> ⚠</span>}</td>
                        {ra.meses.map((m, i) => { const l = tabela.linhasPorMes[i].find((x) => x.inv.id === inv.id); return <td key={m.mes} className="text-right"><Celula l={l ?? null} onClick={() => irPara(ano, m.mes)} oculto={oculto} /></td> })}
                      </tr>
                    )),
                    consol.some(Boolean) && <tr key={cat + '-c'} className="text-xs">
                      <td className="sticky-col text-muted italic">Total da categoria (informado)</td>
                      {consol.map((c, i) => <td key={i} className="text-right"><Valor v={c?.saldo ?? null} vazio="" /></td>)}
                    </tr>,
                  ]
                })}
                <tr className="font-semibold">
                  <td className="sticky-col">Total da carteira</td>
                  {ra.meses.map((m) => <td key={m.mes} className="text-right"><button className="cell-btn" onClick={() => irPara(ano, m.mes)}><Valor v={m.saldoFinal} vazio="—" />{m.saldoFinalInfo.fonte === 'consolidado' && <span className="text-xs text-muted font-normal" title="total consolidado informado"> ¹</span>}</button></td>)}
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted mt-2">¹ total consolidado informado para o mês (não é a soma das linhas acima). Isso acontece quando só se conhece o total da carteira, sem o valor de mercado de cada ativo.</p>
      </Card>

      {mes ? <MesDetalhe ano={ano} mes={mes} resumo={ra.meses[mes - 1]} linhas={tabela.linhasPorMes[mes - 1]} onAtivo={setAtivoAberto} /> : <Aviso>Selecione um mês acima para ver os ativos que você possuía, saldos, aplicações e resgates.</Aviso>}

      {ativoAberto && <AtivoDetalhe inv={ativoAberto} onFechar={() => setAtivoAberto(null)} />}
    </div>
  )
}

function Resumo({ rotulo, v, sinal, vazio }: { rotulo: string; v: number | null; sinal?: boolean; vazio?: string }) {
  return <div className="card p-4 min-w-0"><div className="text-xs text-ink-2">{rotulo}</div><div className="text-lg font-semibold mt-1 truncate"><Valor v={v} sinal={sinal} vazio={vazio ?? '—'} /></div></div>
}

function Celula({ l, onClick, oculto }: { l: LinhaAtivoMes | null; onClick: () => void; oculto: boolean }) {
  if (!l) return <span className="text-muted"> </span>
  if (l.saldoFinal != null && (l.posicao || l.situacao === 'encerrado')) return <button className="cell-btn" onClick={onClick} title={`${l.posicao ? l.posicao.situacao : 'encerrado'}${l.posicao?.dataPosicao ? ' · ' + fmtData(l.posicao.dataPosicao) : ''}`}><Valor v={l.saldoFinal} />{l.posicao?.situacao === 'estimada' && <span className="text-muted"> ~</span>}</button>
  if (l.quantidadeFinal != null && l.quantidadeFinal !== 0) return <button className={`cell-btn text-xs text-muted ${oculto ? 'oculto' : ''}`} onClick={onClick} title="quantidade reconstruída dos lançamentos; sem avaliação de mercado neste mês">[{fmtQtd(l.quantidadeFinal)} un.]</button>
  if (l.quantidadeFinal === 0 && l.movimentacoes.length) return <button className="cell-btn text-xs text-muted" onClick={onClick} title="vendido no mês">0 un.</button>
  if (l.situacao === 'sem_avaliacao' && l.capitalLiquido != null && l.capitalLiquido > 0) return <button className={`cell-btn text-xs text-muted ${oculto ? 'oculto' : ''}`} onClick={onClick} title="capital líquido aplicado (compras − resgates); sem avaliação de mercado neste mês">[{fmtBRL(l.capitalLiquido)} aplic.]</button>
  if (l.movimentacoes.length) return <button className="cell-btn text-xs text-muted" onClick={onClick} title="movimentações no mês, sem saldo informado">mov.</button>
  return <button className="cell-btn text-xs text-muted" onClick={onClick} title="sem registro">·</button>
}

function MesDetalhe({ ano, mes, resumo, linhas, onAtivo }: { ano: number; mes: number; resumo: ResumoMes; linhas: LinhaAtivoMes[]; onAtivo: (i: Investimento) => void }) {
  const { base, ix } = useStore()
  const p = patrimonioEm(base, ix, ano, mes)
  const movsSemAtivo = (ix.movPorMes.get(chaveMes(ano, mes)) ?? []).filter((m) => !m.investimentoId)
  const naoVigentes = linhas.filter((l) => !vigenteNoMes(ix, l.inv, ano, mes) && !l.movimentacoes.length && l.saldoFinal == null)
  const visiveis = linhas.filter((l) => !naoVigentes.includes(l))
  return (
    <Card title={`${nomeMes(mes)} de ${ano}`} subtitle={<>Situação: <Tag s={resumo.situacao} />{resumo.fechamento && <> · fechamento <Tag s={resumo.fechamento.status} /></>}{resumo.saldoFinalInfo.dataPosicao && <> · saldo observado em {fmtData(resumo.saldoFinalInfo.dataPosicao)}</>}{resumo.saldoFinalInfo.origem && <> · origem {resumo.saldoFinalInfo.origem}</>}</>}
      actions={<Link to={`/atualizar?ano=${ano}&mes=${mes}`} className="btn-ghost !py-1">Editar este mês</Link>}>
      {resumo.pendencias.length > 0 && <Aviso tipo="alerta"><strong>Pendências:</strong> {resumo.pendencias.join(' · ')}</Aviso>}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 my-3 text-sm">
        <Mini rotulo="Saldo inicial" v={resumo.saldoInicial} /><Mini rotulo="Aplicações" v={resumo.aportes} /><Mini rotulo="Resgates" v={resumo.resgates} /><Mini rotulo="Proventos" v={resumo.proventos} />
        <Mini rotulo="Saldo final" v={resumo.saldoFinal} /><Mini rotulo="Resultado" v={resumo.resultado} sinal /><Mini rotulo="Patrimônio líquido" v={p.cobertura.bens || p.cobertura.contas || p.cobertura.dividas ? p.liquido : null} />
      </div>
      {resumo.ajuste != null && <p className="text-xs text-muted mb-2">Inclui ajuste manual de <Valor v={resumo.ajuste} sinal /> ({ix.fluxos.get(chaveMes(ano, mes))?.ajusteMotivo}).</p>}
      {resumo.aportesFonte === 'consolidado' && <p className="text-xs text-muted mb-2">Aporte líquido informado para o mês inteiro; as compras/vendas por ativo abaixo podem ter sido financiadas dentro da própria carteira e não representam dinheiro novo.</p>}
      <ul className="sm:hidden divide-y" style={{ borderColor: 'var(--border)' }}>
        {visiveis.map((l) => (
          <li key={l.inv.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2"><button className="underline decoration-dotted text-left font-medium" onClick={() => onAtivo(l.inv)}>{l.inv.nome}</button><Tag s={l.situacao} title={l.motivo ?? undefined} /></div>
            <div className="text-xs text-muted">{CATEGORIA_LABEL[l.inv.categoria]}{l.inv.instituicao ? ` · ${l.inv.instituicao}` : ''}{l.quantidadeFinal != null ? ` · ${fmtQtd(l.quantidadeFinal)} un.` : ''}</div>
            <div className="grid grid-cols-2 gap-x-3 text-xs mt-1">
              <span className="text-muted">Saldo inicial</span><Valor v={l.saldoInicial} vazio="—" className="text-right" />
              {l.aplicacoes > 0 && <><span className="text-muted">Aplicações</span><Valor v={l.aplicacoes} className="text-right" /></>}
              {l.resgates > 0 && <><span className="text-muted">Resgates</span><Valor v={l.resgates} className="text-right" /></>}
              {l.proventos > 0 && <><span className="text-muted">Proventos</span><Valor v={l.proventos} className="text-right" /></>}
              <span className="text-muted">Saldo final</span><Valor v={l.saldoFinal} vazio="—" className="text-right" />
              <span className="text-muted">Resultado</span><Valor v={l.resultado} sinal vazio="—" className="text-right" />
            </div>
          </li>
        ))}
        {visiveis.length === 0 && <li><Vazio>Nenhum ativo com posição ou movimentação neste mês.</Vazio></li>}
      </ul>
      <div className="overflow-x-auto hidden sm:block">
        <table className="data whitespace-nowrap">
          <thead><tr><th>Ativo</th><th>Categoria · instituição</th><th className="text-right">Saldo inicial</th><th className="text-right">Aplicações/compras</th><th className="text-right">Resgates/vendas</th><th className="text-right">Proventos</th><th className="text-right">Saldo final</th><th className="text-right">Resultado</th><th className="text-right">Qtd. fim</th><th>Situação</th></tr></thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.inv.id}>
                <td><button className="underline decoration-dotted text-left" onClick={() => onAtivo(l.inv)}>{l.inv.nome}</button>{l.inv.codigo && l.inv.codigo !== l.inv.nome && <span className="text-xs text-muted"> {l.inv.codigo}</span>}</td>
                <td className="text-xs text-muted">{CATEGORIA_LABEL[l.inv.categoria]}{l.inv.instituicao ? ` · ${l.inv.instituicao}` : ''}</td>
                <td className="text-right"><Valor v={l.saldoInicial} vazio="—" /></td>
                <td className="text-right"><Valor v={l.aplicacoes || null} vazio="" /></td>
                <td className="text-right"><Valor v={l.resgates || null} vazio="" /></td>
                <td className="text-right"><Valor v={l.proventos || null} vazio="" /></td>
                <td className="text-right"><Valor v={l.saldoFinal} vazio="—" /></td>
                <td className="text-right"><Valor v={l.resultado} sinal vazio="—" /></td>
                <td className="text-right tnum text-xs">{l.quantidadeFinal != null ? fmtQtd(l.quantidadeFinal) : ''}</td>
                <td><Tag s={l.situacao} title={l.motivo ?? undefined} /></td>
              </tr>
            ))}
            {movsSemAtivo.map((m) => <tr key={m.id} className="text-xs text-muted"><td colSpan={5}>Movimentação sem ativo: {m.tipo} {m.observacoes}</td><td className="text-right"><Valor v={m.valor} /></td><td colSpan={4}><Tag s={m.situacao} /></td></tr>)}
            {visiveis.length === 0 && <tr><td colSpan={10}><Vazio>Nenhum ativo com posição ou movimentação neste mês.</Vazio></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">Resultado por ativo só é apurado quando os saldos inicial e final do ativo são conhecidos (saldo final − inicial − aplicações + resgates + proventos fora da posição − taxas). Nos meses em que só se conhece o total da carteira, o resultado por ativo não é apurado.</p>
    </Card>
  )
}

function Mini({ rotulo, v, sinal }: { rotulo: string; v: number | null; sinal?: boolean }) {
  return <div className="rounded-lg p-2" style={{ background: 'var(--surface-2)' }}><div className="text-xs text-muted">{rotulo}</div><div className="font-medium"><Valor v={v} sinal={sinal} vazio="—" /></div></div>
}

export { quantidadeAte }
