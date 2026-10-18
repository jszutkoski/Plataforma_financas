import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useStore } from '@fin/lib/store'
import { usePeriodo } from '@fin/lib/periodo'
import { anosDisponiveis, mesesComDados, resumoMes, mesAnterior, mediaAnteriores, gastosPorCategoria, gastosPorCategoriaAno, evolucaoDiaria, variacaoCategorias, descricaoMensal, resumoAno, despesasIncomuns } from '@fin/lib/analytics'
import { fmtBRL, fmtPct, fmtPctDelta, competencia, nomeMes, nomeMesCurto, fmtData } from '@fin/lib/format'
import { PeriodoSelector } from '@fin/components/PeriodoSelector'
import { Card, Kpi, Vazio } from '@fin/components/ui'
import { CategoriasBarras, DiarioChart, SaldoMesChart, ComparativoChart, GruposDonut, MesesChart, AcumuladoChart, AnosChart } from '@fin/components/charts/Charts'
import { CORES } from '@fin/components/charts/common'
import { LancamentoForm } from '@fin/components/LancamentoForm'

export function Dashboard() {
  const { lancamentos } = useStore()
  const p = usePeriodo()
  const anos = useMemo(() => anosDisponiveis(lancamentos), [lancamentos])
  const meses = useMemo(() => mesesComDados(lancamentos, p.ano), [lancamentos, p.ano])
  const [novo, setNovo] = useState(false)
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{p.modo === 'mensal' ? competencia(p.ano, p.mes) : `Ano de ${p.ano}`}</h1>
        <button className="btn-primary" onClick={() => setNovo(true)}>+ Lançamento</button>
      </div>
      <PeriodoSelector anos={anos} ano={p.ano} mes={p.modo === 'mensal' ? p.mes : null} mesesComDados={meses} onAno={p.setAno} onMes={(m) => m && p.setMes(m)} modo={p.modo} onModo={p.setModo} />
      {p.modo === 'mensal' ? <Mensal /> : <Anual />}
      <LancamentoForm aberto={novo} onFechar={() => setNovo(false)} base={{ data: `${p.ano}-${String(p.mes).padStart(2, '0')}-01` }} />
    </div>
  )
}

const delta = (a: number, b: number | undefined | null) => (b && b !== 0 ? (a - b) / Math.abs(b) : null)

function Mensal() {
  const { lancamentos: L } = useStore()
  const { ano, mes } = usePeriodo()
  const nav = useNavigate()
  const r = useMemo(() => resumoMes(L, ano, mes), [L, ano, mes])
  const ant = useMemo(() => { const m = mesAnterior(ano, mes); return resumoMes(L, m.ano, m.mes) }, [L, ano, mes])
  const { media, meses: nMedia } = useMemo(() => mediaAnteriores(L, ano, mes), [L, ano, mes])
  const cats = useMemo(() => gastosPorCategoria(L, ano, mes, 'categoria'), [L, ano, mes])
  const [catSel, setCatSel] = useState<string | null>(null)
  const subs = useMemo(() => (catSel ? gastosPorCategoria(L, ano, mes, 'subcategoria', catSel) : []), [L, ano, mes, catSel])
  const diario = useMemo(() => evolucaoDiaria(L, ano, mes), [L, ano, mes])
  const variacoes = useMemo(() => variacaoCategorias(L, ano, mes, 'subcategoria').filter((v) => Math.abs(v.delta) >= 1), [L, ano, mes])
  const texto = useMemo(() => descricaoMensal(L, ano, mes), [L, ano, mes])
  const incomuns = useMemo(() => despesasIncomuns(L, ano, mes, r.renda), [L, ano, mes, r.renda])
  const prevNome = `vs. ${nomeMesCurto(mesAnterior(ano, mes).mes)}`

  if (!r.temDados) return <Card><Vazio>Nenhum lançamento em {competencia(ano, mes)}. Adicione um lançamento ou escolha outro mês.</Vazio></Card>

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi rotulo="Renda líquida" valor={r.renda} cor={CORES.renda} delta={ant.temDados ? delta(r.renda, ant.renda) : null} deltaRotulo={prevNome} sub={r.deducoes ? `bruta ${fmtBRL(r.receitaBruta)} − descontos ${fmtBRL(r.deducoes)}` : undefined} />
        <Kpi rotulo="Gastos totais" valor={r.gastos} cor={CORES.gastos} delta={ant.temDados ? delta(r.gastos, ant.gastos) : null} deltaRotulo={prevNome} invertido sub={`${fmtPct(r.pctComprometido)} da renda`} />
        <Kpi rotulo="Aportes em investimentos" valor={r.aportes} cor={CORES.invest} sub={`${fmtPct(r.pctInvestido)} da renda${r.resgates ? ` · resgates ${fmtBRL(r.resgates)}` : ''}`} />
        <Kpi rotulo="Saldo do mês" valor={r.saldo} cor={CORES.saldo} delta={ant.temDados ? delta(r.saldo, ant.saldo) : null} deltaRotulo={prevNome} sub="renda − gastos − aportes + resgates" />
        <div className="card p-4 col-span-2 lg:col-span-1">
          <div className="text-xs text-ink-2">Comparações</div>
          <dl className="mt-1 text-xs space-y-1">
            <div className="flex justify-between gap-2"><dt className="text-muted">Gastos {prevNome}</dt><dd className={`tnum ${r.gastos <= ant.gastos ? 'text-good' : 'text-bad'}`}>{ant.temDados ? fmtPctDelta(delta(r.gastos, ant.gastos) ?? 0) : '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Gastos vs. média ({nMedia} m.)</dt><dd className={`tnum ${media && r.gastos <= media.gastos ? 'text-good' : 'text-bad'}`}>{media ? fmtPctDelta(delta(r.gastos, media.gastos) ?? 0) : '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Renda vs. média</dt><dd className="tnum">{media ? fmtPctDelta(delta(r.renda, media.renda) ?? 0) : '—'}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-muted">Saldo médio anterior</dt><dd className="tnum">{media ? fmtBRL(media.saldo) : '—'}</dd></div>
          </dl>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title={catSel ? `Subcategorias de ${catSel}` : 'Gastos por categoria'} subtitle={catSel ? 'Clique em voltar para ver todas as categorias' : 'Clique em uma barra para detalhar'} actions={catSel && <button className="btn-ghost !py-1 text-xs" onClick={() => setCatSel(null)}>← voltar</button>}>
          <CategoriasBarras itens={catSel ? subs : cats} total={r.gastos} onClick={catSel ? undefined : setCatSel} />
        </Card>
        <Card title="Renda, gastos e investimentos" subtitle="Média dos meses anteriores, mês anterior e mês atual">
          <ComparativoChart series={[{ nome: `Média ${nMedia}m`, r: media }, { nome: nomeMesCurto(mesAnterior(ano, mes).mes), r: ant.temDados ? ant : null }, { nome: nomeMesCurto(mes), r }]} />
        </Card>
      </div>

      <Card title="Resumo do mês" subtitle="Descrição gerada a partir dos números registrados">
        <div className="text-sm leading-relaxed space-y-2 text-ink-2">{texto.map((t, i) => <p key={i}>{t}</p>)}</div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Evolução diária dos gastos" subtitle="Somente lançamentos com data no mês; acumulado inclui os totais consolidados">
          <DiarioChart pontos={diario} />
        </Card>
        <Card title="Saldo ao longo do mês" subtitle="Renda, descontos e aportes sem dia entram no dia 1">
          <SaldoMesChart pontos={diario} />
        </Card>
        <Card title="Fixas × variáveis" subtitle="Gastos por natureza: Fixas (recorrentes e previsíveis) × Variáveis, Extras e Adicionais">
          <GruposDonut porGrupo={r.porGrupo} total={r.gastos} />
        </Card>
        <Card title="Categorias que mais variaram" subtitle={`Em relação a ${nomeMes(mesAnterior(ano, mes).mes)}`}>
          {!ant.temDados ? <Vazio>Sem dados do mês anterior.</Vazio> : (
            <table className="data">
              <thead><tr><th>Subcategoria</th><th className="text-right">Anterior</th><th className="text-right">Atual</th><th className="text-right">Variação</th></tr></thead>
              <tbody>
                {[...variacoes.slice(0, 5), ...variacoes.slice(5).slice(-4).filter((v) => v.delta < 0)].map((v) => (
                  <tr key={v.nome}><td>{v.nome}</td><td className="text-right tnum text-muted">{fmtBRL(v.anterior)}</td><td className="text-right tnum">{fmtBRL(v.atual)}</td>
                    <td className={`text-right tnum ${v.delta > 0 ? 'text-bad' : 'text-good'}`}>{v.delta > 0 ? '+' : ''}{fmtBRL(v.delta)}{v.pct != null && <span className="text-muted text-xs"> ({fmtPctDelta(v.pct)})</span>}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {incomuns.length > 0 && (
        <Card title="Despesas fora do padrão" subtitle="Acima de 8% da renda do mês ou 3× a mediana histórica da subcategoria">
          <ul className="text-sm divide-y" style={{ borderColor: 'var(--grid)' }}>
            {incomuns.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-1.5 cursor-pointer hover:bg-surface-2 rounded px-1" onClick={() => nav(`/financas/lancamentos?id=${l.id}`)}>
                <span className="text-muted text-xs w-12 tnum">{fmtData(l.data).slice(0, 5)}</span><span className="flex-1 truncate">{l.descricao}</span>
                <span className="chip">{l.subcategoria ?? l.categoria}</span><span className="tnum font-medium">{fmtBRL(l.valor)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}

function Anual() {
  const { lancamentos: L } = useStore()
  const { ano, irPara } = usePeriodo()
  const ra = useMemo(() => resumoAno(L, ano), [L, ano])
  const anos = useMemo(() => anosDisponiveis(L), [L])
  const cats = useMemo(() => gastosPorCategoriaAno(L, ano, 'categoria'), [L, ano])
  const subs = useMemo(() => gastosPorCategoriaAno(L, ano, 'subcategoria'), [L, ano])
  const comparacao = useMemo(() => anos.map((a) => { const r = resumoAno(L, a); return { ano: a, Renda: r.totais.renda, Gastos: r.totais.gastos, Investimentos: r.totais.aportes, meses: r.mesesComDados, mediaGastos: r.medias.gastos, mediaRenda: r.medias.renda } }), [L, anos])
  const anterior = useMemo(() => (anos.includes(ano - 1) ? resumoAno(L, ano - 1) : null), [L, anos, ano])
  if (!ra.mesesComDados) return <Card><Vazio>Nenhum lançamento em {ano}.</Vazio></Card>
  const t = ra.totais
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo={`Renda líquida (${ra.mesesComDados} meses)`} valor={t.renda} cor={CORES.renda} sub={`média ${fmtBRL(ra.medias.renda)}/mês`} delta={anterior ? delta(ra.medias.renda, anterior.medias.renda) : null} deltaRotulo={`média vs. ${ano - 1}`} />
        <Kpi rotulo="Gastos" valor={t.gastos} cor={CORES.gastos} sub={`média ${fmtBRL(ra.medias.gastos)}/mês · ${fmtPct(t.renda ? t.gastos / t.renda : 0)} da renda`} delta={anterior ? delta(ra.medias.gastos, anterior.medias.gastos) : null} deltaRotulo={`média vs. ${ano - 1}`} invertido />
        <Kpi rotulo="Investimentos" valor={t.aportes} cor={CORES.invest} sub={`${fmtPct(t.renda ? t.aportes / t.renda : 0)} da renda${t.resgates ? ` · resgates ${fmtBRL(t.resgates)}` : ''}`} />
        <Kpi rotulo="Saldo acumulado" valor={t.saldo} cor={CORES.saldo} sub={`média ${fmtBRL(ra.medias.saldo)}/mês`} />
      </div>
      <Card title="Mês a mês" subtitle="Clique em um mês para abrir a visão mensal">
        <MesesChart meses={ra.meses} onClickMes={(m) => irPara(ano, m)} />
        <div className="overflow-x-auto mt-3">
          <table className="data min-w-[720px]">
            <thead><tr><th>Mês</th><th className="text-right">Renda</th><th className="text-right">Gastos</th><th className="text-right">Fixas</th><th className="text-right">Variáveis</th><th className="text-right">Investimentos</th><th className="text-right">Resgates</th><th className="text-right">Saldo</th><th className="text-right">% comprometido</th></tr></thead>
            <tbody>
              {ra.meses.map((m) => (
                <tr key={m.mes} className={m.temDados ? 'cursor-pointer' : 'text-muted'} onClick={() => m.temDados && irPara(ano, m.mes)}>
                  <td>{nomeMes(m.mes)}</td>
                  {m.temDados ? (<>
                    <td className="text-right tnum">{fmtBRL(m.renda)}</td><td className="text-right tnum">{fmtBRL(m.gastos)}</td>
                    <td className="text-right tnum text-muted">{fmtBRL(m.porGrupo.Fixas)}</td><td className="text-right tnum text-muted">{fmtBRL((m.porGrupo['Variáveis'] ?? 0) + (m.porGrupo.Extras ?? 0) + (m.porGrupo.Adicionais ?? 0))}</td>
                    <td className="text-right tnum">{fmtBRL(m.aportes)}</td><td className="text-right tnum">{m.resgates ? fmtBRL(m.resgates) : '—'}</td>
                    <td className={`text-right tnum font-medium ${m.saldo < 0 ? 'text-bad' : ''}`}>{fmtBRL(m.saldo)}</td><td className="text-right tnum">{fmtPct(m.pctComprometido)}</td>
                  </>) : <td colSpan={8} className="text-xs">sem lançamentos</td>}
                </tr>
              ))}
              <tr className="font-semibold"><td>Total</td><td className="text-right tnum">{fmtBRL(t.renda)}</td><td className="text-right tnum">{fmtBRL(t.gastos)}</td><td className="text-right tnum">{fmtBRL(t.porGrupo.Fixas)}</td><td className="text-right tnum">{fmtBRL(t.gastos - t.porGrupo.Fixas)}</td><td className="text-right tnum">{fmtBRL(t.aportes)}</td><td className="text-right tnum">{fmtBRL(t.resgates)}</td><td className="text-right tnum">{fmtBRL(t.saldo)}</td><td className="text-right tnum">{fmtPct(t.renda ? t.gastos / t.renda : 0)}</td></tr>
              <tr className="text-muted"><td>Média mensal</td><td className="text-right tnum">{fmtBRL(ra.medias.renda)}</td><td className="text-right tnum">{fmtBRL(ra.medias.gastos)}</td><td /><td /><td className="text-right tnum">{fmtBRL(ra.medias.aportes)}</td><td /><td className="text-right tnum">{fmtBRL(ra.medias.saldo)}</td><td /></tr>
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Evolução acumulada no ano"><AcumuladoChart meses={ra.meses} /></Card>
        <Card title="Categorias com maior impacto no ano"><CategoriasBarras itens={cats} total={t.gastos} max={8} /></Card>
        <Card title="Subcategorias com maior impacto no ano"><CategoriasBarras itens={subs} total={t.gastos} max={10} /></Card>
        <Card title="Comparação entre anos" subtitle="Totais do ano; anos incompletos indicados pela quantidade de meses">
          {anos.length < 2 ? <Vazio>Apenas um ano com dados.</Vazio> : (<>
            <AnosChart dados={comparacao} />
            <table className="data mt-2"><thead><tr><th>Ano</th><th className="text-right">Meses</th><th className="text-right">Renda média/mês</th><th className="text-right">Gastos médios/mês</th></tr></thead>
              <tbody>{comparacao.map((c) => <tr key={c.ano} className={c.ano === ano ? 'font-semibold' : ''}><td>{c.ano}</td><td className="text-right tnum">{c.meses}</td><td className="text-right tnum">{fmtBRL(c.mediaRenda)}</td><td className="text-right tnum">{fmtBRL(c.mediaGastos)}</td></tr>)}</tbody></table>
          </>)}
        </Card>
      </div>
    </>
  )
}
