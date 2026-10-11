import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useStore } from '@pat/lib/store'
import { Card, Kpi, Valor, Aviso, Tag } from '@pat/components/ui'
import { EvolucaoChart, Donut, BarrasHorizontais, ComparativoBarras, type PontoSerie } from '@pat/components/charts/Charts'
import { CORES } from '@pat/components/charts/common'
import { fmtData, fmtMesAno, fmtPct2, nomeMes } from '@pat/lib/format'
import { CATEGORIA_LABEL, chaveMes, mesAnterior } from '@pat-shared/types'
import { patrimonioEm, resumoMes, resumoAno, composicaoInvestimentos, listaMeses, seriePatrimonio, type Patrimonio } from '@pat-shared/calc'

const chave = (c: string): [number, number] => [Number(c.slice(0, 4)), Number(c.slice(5, 7))]

export function Dashboard() {
  const { base, ix, meses, ultimo, anos } = useStore()
  const todos = useMemo(() => listaMeses(meses.primeiro, meses.ultimo).map(([a, m]) => chaveMes(a, m)), [meses])
  const refPadrao = ultimo ? chaveMes(ultimo[0], ultimo[1]) : todos.at(-1)!
  const [ref, setRef] = useState(refPadrao)
  const primeiroConsolidado = useMemo(() => { const c = base.posicoesConsolidadas.filter((p) => p.escopo === 'carteira').map((p) => chaveMes(p.ano, p.mes)).sort()[0]; return c && todos.includes(c) ? c : todos[0] }, [base, todos])
  const [de, setDe] = useState(primeiroConsolidado)
  const [ate, setAte] = useState(todos.at(-1)!)
  const [modo, setModo] = useState<'investimentos' | 'total'>('investimentos')
  const [compA, setCompA] = useState<string>(() => { const [a, m] = chave(refPadrao); const [aa, mm] = mesAnterior(a, m); return chaveMes(aa, mm) })
  const [compB, setCompB] = useState<string>(refPadrao)

  const [ano, mes] = chave(ref)
  const p = useMemo(() => patrimonioEm(base, ix, ano, mes), [base, ix, ano, mes])
  const rm = useMemo(() => resumoMes(base, ix, ano, mes), [base, ix, ano, mes])
  const ra = useMemo(() => resumoAno(base, ix, ano), [base, ix, ano])
  const resultadoAno = useMemo(() => { const ms = ra.meses.filter((m) => m.mes <= mes && m.resultado != null); return ms.length ? ms.reduce((s, m) => s + m.resultado!, 0) : null }, [ra, mes])
  const mesesAno = ra.meses.filter((m) => m.mes <= mes && m.resultado != null).length
  const comp = useMemo(() => composicaoInvestimentos(base, ix, ano, mes), [base, ix, ano, mes])

  const serie = useMemo(() => seriePatrimonio(base, ix, de <= ate ? de : ate, de <= ate ? ate : de), [base, ix, de, ate])
  const pontos: PontoSerie[] = useMemo(() => {
    let ultimoInv: number | null = null
    return serie.map((s) => {
      const inv = s.investimentos
      const ref = inv == null && ultimoInv != null ? ultimoInv : null
      if (inv != null) ultimoInv = inv
      return { chave: s.chave, rotulo: s.chave, Investimentos: inv, 'Última posição conhecida': ref, 'Patrimônio líquido': s.liquido, 'Patrimônio bruto': s.bruto, Dívidas: s.dividas || null }
    })
  }, [serie])
  const coberturaMuda = useMemo(() => {
    const out: string[] = []
    let ant: Patrimonio['cobertura'] | null = null
    for (const s of serie) {
      if (ant) {
        if (!ant.bens && s.cobertura.bens) out.push(`${rotulo(s.chave)}: bens passam a compor o patrimônio`)
        if (!ant.contas && s.cobertura.contas) out.push(`${rotulo(s.chave)}: contas passam a compor o patrimônio`)
        if (!ant.dividas && s.cobertura.dividas) out.push(`${rotulo(s.chave)}: dívidas passam a ser descontadas`)
      }
      ant = s.cobertura
    }
    return out
  }, [serie])

  const pA = useMemo(() => patrimonioEm(base, ix, ...chave(compA)), [base, ix, compA])
  const pB = useMemo(() => patrimonioEm(base, ix, ...chave(compB)), [base, ix, compB])

  const faltam = [!base.contas.length && 'contas', !base.bens.length && 'bens (imóveis, veículos…)', !base.dividas.length && 'dívidas'].filter(Boolean) as string[]
  const hoje = new Date()
  const antigo = (hoje.getFullYear() - ano) * 12 + (hoje.getMonth() + 1 - mes) > 2

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-lg font-semibold">Painel do patrimônio</h1>
          <p className="text-xs text-muted">Posição de referência: <strong>{nomeMes(mes)} de {ano}</strong>{p.dataReferencia && <> · última atualização registrada em {fmtData(p.dataReferencia)}</>}</p>
        </div>
        <label className="ml-auto text-xs text-ink-2 flex items-center gap-2">Mês de referência
          <select className="input !w-auto !py-1" value={ref} onChange={(e) => setRef(e.target.value)}>
            {[...todos].reverse().map((c) => <option key={c} value={c}>{rotulo(c)}{meses.comDados.has(c) ? '' : ' (sem registros)'}</option>)}
          </select>
        </label>
      </div>

      {antigo && <Aviso tipo="alerta">A última posição consolidada conhecida é de <strong>{fmtMesAno(ultimo?.[0] ?? ano, ultimo?.[1] ?? mes)}</strong>. Os valores abaixo não foram confirmados hoje — use <Link className="underline" to="/patrimonio/atualizar">Atualizar mês</Link> para registrar posições recentes.</Aviso>}
      {p.defasados.length > 0 && <Aviso tipo="alerta">Saldos repetidos de meses anteriores (não atualizados em {fmtMesAno(ano, mes)}): {p.defasados.map((d) => `${d.nome} (último em ${fmtMesAno(Number(d.desde.slice(0, 4)), Number(d.desde.slice(5, 7)))})`).join('; ')}. Atualize em <Link className="underline" to="/patrimonio/atualizar">Atualizar mês</Link> ou em Bens e dívidas.</Aviso>}
      {faltam.length > 0 && <Aviso>Patrimônio cadastrado <strong>incompleto</strong>: ainda não há {faltam.join(', ')}. O que aparece aqui é só o que foi cadastrado — cadastre em <Link className="underline" to="/patrimonio/bens">Bens e dívidas</Link> e <Link className="underline" to="/patrimonio/bens#contas">Contas</Link>.</Aviso>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Patrimônio bruto cadastrado" valor={p.bruto} cor={CORES.saldo} sub={<>investimentos + contas + participação nos bens</>} />
        <Kpi rotulo="Dívidas cadastradas" valor={p.dividasDetalhe.length ? p.dividas : null} cor={CORES.gastos} vazio="nenhuma cadastrada" sub={p.semValor.dividas ? `${p.semValor.dividas} sem saldo neste mês` : undefined} />
        <Kpi rotulo="Patrimônio líquido cadastrado" valor={p.liquido} cor={CORES.renda} sub="bruto − dívidas de minha responsabilidade" />
        <Kpi rotulo="Total em investimentos" valor={p.investimentos} cor={CORES.invest} sub={p.investimentosInfo.situacao ? <>posição <Tag s={p.investimentosInfo.situacao} />{p.investimentosInfo.fonte === 'consolidado' ? ' · total consolidado' : ' · soma dos ativos'}</> : p.investimentosInfo.faltando.length ? `faltam ${p.investimentosInfo.faltando.length} ativo(s)` : 'sem posição neste mês'} />
        <Kpi rotulo="Dinheiro em contas" valor={p.contas} vazio="não registrado" sub={p.contasDetalhe.length ? `${p.contasDetalhe.length} conta(s)` : undefined} />
        <Kpi rotulo="Imóveis" valor={p.bensDetalhe.some((b) => b.bem.categoria === 'imovel') ? p.imoveis : null} vazio="nenhum cadastrado" sub="minha participação" />
        <Kpi rotulo="Veículos e outros bens" valor={p.bensDetalhe.some((b) => b.bem.categoria !== 'imovel') ? p.veiculos + p.outrosBens : null} vazio="nenhum cadastrado" sub="minha participação" />
        <div className="card p-4 min-w-0">
          <div className="text-xs text-ink-2">Resultado dos investimentos</div>
          <div className="mt-1"><span className="text-xs text-muted">no mês </span><span className="font-semibold"><Valor v={rm.resultado} sinal vazio="dados insuficientes" /></span> {rm.rentabilidade != null && <span className={`text-xs ${rm.rentabilidade >= 0 ? 'text-good' : 'text-bad'}`}>{fmtPct2(rm.rentabilidade)}</span>}</div>
          <div className="mt-0.5"><span className="text-xs text-muted">no ano{mesesAno ? ` (${mesesAno} m.) ` : ' '}</span><span className="font-semibold"><Valor v={resultadoAno} sinal vazio="dados insuficientes" /></span></div>
          <div className="text-xs text-muted mt-1">Δ saldo − aportes + resgates; não é variação do patrimônio total</div>
        </div>
      </div>

      <Card title="Evolução" subtitle="Meses sem fechamento ficam em branco; a linha tracejada repete a última posição conhecida apenas como referência." actions={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select className="input !w-auto !py-1" value={de} onChange={(e) => setDe(e.target.value)} aria-label="De">{todos.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}</select>
          <span className="text-muted">até</span>
          <select className="input !w-auto !py-1" value={ate} onChange={(e) => setAte(e.target.value)} aria-label="Até">{todos.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}</select>
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }} role="tablist">
            <button role="tab" aria-selected={modo === 'investimentos'} className={`px-3 py-1 ${modo === 'investimentos' ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => setModo('investimentos')}>Investimentos</button>
            <button role="tab" aria-selected={modo === 'total'} className={`px-3 py-1 ${modo === 'total' ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => setModo('total')}>Patrimônio total</button>
          </div>
        </div>
      }>
        {modo === 'investimentos'
          ? <EvolucaoChart pontos={pontos} series={[{ key: 'Investimentos', nome: 'Investimentos (fechamento)', cor: CORES.invest }, { key: 'Última posição conhecida', nome: 'Última posição conhecida', cor: CORES.invest, tracejada: true }]} />
          : <EvolucaoChart pontos={pontos} series={[{ key: 'Patrimônio líquido', nome: 'Patrimônio líquido', cor: CORES.saldo }, { key: 'Patrimônio bruto', nome: 'Patrimônio bruto', cor: CORES.renda }, { key: 'Investimentos', nome: 'Investimentos', cor: CORES.invest }, { key: 'Dívidas', nome: 'Dívidas', cor: CORES.gastos }]} />}
        {coberturaMuda.length > 0 && <ul className="text-xs text-muted mt-2 list-disc pl-4">{coberturaMuda.map((c) => <li key={c}>{c} — mudança de cobertura do cadastro, não rendimento.</li>)}</ul>}
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card title="Composição do patrimônio" subtitle={`em ${rotulo(ref)}`}>
          <Donut itens={[
            { nome: 'Investimentos', valor: p.investimentos ?? 0 }, { nome: 'Contas', valor: p.contas ?? 0 }, { nome: 'Imóveis', valor: p.imoveis }, { nome: 'Veículos', valor: p.veiculos }, { nome: 'Outros bens', valor: p.outrosBens },
          ]} />
        </Card>
        <Card title="Investimentos por categoria" subtitle={comp.cobre != null && p.investimentos != null && Math.abs(comp.cobre - p.investimentos) > 0.01 ? `composição conhecida cobre ${fmtPctDe(comp.cobre, p.investimentos)} do total consolidado` : `em ${rotulo(ref)}`}>
          <Donut itens={comp.porCategoria.map((c) => ({ nome: CATEGORIA_LABEL[c.nome as keyof typeof CATEGORIA_LABEL] ?? c.nome, valor: c.valor, nota: c.fonte === 'categoria' ? 'valor informado por categoria, sem detalhe por ativo' : undefined }))} total={p.investimentos ?? undefined} />
          {comp.porCategoria.some((c) => c.fonte === 'categoria') && <p className="text-xs text-muted mt-2">* valor informado por categoria, sem detalhe por ativo.</p>}
        </Card>
        <Card title="Investimentos por instituição" subtitle={`em ${rotulo(ref)} · "Não informada" = sem instituição no cadastro`}>
          <BarrasHorizontais itens={comp.porInstituicao} />
        </Card>
      </div>

      <Card title="Comparar dois períodos" actions={
        <div className="flex items-center gap-2 text-xs">
          <select className="input !w-auto !py-1" value={compA} onChange={(e) => setCompA(e.target.value)} aria-label="Período A">{todos.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}</select>
          <span className="text-muted">×</span>
          <select className="input !w-auto !py-1" value={compB} onChange={(e) => setCompB(e.target.value)} aria-label="Período B">{todos.map((c) => <option key={c} value={c}>{rotulo(c)}</option>)}</select>
        </div>
      }>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Componente</th><th className="text-right">{rotulo(compA)}</th><th className="text-right">{rotulo(compB)}</th><th className="text-right">Diferença</th></tr></thead>
              <tbody>
                {([['Investimentos', pA.investimentos, pB.investimentos], ['Contas', pA.contas, pB.contas], ['Bens (participação)', pA.bensDetalhe.length ? pA.bens : null, pB.bensDetalhe.length ? pB.bens : null], ['Dívidas', pA.dividasDetalhe.length ? pA.dividas : null, pB.dividasDetalhe.length ? pB.dividas : null], ['Patrimônio bruto', pA.bruto, pB.bruto], ['Patrimônio líquido', pA.liquido, pB.liquido]] as [string, number | null, number | null][]).map(([n, a, b]) => (
                  <tr key={n}><td>{n}</td><td className="text-right"><Valor v={a} /></td><td className="text-right"><Valor v={b} /></td><td className="text-right"><Valor v={a != null && b != null ? b - a : null} sinal vazio="—" /></td></tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted mt-2">A diferença entre dois períodos inclui aportes, resgates e mudanças de cobertura do cadastro — não é rendimento. O resultado apurado por mês está em <Link className="underline" to="/patrimonio/anos">Anos</Link>.</p>
          </div>
          <ComparativoBarras series={[{ nome: rotulo(compA), valores: { Investimentos: pA.investimentos, Contas: pA.contas, Bens: pA.bens || null, Dívidas: pA.dividas || null } }, { nome: rotulo(compB), valores: { Investimentos: pB.investimentos, Contas: pB.contas, Bens: pB.bens || null, Dívidas: pB.dividas || null } }]} />
        </div>
      </Card>

      <Card title="Anos" subtitle="Resumo por ano; clique para abrir a visão mensal.">
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Ano</th><th className="text-right">Carteira no fim</th><th className="text-right">Aportes</th><th className="text-right">Resgates</th><th className="text-right">Proventos</th><th className="text-right">Resultado</th><th className="text-right">Rentabilidade</th><th>Meses apurados</th></tr></thead>
            <tbody>
              {anos.map((a) => { const r = resumoAno(base, ix, a); return (
                <tr key={a}>
                  <td><Link className="underline text-renda" to={`/patrimonio/anos?ano=${a}`}>{a}</Link></td>
                  <td className="text-right"><Valor v={r.carteiraFim?.valor} vazio="sem fechamento" />{r.carteiraFim && r.carteiraFim.mes !== 12 && <span className="text-xs text-muted"> ({fmtMesAno(a, r.carteiraFim.mes)})</span>}</td>
                  <td className="text-right"><Valor v={r.aportes || null} /></td><td className="text-right"><Valor v={r.resgates || null} /></td><td className="text-right"><Valor v={r.proventos || null} /></td>
                  <td className="text-right"><Valor v={r.resultado} sinal vazio="—" /></td>
                  <td className="text-right tnum">{r.rentabilidade != null ? fmtPct2(r.rentabilidade) : <span className="text-muted text-xs">{r.mesesComResultado ? 'dados insuficientes' : '—'}</span>}</td>
                  <td className="text-xs text-muted">{r.mesesComResultado}/12</td>
                </tr>) })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}

function rotulo(c: string): string { return fmtMesAno(Number(c.slice(0, 4)), Number(c.slice(5, 7))) }
function fmtPctDe(a: number, b: number): string { return b ? `${Math.round((a / b) * 100)}%` : '—' }
