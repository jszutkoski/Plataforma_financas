import { useEffect, useState, type ReactNode } from 'react'
import { useStore } from '@pat/lib/store'
import { api } from '@pat/lib/api'
import { Card, Valor, Tag, Confirm, Vazio, Modal, Campo, Aviso } from '@pat/components/ui'
import { fmtData, fmtPct, hojeISO, parseValorBR } from '@pat/lib/format'
import { CATEGORIA_BEM_LABEL, type Bem, type AvaliacaoBem, type Divida, type SaldoDivida, type Conta, type SaldoConta } from '@pat-shared/types'

const n = (s: string) => parseValorBR(s)
const s = (v: number | null | undefined) => (v == null ? '' : String(v).replace('.', ','))

export function BensDividas() {
  const { base, recarregar, aviso, ultimo } = useStore()
  const [bemForm, setBemForm] = useState<Bem | 'novo' | null>(null)
  const [avForm, setAvForm] = useState<Bem | null>(null)
  const [divForm, setDivForm] = useState<Divida | 'nova' | null>(null)
  const [saldoForm, setSaldoForm] = useState<Divida | null>(null)
  const [contaForm, setContaForm] = useState<Conta | 'nova' | null>(null)
  const [saldoContaForm, setSaldoContaForm] = useState<Conta | null>(null)
  const [excluir, setExcluir] = useState<{ t: 'bens' | 'dividas' | 'contas' | 'avaliacoesBem' | 'saldosDivida' | 'saldosConta'; id: string; nome: string } | null>(null)
  const [financasContas, setFinancasContas] = useState<{ nome: string }[]>([])
  useEffect(() => { api.financasContas().then(setFinancasContas).catch(() => setFinancasContas([])) }, [])

  const hoje = hojeISO()
  const avaliacaoAtual = (b: Bem) => base.avaliacoesBem.filter((a) => a.bemId === b.id && a.data <= hoje).sort((x, y) => y.data.localeCompare(x.data))[0] ?? null
  const saldoAtual = (d: Divida) => base.saldosDivida.filter((x) => x.dividaId === d.id).sort((x, y) => y.data.localeCompare(x.data))[0] ?? null
  const saldoConta = (c: Conta) => base.saldosConta.filter((x) => x.contaId === c.id).sort((x, y) => (y.ano - x.ano) || (y.mes - x.mes))[0] ?? null

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Bens, dívidas e contas</h1>
      <Aviso>Só a <strong>minha participação</strong> entra no patrimônio (um imóvel de R$ 500.000 com 50% de propriedade conta R$ 250.000). Avaliações novas preservam as anteriores — nada é depreciado automaticamente nem consultado em tabelas externas. Dívidas entram pelo <strong>saldo devedor</strong>, nunca pela soma das parcelas.</Aviso>

      <Card title="Bens" subtitle="Imóveis, veículos e outros bens relevantes." actions={<button className="btn-primary !py-1" onClick={() => setBemForm('novo')}>Novo bem</button>}>
        {base.bens.length === 0 ? <Vazio>Nenhum bem cadastrado. Enquanto não houver, o painel mostra o patrimônio como incompleto.</Vazio> : (
          <div className="overflow-x-auto"><table className="data whitespace-nowrap">
            <thead><tr><th>Bem</th><th>Categoria</th><th>Aquisição</th><th className="text-right">Propriedade</th><th className="text-right">Avaliação (100%)</th><th>Data · fonte</th><th className="text-right">Minha participação</th><th>Dívida vinculada</th><th></th></tr></thead>
            <tbody>{base.bens.map((b) => { const av = avaliacaoAtual(b); const valor = av?.valor ?? b.valorAquisicao; const avs = base.avaliacoesBem.filter((a) => a.bemId === b.id).length; return (
              <tr key={b.id} className={b.situacao === 'vendido' ? 'text-muted' : ''}>
                <td><div>{b.nome}</div><div className="text-xs text-muted">{[b.localizacao, b.area ? `${b.area} m²` : null, b.marca, b.modelo, b.anoFabricacao].filter(Boolean).join(' · ')}{b.situacao === 'vendido' && <> · vendido em {b.dataVenda ? fmtData(b.dataVenda) : '?'}</>}</div></td>
                <td className="text-xs">{CATEGORIA_BEM_LABEL[b.categoria]}</td>
                <td className="text-xs">{b.dataAquisicao ? fmtData(b.dataAquisicao) : '—'}{b.valorAquisicao != null && <> · <Valor v={b.valorAquisicao} /></>}</td>
                <td className="text-right tnum">{fmtPct(b.percentualPropriedade)}</td>
                <td className="text-right"><Valor v={valor} vazio="sem avaliação" />{!av && b.valorAquisicao != null && <span className="text-xs text-muted" title="sem avaliação; usando valor de aquisição"> (aquisição)</span>}</td>
                <td className="text-xs">{av ? `${fmtData(av.data)} · ${av.fonte}` : '—'}{avs > 1 && <span className="text-muted"> ({avs} avaliações)</span>}</td>
                <td className="text-right font-medium"><Valor v={valor != null ? Math.round(valor * b.percentualPropriedade * 100) / 100 : null} vazio="—" /></td>
                <td className="text-xs">{b.dividaId ? base.dividas.find((d) => d.id === b.dividaId)?.nome ?? '?' : '—'}</td>
                <td className="text-right whitespace-nowrap"><button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setAvForm(b)}>Nova avaliação</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setBemForm(b)}>Editar</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setExcluir({ t: 'bens', id: b.id, nome: b.nome })}>Excluir</button></td>
              </tr>) })}</tbody>
          </table></div>
        )}
        {base.avaliacoesBem.length > 0 && <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">Histórico de avaliações ({base.avaliacoesBem.length})</summary>
          <table className="data mt-2"><thead><tr><th>Bem</th><th>Data</th><th className="text-right">Valor (100%)</th><th>Fonte</th><th>Obs.</th><th></th></tr></thead><tbody>{[...base.avaliacoesBem].sort((a, b) => b.data.localeCompare(a.data)).map((a) => <tr key={a.id}><td>{base.bens.find((b) => b.id === a.bemId)?.nome}</td><td>{fmtData(a.data)}</td><td className="text-right"><Valor v={a.valor} /></td><td>{a.fonte}</td><td>{a.observacoes}</td><td className="text-right"><button className="btn-ghost !py-0.5 !px-2" onClick={() => setExcluir({ t: 'avaliacoesBem', id: a.id, nome: `avaliação de ${fmtData(a.data)}` })}>Excluir</button></td></tr>)}</tbody></table></details>}
      </Card>

      <Card title="Dívidas" subtitle="Financiamentos, empréstimos e outras dívidas de minha responsabilidade." actions={<button className="btn-primary !py-1" onClick={() => setDivForm('nova')}>Nova dívida</button>}>
        {base.dividas.length === 0 ? <Vazio>Nenhuma dívida cadastrada.</Vazio> : (
          <div className="overflow-x-auto"><table className="data whitespace-nowrap">
            <thead><tr><th>Dívida</th><th>Instituição · tipo</th><th>Início</th><th>Vencimento</th><th>Bem relacionado</th><th className="text-right">Saldo devedor</th><th>Posição em</th><th>Situação</th><th></th></tr></thead>
            <tbody>{base.dividas.map((d) => { const sd = saldoAtual(d); return (
              <tr key={d.id}><td>{d.nome}</td><td className="text-xs">{[d.instituicao, d.tipo].filter(Boolean).join(' · ') || '—'}</td><td className="text-xs">{d.dataInicio ? fmtData(d.dataInicio) : '—'}</td><td className="text-xs">{d.vencimento ? fmtData(d.vencimento) : '—'}</td><td className="text-xs">{d.bemId ? base.bens.find((b) => b.id === d.bemId)?.nome : '—'}</td>
                <td className="text-right font-medium"><Valor v={sd?.saldoDevedor} vazio="sem saldo" /></td><td className="text-xs">{sd ? fmtData(sd.data) : '—'}</td><td><Tag s={d.situacao === 'ativa' ? 'ativo' : 'encerrado'} /></td>
                <td className="text-right whitespace-nowrap"><button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setSaldoForm(d)}>Novo saldo</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setDivForm(d)}>Editar</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setExcluir({ t: 'dividas', id: d.id, nome: d.nome })}>Excluir</button></td></tr>) })}</tbody>
          </table></div>
        )}
        {base.saldosDivida.length > 0 && <details className="mt-3 text-xs"><summary className="cursor-pointer text-muted">Histórico de saldos devedores ({base.saldosDivida.length})</summary>
          <table className="data mt-2"><thead><tr><th>Dívida</th><th>Data</th><th className="text-right">Saldo devedor</th><th>Obs.</th><th></th></tr></thead><tbody>{[...base.saldosDivida].sort((a, b) => b.data.localeCompare(a.data)).map((x) => <tr key={x.id}><td>{base.dividas.find((d) => d.id === x.dividaId)?.nome}</td><td>{fmtData(x.data)}</td><td className="text-right"><Valor v={x.saldoDevedor} /></td><td>{x.observacoes}</td><td className="text-right"><button className="btn-ghost !py-0.5 !px-2" onClick={() => setExcluir({ t: 'saldosDivida', id: x.id, nome: `saldo de ${fmtData(x.data)}` })}>Excluir</button></td></tr>)}</tbody></table></details>}
      </Card>

      <Card title="Contas (dinheiro disponível)" subtitle="Mesmos nomes do app Finanças, para as duas plataformas falarem da mesma conta. Saldos por mês são informados em Atualizar mês ou aqui." actions={<button className="btn-primary !py-1" onClick={() => setContaForm('nova')}>Nova conta</button>}>
        <a id="contas" />
        {base.contas.length === 0 ? <Vazio>Nenhuma conta cadastrada. Sem contas, o "dinheiro disponível" não entra no patrimônio.</Vazio> : (
          <div className="overflow-x-auto"><table className="data whitespace-nowrap">
            <thead><tr><th>Conta</th><th>Instituição · tipo</th><th>No Finanças</th><th className="text-right">Último saldo</th><th>Mês</th><th></th></tr></thead>
            <tbody>{base.contas.map((c) => { const sc = saldoConta(c); return (
              <tr key={c.id} className={c.ativo ? '' : 'text-muted'}><td>{c.nome}</td><td className="text-xs">{[c.instituicao, c.tipo].filter(Boolean).join(' · ')}</td><td className="text-xs">{c.financasNome ?? '—'}</td>
                <td className="text-right font-medium"><Valor v={sc?.saldo} vazio="sem saldo" /></td><td className="text-xs">{sc ? `${String(sc.mes).padStart(2, '0')}/${sc.ano}` : '—'}</td>
                <td className="text-right whitespace-nowrap"><button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setSaldoContaForm(c)}>Novo saldo</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setContaForm(c)}>Editar</button> <button className="btn-ghost !py-0.5 !px-2 text-xs" onClick={() => setExcluir({ t: 'contas', id: c.id, nome: c.nome })}>Excluir</button></td></tr>) })}</tbody>
          </table></div>
        )}
      </Card>

      {bemForm && <BemForm bem={bemForm === 'novo' ? undefined : bemForm} dividas={base.dividas} onFechar={() => setBemForm(null)} onSalvo={async () => { setBemForm(null); await recarregar() }} />}
      {avForm && <AvaliacaoForm bem={avForm} onFechar={() => setAvForm(null)} onSalvo={async () => { setAvForm(null); await recarregar() }} />}
      {divForm && <DividaForm divida={divForm === 'nova' ? undefined : divForm} bens={base.bens} onFechar={() => setDivForm(null)} onSalvo={async () => { setDivForm(null); await recarregar() }} />}
      {saldoForm && <SaldoDividaForm divida={saldoForm} onFechar={() => setSaldoForm(null)} onSalvo={async () => { setSaldoForm(null); await recarregar() }} />}
      {contaForm && <ContaForm conta={contaForm === 'nova' ? undefined : contaForm} financas={financasContas.map((c) => c.nome)} onFechar={() => setContaForm(null)} onSalvo={async () => { setContaForm(null); await recarregar() }} />}
      {saldoContaForm && <SaldoContaForm conta={saldoContaForm} padrao={ultimo} onFechar={() => setSaldoContaForm(null)} onSalvo={async () => { setSaldoContaForm(null); await recarregar() }} />}
      <Confirm aberto={!!excluir} titulo="Excluir" perigoso confirmar="Excluir" onCancelar={() => setExcluir(null)} mensagem={<>Excluir <strong>{excluir?.nome}</strong>?{excluir?.t === 'bens' && ' As avaliações do bem também serão apagadas. Um bem vendido deve ser marcado como vendido, não excluído.'}{excluir?.t === 'dividas' && ' Os saldos históricos também serão apagados; uma dívida paga deve ser marcada como quitada.'}</>}
        onConfirmar={async () => { try { await api.excluir(excluir!.t, excluir!.id, 'exclusão manual'); setExcluir(null); aviso('Excluído.'); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }} />
    </div>
  )
}

function Form({ titulo, onFechar, onSalvar, children, ok = true }: { titulo: string; onFechar: () => void; onSalvar: () => void; children: ReactNode; ok?: boolean }) {
  return <Modal aberto titulo={titulo} onFechar={onFechar}><div className="grid sm:grid-cols-2 gap-3">{children}</div><div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={onFechar}>Cancelar</button><button className="btn-primary" onClick={onSalvar} disabled={!ok}>Salvar</button></div></Modal>
}

function BemForm({ bem, dividas, onFechar, onSalvo }: { bem?: Bem; dividas: Divida[]; onFechar: () => void; onSalvo: () => void }) {
  const { aviso } = useStore()
  const [f, setF] = useState({ nome: bem?.nome ?? '', categoria: bem?.categoria ?? 'imovel', dataAquisicao: bem?.dataAquisicao ?? '', valorAquisicao: s(bem?.valorAquisicao), pct: bem ? String(bem.percentualPropriedade * 100) : '100', localizacao: bem?.localizacao ?? '', area: s(bem?.area), marca: bem?.marca ?? '', modelo: bem?.modelo ?? '', anoFabricacao: bem?.anoFabricacao ? String(bem.anoFabricacao) : '', dividaId: bem?.dividaId ?? '', situacao: bem?.situacao ?? 'ativo', dataVenda: bem?.dataVenda ?? '', valorVenda: s(bem?.valorVenda), observacoes: bem?.observacoes ?? '', avaliacao: '', fonte: 'própria' })
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  const salvar = async () => {
    const item = { nome: f.nome, categoria: f.categoria as Bem['categoria'], dataAquisicao: f.dataAquisicao || null, valorAquisicao: n(f.valorAquisicao), percentualPropriedade: (n(f.pct) ?? 100) / 100, localizacao: f.localizacao || null, area: n(f.area), marca: f.marca || null, modelo: f.modelo || null, anoFabricacao: f.anoFabricacao ? Number(f.anoFabricacao) : null, dividaId: f.dividaId || null, situacao: f.situacao as Bem['situacao'], dataVenda: f.dataVenda || null, valorVenda: n(f.valorVenda), observacoes: f.observacoes || null }
    try {
      const salvo = bem ? await api.atualizar<Bem>('bens', bem.id, item) : await api.criar<Bem>('bens', item)
      const av = n(f.avaliacao)
      if (!bem && av != null) await api.criar<AvaliacaoBem>('avaliacoesBem', { bemId: salvo.id, data: f.dataAquisicao || hojeISO(), valor: av, fonte: f.fonte || 'própria', observacoes: 'Avaliação inicial informada no cadastro.' })
      aviso('Bem salvo.'); onSalvo()
    } catch (e) { aviso((e as Error).message, 'erro') }
  }
  return (
    <Form titulo={bem ? `Editar ${bem.nome}` : 'Novo bem'} onFechar={onFechar} onSalvar={salvar} ok={!!f.nome.trim()}>
      <Campo rotulo="Nome" className="sm:col-span-2"><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
      <Campo rotulo="Categoria"><select className="input" value={f.categoria} onChange={(e) => set('categoria', e.target.value)}><option value="imovel">Imóvel</option><option value="veiculo">Veículo</option><option value="outro">Outro bem</option></select></Campo>
      <Campo rotulo="Percentual de propriedade (%)"><input className="input" inputMode="decimal" value={f.pct} onChange={(e) => set('pct', e.target.value)} /></Campo>
      <Campo rotulo="Data de aquisição"><input className="input" type="date" value={f.dataAquisicao} onChange={(e) => set('dataAquisicao', e.target.value)} /></Campo>
      <Campo rotulo="Valor de aquisição (100%)"><input className="input" inputMode="decimal" value={f.valorAquisicao} onChange={(e) => set('valorAquisicao', e.target.value)} /></Campo>
      {f.categoria === 'imovel' && <><Campo rotulo="Localização"><input className="input" value={f.localizacao} onChange={(e) => set('localizacao', e.target.value)} /></Campo><Campo rotulo="Área (m²)"><input className="input" inputMode="decimal" value={f.area} onChange={(e) => set('area', e.target.value)} /></Campo></>}
      {f.categoria === 'veiculo' && <><Campo rotulo="Marca"><input className="input" value={f.marca} onChange={(e) => set('marca', e.target.value)} /></Campo><Campo rotulo="Modelo"><input className="input" value={f.modelo} onChange={(e) => set('modelo', e.target.value)} /></Campo><Campo rotulo="Ano"><input className="input" inputMode="numeric" value={f.anoFabricacao} onChange={(e) => set('anoFabricacao', e.target.value)} /></Campo></>}
      <Campo rotulo="Dívida vinculada"><select className="input" value={f.dividaId} onChange={(e) => set('dividaId', e.target.value)}><option value="">—</option>{dividas.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}</select></Campo>
      {!bem && <><Campo rotulo="Valor estimado hoje (100%)" dica="opcional; cria a 1ª avaliação"><input className="input" inputMode="decimal" value={f.avaliacao} onChange={(e) => set('avaliacao', e.target.value)} /></Campo><Campo rotulo="Fonte da avaliação"><input className="input" value={f.fonte} onChange={(e) => set('fonte', e.target.value)} placeholder="própria, FIPE (data), laudo…" /></Campo></>}
      <Campo rotulo="Situação"><select className="input" value={f.situacao} onChange={(e) => set('situacao', e.target.value)}><option value="ativo">Possuo</option><option value="vendido">Vendido</option></select></Campo>
      {f.situacao === 'vendido' && <><Campo rotulo="Data da venda"><input className="input" type="date" value={f.dataVenda} onChange={(e) => set('dataVenda', e.target.value)} /></Campo><Campo rotulo="Valor recebido (minha parte)" dica="registre o recebimento na conta em Atualizar mês"><input className="input" inputMode="decimal" value={f.valorVenda} onChange={(e) => set('valorVenda', e.target.value)} /></Campo></>}
      <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
    </Form>
  )
}

function AvaliacaoForm({ bem, onFechar, onSalvo }: { bem: Bem; onFechar: () => void; onSalvo: () => void }) {
  const { aviso } = useStore()
  const [f, setF] = useState({ data: hojeISO(), valor: '', fonte: 'própria', observacoes: '' })
  const salvar = async () => { const v = n(f.valor); if (v == null) return aviso('Informe o valor.', 'erro'); try { await api.criar<AvaliacaoBem>('avaliacoesBem', { bemId: bem.id, data: f.data, valor: v, fonte: f.fonte, observacoes: f.observacoes || null }); aviso('Avaliação registrada (as anteriores foram preservadas).'); onSalvo() } catch (e) { aviso((e as Error).message, 'erro') } }
  return (
    <Form titulo={`Nova avaliação — ${bem.nome}`} onFechar={onFechar} onSalvar={salvar}>
      <Campo rotulo="Data"><input className="input" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
      <Campo rotulo="Valor do bem inteiro (100%)"><input className="input" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} /></Campo>
      <Campo rotulo="Fonte" dica="ex.: FIPE set/2026, laudo, anúncio, estimativa própria"><input className="input" value={f.fonte} onChange={(e) => setF({ ...f, fonte: e.target.value })} /></Campo>
      <Campo rotulo="Observações"><input className="input" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>
    </Form>
  )
}

function DividaForm({ divida, bens, onFechar, onSalvo }: { divida?: Divida; bens: Bem[]; onFechar: () => void; onSalvo: () => void }) {
  const { aviso } = useStore()
  const [f, setF] = useState({ nome: divida?.nome ?? '', instituicao: divida?.instituicao ?? '', tipo: divida?.tipo ?? '', dataInicio: divida?.dataInicio ?? '', vencimento: divida?.vencimento ?? '', bemId: divida?.bemId ?? '', situacao: divida?.situacao ?? 'ativa', dataQuitacao: divida?.dataQuitacao ?? '', observacoes: divida?.observacoes ?? '', saldo: '', data: hojeISO() })
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  const salvar = async () => {
    const item = { nome: f.nome, instituicao: f.instituicao || null, tipo: f.tipo || null, dataInicio: f.dataInicio || null, vencimento: f.vencimento || null, bemId: f.bemId || null, situacao: f.situacao as Divida['situacao'], dataQuitacao: f.situacao === 'quitada' ? f.dataQuitacao || null : null, observacoes: f.observacoes || null }
    try {
      const salvo = divida ? await api.atualizar<Divida>('dividas', divida.id, item) : await api.criar<Divida>('dividas', item)
      const sd = n(f.saldo)
      if (!divida && sd != null) await api.criar<SaldoDivida>('saldosDivida', { dividaId: salvo.id, data: f.data, saldoDevedor: sd, origem: 'manual', observacoes: null })
      aviso('Dívida salva.'); onSalvo()
    } catch (e) { aviso((e as Error).message, 'erro') }
  }
  return (
    <Form titulo={divida ? `Editar ${divida.nome}` : 'Nova dívida'} onFechar={onFechar} onSalvar={salvar} ok={!!f.nome.trim()}>
      <Campo rotulo="Nome" className="sm:col-span-2"><input className="input" value={f.nome} onChange={(e) => set('nome', e.target.value)} /></Campo>
      <Campo rotulo="Instituição"><input className="input" value={f.instituicao} onChange={(e) => set('instituicao', e.target.value)} /></Campo>
      <Campo rotulo="Tipo" dica="financiamento, empréstimo, consórcio…"><input className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value)} /></Campo>
      <Campo rotulo="Data de início" dica="contratação / liberação"><input className="input" type="date" value={f.dataInicio} onChange={(e) => set('dataInicio', e.target.value)} /></Campo>
      <Campo rotulo="Vencimento final"><input className="input" type="date" value={f.vencimento} onChange={(e) => set('vencimento', e.target.value)} /></Campo>
      <Campo rotulo="Bem relacionado"><select className="input" value={f.bemId} onChange={(e) => set('bemId', e.target.value)}><option value="">—</option>{bens.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}</select></Campo>
      {!divida && <><Campo rotulo="Saldo devedor atual (minha responsabilidade)"><input className="input" inputMode="decimal" value={f.saldo} onChange={(e) => set('saldo', e.target.value)} /></Campo><Campo rotulo="Data da posição"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></Campo></>}
      <Campo rotulo="Situação"><select className="input" value={f.situacao} onChange={(e) => set('situacao', e.target.value)}><option value="ativa">Ativa</option><option value="quitada">Quitada</option></select></Campo>
      {f.situacao === 'quitada' && <Campo rotulo="Data da quitação" dica="até esta data a dívida continua no histórico; vazio = até o último saldo registrado"><input className="input" type="date" value={f.dataQuitacao} onChange={(e) => set('dataQuitacao', e.target.value)} /></Campo>}
      <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
    </Form>
  )
}

function SaldoDividaForm({ divida, onFechar, onSalvo }: { divida: Divida; onFechar: () => void; onSalvo: () => void }) {
  const { aviso } = useStore()
  const [f, setF] = useState({ data: hojeISO(), saldo: '', observacoes: '' })
  const salvar = async () => { const v = n(f.saldo); if (v == null) return aviso('Informe o saldo devedor.', 'erro'); try { await api.criar<SaldoDivida>('saldosDivida', { dividaId: divida.id, data: f.data, saldoDevedor: v, origem: 'manual', observacoes: f.observacoes || null }); aviso('Saldo registrado.'); onSalvo() } catch (e) { aviso((e as Error).message, 'erro') } }
  return (
    <Form titulo={`Novo saldo devedor — ${divida.nome}`} onFechar={onFechar} onSalvar={salvar}>
      <Campo rotulo="Data da posição"><input className="input" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
      <Campo rotulo="Saldo devedor (não a soma das parcelas)"><input className="input" inputMode="decimal" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} /></Campo>
      <Campo rotulo="Observações" className="sm:col-span-2"><input className="input" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>
    </Form>
  )
}

function ContaForm({ conta, financas, onFechar, onSalvo }: { conta?: Conta; financas: string[]; onFechar: () => void; onSalvo: () => void }) {
  const { aviso } = useStore()
  const [f, setF] = useState({ nome: conta?.nome ?? '', instituicao: conta?.instituicao ?? '', tipo: conta?.tipo ?? 'corrente', financasNome: conta?.financasNome ?? '', ativo: conta?.ativo ?? true, dataEncerramento: conta?.dataEncerramento ?? '', observacoes: conta?.observacoes ?? '' })
  const salvar = async () => { try { const item = { nome: f.nome, instituicao: f.instituicao || null, tipo: f.tipo as Conta['tipo'], financasNome: f.financasNome || null, ativo: f.ativo, dataEncerramento: f.ativo ? null : f.dataEncerramento || null, observacoes: f.observacoes || null }; if (conta) await api.atualizar('contas', conta.id, item); else await api.criar('contas', item); aviso('Conta salva.'); onSalvo() } catch (e) { aviso((e as Error).message, 'erro') } }
  return (
    <Form titulo={conta ? `Editar ${conta.nome}` : 'Nova conta'} onFechar={onFechar} onSalvar={salvar} ok={!!f.nome.trim()}>
      <Campo rotulo="Nome"><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Campo>
      <Campo rotulo="Instituição"><input className="input" value={f.instituicao} onChange={(e) => setF({ ...f, instituicao: e.target.value })} /></Campo>
      <Campo rotulo="Tipo"><select className="input" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as Conta['tipo'] })}><option value="corrente">Conta corrente</option><option value="poupanca">Poupança</option><option value="corretora">Conta na corretora</option><option value="dinheiro">Dinheiro</option><option value="outro">Outro</option></select></Campo>
      <Campo rotulo="Conta correspondente no Finanças" dica={financas.length ? 'lista lida do banco do Finanças' : 'Finanças não encontrado'}><input className="input" list="fin-contas" value={f.financasNome} onChange={(e) => setF({ ...f, financasNome: e.target.value })} /><datalist id="fin-contas">{financas.map((c) => <option key={c} value={c} />)}</datalist></Campo>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={(e) => setF({ ...f, ativo: e.target.checked })} /> Conta ativa</label>
      {!f.ativo && <Campo rotulo="Data de encerramento" dica="até esta data a conta continua no histórico; vazio = até o último saldo registrado"><input className="input" type="date" value={f.dataEncerramento} onChange={(e) => setF({ ...f, dataEncerramento: e.target.value })} /></Campo>}
      <Campo rotulo="Observações"><input className="input" value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} /></Campo>
    </Form>
  )
}

function SaldoContaForm({ conta, padrao, onFechar, onSalvo }: { conta: Conta; padrao: [number, number] | null; onFechar: () => void; onSalvo: () => void }) {
  const { aviso } = useStore()
  const h = new Date()
  const [f, setF] = useState({ ano: String(padrao?.[0] ?? h.getFullYear()), mes: String(padrao?.[1] ?? h.getMonth() + 1), data: hojeISO(), saldo: '' })
  const salvar = async () => { const v = n(f.saldo); if (v == null) return aviso('Informe o saldo.', 'erro'); try { await api.criar<SaldoConta>('saldosConta', { contaId: conta.id, ano: Number(f.ano), mes: Number(f.mes), data: f.data || null, saldo: v, situacao: 'informada', origem: 'manual', observacoes: null }); aviso('Saldo registrado.'); onSalvo() } catch (e) { aviso((e as Error).message, 'erro') } }
  return (
    <Form titulo={`Saldo — ${conta.nome}`} onFechar={onFechar} onSalvar={salvar}>
      <Campo rotulo="Mês de referência"><div className="flex gap-2"><input className="input" inputMode="numeric" value={f.mes} onChange={(e) => setF({ ...f, mes: e.target.value })} placeholder="mês" /><input className="input" inputMode="numeric" value={f.ano} onChange={(e) => setF({ ...f, ano: e.target.value })} placeholder="ano" /></div></Campo>
      <Campo rotulo="Data em que o saldo foi visto"><input className="input" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></Campo>
      <Campo rotulo="Saldo (R$)"><input className="input" inputMode="decimal" value={f.saldo} onChange={(e) => setF({ ...f, saldo: e.target.value })} /></Campo>
    </Form>
  )
}
