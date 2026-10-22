import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useStore } from '@fin/lib/store'
import { ultimoMesComDados } from '@fin/lib/analytics'
import { serieCategoria, totaisPorAno } from '@fin/lib/projecao'
import { fmtBRL, fmtPctDelta, nomeMesCurto } from '@fin/lib/format'
import { Card, Campo, Kpi, Vazio } from '@fin/components/ui'
import { TendenciaChart } from '@fin/components/charts/Charts'
import { CORES } from '@fin/components/charts/common'

/** Evolução mensal de uma categoria (ou subcategoria) de despesa. Abre por ?cat=&sub=. */
export function Tendencia() {
  const { lancamentos, categorias } = useStore()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const [n, setN] = useState(24)
  const raizes = useMemo(() => {
    const usadas = new Set(lancamentos.filter((l) => l.tipo === 'despesa' && !l.foraDoFluxo && l.categoria).map((l) => l.categoria!))
    const arvore = categorias.filter((c) => c.tipo === 'despesa' && c.parentId == null).map((c) => c.nome)
    return [...new Set([...arvore, ...usadas])].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [lancamentos, categorias])
  const cat = params.get('cat') && raizes.includes(params.get('cat')!) ? params.get('cat')! : (raizes[0] ?? '')
  const subs = useMemo(() => {
    const s = new Set(lancamentos.filter((l) => l.tipo === 'despesa' && !l.foraDoFluxo && l.categoria === cat && l.subcategoria).map((l) => l.subcategoria!))
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [lancamentos, cat])
  const sub = params.get('sub') && subs.includes(params.get('sub')!) ? params.get('sub')! : null
  const escolher = (c: string, s: string | null) => setParams(s ? { cat: c, sub: s } : { cat: c }, { replace: true })

  const ate = useMemo(() => ultimoMesComDados(lancamentos), [lancamentos])
  const pontos = useMemo(() => (cat ? serieCategoria(lancamentos, cat, sub, ate, n) : []), [lancamentos, cat, sub, ate, n])
  const anos = useMemo(() => (cat ? totaisPorAno(lancamentos, cat, sub) : []), [lancamentos, cat, sub])
  const total = pontos.reduce((s, p) => s + p.valor, 0)
  const media = pontos.length ? total / pontos.length : 0
  const ult3 = pontos.slice(-3)
  const media3 = ult3.length ? ult3.reduce((s, p) => s + p.valor, 0) / ult3.length : 0
  const maior = pontos.reduce<(typeof pontos)[number] | null>((m, p) => (!m || p.valor > m.valor ? p : m), null)
  const abrirMes = (ano: number, mes: number) => nav(`/financas/lancamentos?${new URLSearchParams({ cat, ...(sub ? { sub } : {}), ano: String(ano), mes: String(mes) })}`)

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Tendência por categoria</h1>
      <div className="card p-3 flex flex-wrap items-end gap-3">
        <Campo rotulo="Categoria" className="w-56"><select className="input" value={cat} onChange={(e) => escolher(e.target.value, null)}>{raizes.map((c) => <option key={c}>{c}</option>)}</select></Campo>
        <Campo rotulo="Subcategoria" className="w-56"><select className="input" value={sub ?? ''} onChange={(e) => escolher(cat, e.target.value || null)}><option value="">Todas</option>{subs.map((s) => <option key={s}>{s}</option>)}</select></Campo>
        <div className="ml-auto flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }} role="tablist" aria-label="Período">
          {[12, 24, 36].map((x) => <button key={x} role="tab" aria-selected={n === x} className={`px-3 py-1.5 text-sm ${n === x ? 'bg-renda text-white' : 'text-ink-2 hover:bg-surface-2'}`} onClick={() => setN(x)}>{x} meses</button>)}
        </div>
      </div>
      {!cat || total === 0 ? <Card><Vazio>Sem gastos {sub ? `em ${cat} › ${sub}` : cat ? `em ${cat}` : ''} nos últimos {n} meses.</Vazio></Card> : (<>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi rotulo={`Média mensal (${n} meses)`} valor={media} cor={CORES.gastos} />
          <Kpi rotulo="Média dos últimos 3 meses" valor={media3} cor={CORES.saldo} delta={media ? (media3 - media) / media : null} deltaRotulo="vs. média do período" invertido />
          <Kpi rotulo={`Total em ${n} meses`} valor={total} cor={CORES.gastos} />
          <Kpi rotulo="Maior mês" valor={maior?.valor ?? 0} cor={CORES.gastos} sub={maior ? `${nomeMesCurto(maior.mes)}/${maior.ano}` : undefined} />
        </div>
        <Card title={sub ? `${cat} › ${sub}` : cat} subtitle={`Até ${nomeMesCurto(ate.mes)}/${ate.ano} · clique em um mês para ver os lançamentos`}>
          <TendenciaChart pontos={pontos} onClickMes={abrirMes} />
        </Card>
        <Card title="Por ano" subtitle="Todos os anos com dados; anos incompletos têm média sobre os meses com gasto">
          <table className="data">
            <thead><tr><th>Ano</th><th className="text-right">Total</th><th className="text-right">Meses com gasto</th><th className="text-right">Média/mês</th><th className="text-right">vs. ano anterior</th></tr></thead>
            <tbody>{anos.map((a, i) => { const ant = anos[i - 1]; const m = a.total / a.meses; const mAnt = ant ? ant.total / ant.meses : null; return (
              <tr key={a.ano}><td>{a.ano}</td><td className="text-right tnum">{fmtBRL(a.total)}</td><td className="text-right tnum">{a.meses}</td><td className="text-right tnum">{fmtBRL(m)}</td>
                <td className={`text-right tnum ${mAnt == null ? 'text-muted' : m > mAnt ? 'text-bad' : 'text-good'}`}>{mAnt ? fmtPctDelta((m - mAnt) / mAnt) : '—'}</td></tr>) })}</tbody>
          </table>
        </Card>
      </>)}
    </div>
  )
}
