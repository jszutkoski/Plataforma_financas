import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { AjusteProjecao } from '@fin-shared/types'
import { MESES } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { projetar } from '@fin/lib/projecao'
import { fmtBRL, nomeMesCurto, parseValorBR } from '@fin/lib/format'
import { Card, Campo, Confirm, Kpi, Modal, Vazio } from '@fin/components/ui'
import { ProjecaoChart } from '@fin/components/charts/Charts'
import { CORES } from '@fin/components/charts/common'

interface FormAjuste { id?: string; chave: string; descricao: string; valor: string; sentido: 'entra' | 'sai' }

export function Projecao() {
  const { lancamentos, recorrencias, aviso } = useStore()
  const [nMeses, setNMeses] = useState(6)
  const [ajustes, setAjustes] = useState<AjusteProjecao[]>([])
  const carregarAjustes = useCallback(async () => { try { setAjustes(await api.ajustesProjecao()) } catch (e) { aviso((e as Error).message, 'erro') } }, [aviso])
  useEffect(() => { void carregarAjustes() }, [carregarAjustes])

  const p = useMemo(() => projetar(lancamentos, recorrencias, ajustes, { meses: nMeses }), [lancamentos, recorrencias, ajustes, nMeses])
  const ultimo = p.meses.at(-1)
  const media = (f: (m: (typeof p.meses)[number]) => number) => p.meses.reduce((s, m) => s + f(m), 0) / (p.meses.length || 1)
  const ajustesForaDoPeriodo = ajustes.filter((a) => !p.meses.some((m) => m.ano === a.ano && m.mes === a.mes))

  const [form, setForm] = useState<FormAjuste | null>(null)
  const [excluir, setExcluir] = useState<AjusteProjecao | null>(null)
  const chaveDe = (ano: number, mes: number) => `${ano}-${String(mes).padStart(2, '0')}`
  const abrir = (a: AjusteProjecao | null, chave?: string) => setForm(a
    ? { id: a.id, chave: chaveDe(a.ano, a.mes), descricao: a.descricao, valor: Math.abs(a.valor).toFixed(2).replace('.', ','), sentido: a.valor < 0 ? 'sai' : 'entra' }
    : { chave: chave ?? chaveDe(p.meses[0].ano, p.meses[0].mes), descricao: '', valor: '', sentido: 'entra' })
  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const v = parseValorBR(form.valor)
    if (v == null || v <= 0) { aviso('Informe um valor maior que zero (ex.: 1.234,56).', 'erro'); return }
    const [ano, mes] = form.chave.split('-').map(Number)
    try {
      await api.salvarAjusteProjecao({ id: form.id, ano, mes, descricao: form.descricao, valor: form.sentido === 'sai' ? -v : v })
      setForm(null); await carregarAjustes(); aviso(form.id ? 'Ajuste atualizado.' : 'Ajuste incluído.')
    } catch (err) { aviso((err as Error).message, 'erro') }
  }
  const confirmarExcluir = async () => {
    if (!excluir) return
    try { await api.excluirAjusteProjecao(excluir.id); setExcluir(null); await carregarAjustes(); aviso('Ajuste removido.') } catch (err) { aviso((err as Error).message, 'erro') }
  }
  // meses para o formulário: os próximos 24, para dar para lançar o 13º do ano que vem
  const opcoesMes = useMemo(() => {
    const out: { chave: string; rotulo: string }[] = []
    let { ano, mes } = p.meses[0] ?? { ano: new Date().getFullYear(), mes: new Date().getMonth() + 1 }
    for (let i = 0; i < 24; i++) { out.push({ chave: chaveDe(ano, mes), rotulo: `${MESES[mes - 1]} de ${ano}` }); if (mes === 12) { ano++; mes = 1 } else mes++ }
    return out
  }, [p.meses])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-lg font-semibold">Projeção</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }} role="tablist" aria-label="Horizonte">
            {[3, 6, 12].map((n) => <button key={n} role="tab" aria-selected={nMeses === n} className={`px-3 py-1.5 text-sm ${nMeses === n ? 'bg-renda text-white' : 'text-ink-2 hover:bg-surface-2'}`} onClick={() => setNMeses(n)}>{n} meses</button>)}
          </div>
          <button className="btn-primary" onClick={() => abrir(null)}>+ Ajuste (13º, férias…)</button>
        </div>
      </div>

      {!recorrencias.some((r) => r.ativo) && <Card><Vazio>Nenhuma recorrência ativa: a projeção usa só a média dos gastos. Cadastre salário, aluguel etc. em <Link className="underline" to="/financas/recorrentes">Recorrentes</Link>.</Vazio></Card>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi rotulo="Renda líquida prevista (média/mês)" valor={media((m) => m.renda)} cor={CORES.renda} sub="receitas − descontos recorrentes" />
        <Kpi rotulo="Gastos fixos (média/mês)" valor={media((m) => m.fixas)} cor={CORES.gastos} sub="despesas recorrentes" />
        <Kpi rotulo="Gastos variáveis estimados" valor={p.variaveisEstimadas} cor={CORES.gastos} sub={p.mesesBase ? `média de ${p.mesesBase} meses (${fmtBRL(p.gastosMedios)}) − fixos (${fmtBRL(p.fixasReferencia)})` : 'sem histórico'} />
        <Kpi rotulo={`Sobra acumulada em ${ultimo ? `${nomeMesCurto(ultimo.mes)}/${ultimo.ano}` : '—'}`} valor={ultimo?.acumulado ?? 0} cor={CORES.saldo} sub={media((m) => m.aportes) ? `depois de ${fmtBRL(media((m) => m.aportes))}/mês em investimentos recorrentes` : 'antes de investir (sem investimento recorrente)'} />
      </div>

      <Card title="Mês a mês" subtitle="Estimativa: recorrências + média dos gastos variáveis + ajustes à mão. Não é previsão garantida.">
        <ProjecaoChart meses={p.meses} />
        <div className="overflow-x-auto mt-3">
          <table className="data min-w-[860px]">
            <thead><tr><th>Mês</th><th className="text-right">Renda líquida</th><th className="text-right">Ajustes</th><th className="text-right">Fixos</th><th className="text-right">Variáveis (est.)</th><th className="text-right">Já lançado</th><th className="text-right">Investimentos</th><th className="text-right">Saldo</th><th className="text-right">Acumulado</th><th /></tr></thead>
            <tbody>
              {p.meses.map((m) => (
                <tr key={chaveDe(m.ano, m.mes)}>
                  <td>{MESES[m.mes - 1]} {m.ano}</td>
                  <td className="text-right tnum">{fmtBRL(m.renda)}</td>
                  <td className={`text-right tnum ${m.ajustes > 0 ? 'text-good' : m.ajustes < 0 ? 'text-bad' : 'text-muted'}`} title={m.itensAjuste.map((a) => `${a.descricao}: ${fmtBRL(a.valor)}`).join('\n') || undefined}>{m.ajustes ? `${m.ajustes > 0 ? '+' : ''}${fmtBRL(m.ajustes)}` : '—'}</td>
                  <td className="text-right tnum">{fmtBRL(m.fixas)}</td>
                  <td className="text-right tnum text-muted">{fmtBRL(m.variaveis)}</td>
                  <td className="text-right tnum">{m.jaLancadas ? fmtBRL(m.jaLancadas) : '—'}</td>
                  <td className="text-right tnum">{m.aportes ? fmtBRL(m.aportes - m.resgates) : '—'}</td>
                  <td className={`text-right tnum font-medium ${m.saldo < 0 ? 'text-bad' : ''}`}>{fmtBRL(m.saldo)}</td>
                  <td className={`text-right tnum ${m.acumulado < 0 ? 'text-bad' : ''}`}>{fmtBRL(m.acumulado)}</td>
                  <td className="text-right"><button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => abrir(null, chaveDe(m.ano, m.mes))}>+ ajuste</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="Ajustes à mão" subtitle="Entradas e saídas previstas que não estão nas recorrências: 13º, férias, IPVA, viagem…">
          {!ajustes.length ? <Vazio>Nenhum ajuste. Use “+ Ajuste” para incluir o 13º ou as férias.</Vazio> : (
            <table className="data">
              <thead><tr><th>Mês</th><th>Descrição</th><th className="text-right">Valor</th><th /></tr></thead>
              <tbody>{ajustes.map((a) => (
                <tr key={a.id} className={ajustesForaDoPeriodo.includes(a) ? 'text-muted' : ''}>
                  <td>{nomeMesCurto(a.mes)}/{a.ano}</td><td>{a.descricao}</td>
                  <td className={`text-right tnum ${a.valor > 0 ? 'text-good' : 'text-bad'}`}>{a.valor > 0 ? '+' : ''}{fmtBRL(a.valor)}</td>
                  <td className="text-right whitespace-nowrap"><button className="btn-ghost !px-2 !py-0.5 text-xs" onClick={() => abrir(a)}>Editar</button> <button className="btn-ghost !px-2 !py-0.5 text-xs text-bad" onClick={() => setExcluir(a)}>Remover</button></td>
                </tr>))}</tbody>
            </table>
          )}
          {ajustesForaDoPeriodo.length > 0 && <p className="text-xs text-muted mt-2">Em cinza: fora do horizonte escolhido.</p>}
        </Card>
        <Card title="Como é calculado">
          <ul className="text-sm text-ink-2 space-y-1.5 list-disc pl-5">
            <li><strong>Renda e fixos</strong>: recorrências ativas no mês (Recorrentes). Se a recorrência já foi lançada no mês, vale o lançamento.</li>
            <li><strong>Variáveis</strong>: média dos gastos dos {p.mesesBase || 12} meses anteriores ao atual, menos os fixos de hoje — para não contar o aluguel duas vezes.</li>
            <li><strong>Já lançado</strong>: despesas avulsas que já estão no mês (parcelas futuras, por exemplo), somadas por cima da média.</li>
            <li><strong>Ajustes</strong>: o que você incluir à mão. O mês atual não entra: a projeção começa no próximo.</li>
          </ul>
        </Card>
      </div>

      <Modal aberto={!!form} titulo={form?.id ? 'Editar ajuste' : 'Novo ajuste'} onFechar={() => setForm(null)} largura="max-w-md">
        {form && (
          <form onSubmit={salvar} className="space-y-3">
            <div className="grid grid-cols-2 rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }} role="radiogroup" aria-label="Sentido">
              {(['entra', 'sai'] as const).map((s) => <button type="button" key={s} role="radio" aria-checked={form.sentido === s} className={`py-2 text-sm font-medium ${form.sentido === s ? 'bg-renda text-white' : 'text-ink-2 hover:bg-surface-2'}`} onClick={() => setForm({ ...form, sentido: s })}>{s === 'entra' ? 'Entrada (13º, férias)' : 'Saída (IPVA, viagem)'}</button>)}
            </div>
            <Campo rotulo="Mês"><select className="input" value={form.chave} onChange={(e) => setForm({ ...form, chave: e.target.value })}>{opcoesMes.map((o) => <option key={o.chave} value={o.chave}>{o.rotulo}</option>)}</select></Campo>
            <Campo rotulo="Descrição"><input className="input" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} required autoFocus placeholder="Ex.: 13º salário (1ª parcela)" /></Campo>
            <Campo rotulo="Valor (R$)"><input className="input tnum" inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} required placeholder="0,00" /></Campo>
            <div className="flex justify-end gap-2 pt-1"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button type="submit" className="btn-primary">Salvar</button></div>
          </form>
        )}
      </Modal>
      <Confirm aberto={!!excluir} titulo="Remover ajuste" perigoso confirmar="Remover" onCancelar={() => setExcluir(null)} onConfirmar={confirmarExcluir}
        mensagem={excluir ? <>Remover <strong>{excluir.descricao}</strong> ({fmtBRL(excluir.valor)}) de {nomeMesCurto(excluir.mes)}/{excluir.ano}?</> : null} />
    </div>
  )
}
