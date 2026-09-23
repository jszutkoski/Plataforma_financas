import { useMemo, useState } from 'react'
import { useStore } from '@pat/lib/store'
import { api } from '@pat/lib/api'
import { Card, Aviso, Campo as CampoUI, Tag, Valor } from '@pat/components/ui'
import { lerArquivo, mapearAutomatico, preparar, CAMPOS, type Tabela, type Destino, type Campo, type LinhaPreparada } from '@pat/lib/import'
import { fmtData, fmtQtd } from '@pat/lib/format'
import { CATEGORIAS, CATEGORIA_LABEL, type CategoriaInvestimento } from '@pat-shared/types'

export function Importar() {
  const { base, recarregar, aviso } = useStore()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [tabelas, setTabelas] = useState<Tabela[]>([])
  const [aba, setAba] = useState(0)
  const [destino, setDestino] = useState<Destino>('posicoes')
  const [mapa, setMapa] = useState<Record<string, Campo>>({})
  const [novosAtivos, setNovosAtivos] = useState<Record<string, { criar: boolean; categoria: CategoriaInvestimento }>>({})
  const [incluirConflitos, setIncluirConflitos] = useState<Record<number, boolean>>({})
  const [resultado, setResultado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const escolher = async (f: File | null) => {
    setArquivo(f); setTabelas([]); setResultado(null); setErro(null)
    if (!f) return
    try {
      const { tabelas: ts } = await lerArquivo(f)
      setTabelas(ts); setAba(0)
      if (ts[0]) setMapa(mapearAutomatico(ts[0].colunas, destino))
    } catch (e) { setErro(`Não foi possível ler o arquivo: ${(e as Error).message}`) }
  }
  const tabela = tabelas[aba] ?? null
  const trocarAba = (i: number) => { setAba(i); setMapa(mapearAutomatico(tabelas[i].colunas, destino)) }
  const trocarDestino = (d: Destino) => { setDestino(d); if (tabela) setMapa(mapearAutomatico(tabela.colunas, d)) }

  const linhas: LinhaPreparada[] = useMemo(() => (tabela ? preparar(destino, tabela, mapa, base.investimentos, base, arquivo?.name ?? 'arquivo') : []), [tabela, destino, mapa, base, arquivo])
  const semAtivo = useMemo(() => [...new Set(linhas.filter((l) => !l.investimento && l.nomeAtivo).map((l) => l.nomeAtivo))], [linhas])
  const obrigatorios = CAMPOS[destino].filter((c) => c.obrigatorio && !Object.values(mapa).includes(c.id))
  const validas = linhas.filter((l) => !l.erros.length && (l.investimento || novosAtivos[l.nomeAtivo]?.criar) && !l.duplicada && (!l.conflito || incluirConflitos[l.indice]))
  const conflitos = linhas.filter((l) => l.conflito)
  const duplicadas = linhas.filter((l) => l.duplicada)
  const comErro = linhas.filter((l) => l.erros.length || (!l.investimento && !novosAtivos[l.nomeAtivo]?.criar))

  const existentePara = (l: LinhaPreparada) => {
    const it = l.item as Record<string, unknown>
    if (destino === 'posicoes') return base.posicoes.find((p) => p.investimentoId === l.investimento?.id && p.ano === it.ano && p.mes === it.mes) ?? null
    return null
  }
  const confirmar = async () => {
    setEnviando(true)
    try {
      const nome = arquivo?.name ?? 'arquivo'
      const criados: Record<string, string> = {}
      for (const [n, cfg] of Object.entries(novosAtivos)) if (cfg.criar) {
        const inv = await api.criar<{ id: string }>('investimentos', { nome: n, codigo: /^[A-Z0-9]{4,6}$/i.test(n) ? n.toUpperCase() : null, categoria: cfg.categoria, situacao: 'revisar', observacoes: `Criado na importação de ${nome}; revise categoria e instituição.`, origem: `importação: ${nome}`, origemArquivo: nome, nomesOriginais: [n] })
        criados[n] = inv.id
      }
      // conflitos marcados para substituir viram correções explícitas (ficam no histórico com o valor anterior)
      let substituidos = 0
      for (const l of validas.filter((l) => l.conflito)) {
        const ex = existentePara(l)
        if (!ex) continue
        await api.atualizar(destino, ex.id, { ...l.item, id: ex.id, investimentoId: l.investimento?.id ?? criados[l.nomeAtivo], motivo: `substituído pela importação de ${nome} (${l.item.origem})` })
        substituidos++
      }
      const itens = validas.filter((l) => !l.conflito).map((l) => ({ ...l.item, investimentoId: l.investimento?.id ?? criados[l.nomeAtivo] }))
      const r = itens.length ? await api.importar(nome, { [destino]: itens }) : null
      const res = r?.[destino] ?? { criados: 0, ignorados: 0, rejeitados: [] }
      setResultado(`${res.criados} registro(s) importado(s), ${substituidos} substituído(s), ${res.ignorados} já existiam, ${res.rejeitados.length} rejeitado(s)${res.rejeitados.length ? ': ' + res.rejeitados.map((x) => `linha ${x.indice + 1}: ${x.erros.join(' ')}`).join('; ') : ''}. ${Object.keys(criados).length ? `${Object.keys(criados).length} investimento(s) novo(s) marcados como "revisar".` : ''}`)
      await recarregar()
      aviso('Importação concluída.')
    } catch (e) { aviso((e as Error).message, 'erro') } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Importar posições e movimentações</h1>
      <Aviso>O arquivo é lido no navegador; só as linhas confirmadas vão para o banco local. Linhas duplicadas (mesma origem ou mesmo ativo/mês/valor) são ignoradas; conflitos com valores já registrados <strong>não são substituídos</strong> sem sua escolha explícita.</Aviso>
      <Card title="1. Arquivo">
        <input type="file" accept=".csv,.xls,.xlsx,.ods,text/csv" onChange={(e) => escolher(e.target.files?.[0] ?? null)} className="text-sm" />
        {erro && <p className="text-sm text-bad mt-2">{erro}</p>}
        {tabelas.length > 1 && <CampoUI rotulo="Aba" className="mt-2"><select className="input !w-auto" value={aba} onChange={(e) => trocarAba(Number(e.target.value))}>{tabelas.map((t, i) => <option key={t.nome} value={i}>{t.nome} ({t.linhas.length} linhas)</option>)}</select></CampoUI>}
      </Card>
      {tabela && (
        <Card title="2. O que o arquivo contém" actions={
          <div className="flex rounded-lg overflow-hidden border text-xs" style={{ borderColor: 'var(--border)' }}>
            <button className={`px-3 py-1 ${destino === 'posicoes' ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => trocarDestino('posicoes')}>Posições mensais (saldos)</button>
            <button className={`px-3 py-1 ${destino === 'movimentacoes' ? 'bg-renda text-white' : 'bg-surface text-ink-2'}`} onClick={() => trocarDestino('movimentacoes')}>Movimentações (compras, vendas…)</button>
          </div>}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {tabela.colunas.map((c) => (
              <label key={c} className="text-xs"><span className="label truncate" title={c}>{c} <span className="text-muted font-normal">ex.: {String(tabela.linhas[0]?.[c] ?? '')}</span></span>
                <select className="input !py-1" value={mapa[c] ?? 'ignorar'} onChange={(e) => setMapa({ ...mapa, [c]: e.target.value as Campo })}>{CAMPOS[destino].map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></label>
            ))}
          </div>
          {obrigatorios.length > 0 && <p className="text-xs text-bad mt-2">Faltam colunas obrigatórias: {obrigatorios.map((o) => o.rotulo).join(', ')}.</p>}
          {destino === 'posicoes' && <p className="text-xs text-muted mt-2">Cada linha = saldo de um ativo no fechamento de um mês. Informe data da posição ou ano + mês. Saldo em branco com quantidade preenchida vira posição "pendente" (quantidade conhecida, sem avaliação).</p>}
        </Card>
      )}
      {tabela && semAtivo.length > 0 && (
        <Card title="3. Ativos não encontrados no cadastro" subtitle="Escolha criar (ficam como 'revisar') ou deixar as linhas de fora.">
          <div className="grid sm:grid-cols-2 gap-2">{semAtivo.map((n) => { const cfg = novosAtivos[n] ?? { criar: false, categoria: 'Outros' as CategoriaInvestimento }; return (
            <div key={n} className="flex items-center gap-2 text-sm"><label className="flex items-center gap-2 flex-1"><input type="checkbox" checked={cfg.criar} onChange={(e) => setNovosAtivos({ ...novosAtivos, [n]: { ...cfg, criar: e.target.checked } })} /> Criar <strong>{n}</strong></label>
              <select className="input !w-auto !py-1 text-xs" value={cfg.categoria} onChange={(e) => setNovosAtivos({ ...novosAtivos, [n]: { ...cfg, categoria: e.target.value as CategoriaInvestimento } })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}</select></div>) })}</div>
        </Card>
      )}
      {tabela && (
        <Card title={`${semAtivo.length ? 4 : 3}. Prévia e conciliação`} subtitle={`${linhas.length} linhas · ${validas.length} prontas · ${duplicadas.length} duplicadas (ignoradas) · ${conflitos.length} conflito(s) · ${comErro.length} com problema`}>
          {conflitos.length > 0 && <Aviso tipo="alerta">{conflitos.length} linha(s) conflitam com valores já registrados. Marque as que devem <strong>substituir</strong> o valor atual; as demais ficam de fora. A substituição é registrada como correção no histórico.</Aviso>}
          <div className="overflow-x-auto max-h-[50vh] mt-2">
            <table className="data whitespace-nowrap text-xs">
              <thead><tr><th>#</th><th>Ativo</th><th>{destino === 'posicoes' ? 'Mês' : 'Data · tipo'}</th><th className="text-right">Valor</th><th className="text-right">Qtd.</th><th>Situação</th></tr></thead>
              <tbody>{linhas.slice(0, 300).map((l) => {
                const it = l.item as Record<string, unknown>
                const estado = l.erros.length ? `erro: ${l.erros.join(', ')}` : !l.investimento && !novosAtivos[l.nomeAtivo]?.criar ? 'ativo não encontrado' : l.duplicada ? `duplicada — ${l.duplicada.motivo}` : l.conflito ? l.conflito : 'pronta'
                return (
                  <tr key={l.indice} className={estado === 'pronta' ? '' : 'text-muted'}>
                    <td>{l.indice + 1}</td><td>{l.investimento?.nome ?? l.nomeAtivo}{!l.investimento && novosAtivos[l.nomeAtivo]?.criar && <Tag s="revisar" />}</td>
                    <td>{destino === 'posicoes' ? (it.ano ? `${String(it.mes).padStart(2, '0')}/${it.ano}` : '?') : `${it.data ? fmtData(it.data as string) : '?'} · ${it.tipo ?? '?'}`}</td>
                    <td className="text-right"><Valor v={(it.saldo ?? it.valor) as number | null} vazio="—" /></td><td className="text-right">{fmtQtd(it.quantidade as number | null)}</td>
                    <td className={estado === 'pronta' ? 'tag-ok' : l.conflito ? 'tag-warn' : ''}>{estado}{l.conflito && <label className="ml-2"><input type="checkbox" checked={!!incluirConflitos[l.indice]} onChange={(e) => setIncluirConflitos({ ...incluirConflitos, [l.indice]: e.target.checked })} /> substituir</label>}</td>
                  </tr>)
              })}</tbody>
            </table>
            {linhas.length > 300 && <p className="text-xs text-muted mt-1">Mostrando 300 de {linhas.length} linhas.</p>}
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button className="btn-primary" disabled={!validas.length || obrigatorios.length > 0 || enviando} onClick={confirmar}>Importar {validas.length} linha(s)</button>
          </div>
          {resultado && <p className="text-sm mt-2 tag-ok">{resultado}</p>}
        </Card>
      )}
    </div>
  )
}
