import { useMemo, useState } from 'react'
import type { TipoLancamento, Grupo } from '@fin-shared/types'
import { TIPOS, TIPO_LABEL, GRUPOS_DESPESA } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { fmtBRL, fmtData } from '@fin/lib/format'
import { lerArquivo, lerWorkbook, ehCSV, mapearAutomatico, converterLinhas, CAMPOS, type Tabela, type CampoDestino } from '@fin/lib/import'
import { sugerirCategoria } from '@fin/lib/suggest'
import { Card, Campo, Confirm, Vazio } from '@fin/components/ui'

export function Importar() {
  const { lancamentos, recarregar, aviso } = useStore()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [tabelas, setTabelas] = useState<Tabela[]>([])
  const [aba, setAba] = useState(0)
  const [mapa, setMapa] = useState<Record<string, CampoDestino>>({})
  const [tipoPadrao, setTipoPadrao] = useState<TipoLancamento>('despesa')
  const [grupoPadrao, setGrupoPadrao] = useState<Grupo>('Variáveis')
  const [negativoDespesa, setNegativoDespesa] = useState(true)
  const [pularDuplicatas, setPularDuplicatas] = useState(true)
  const [sugerir, setSugerir] = useState(true)
  const [foraDoFluxo, setForaDoFluxo] = useState(false)
  const [confirmar, setConfirmar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const escolher = async (f: File | null) => {
    setArquivo(f); setTabelas([]); setErro(null)
    if (!f) return
    try {
      if (!ehCSV(f)) {
        const wb = await lerWorkbook(f)
        const t = await lerArquivo(f, wb)
        if (!t.length) { setErro('Nenhuma tabela com cabeçalho encontrada no arquivo.'); return }
        setTabelas(t); setAba(0); setMapa(mapearAutomatico(t[0].colunas)); return
      }
      const t = await lerArquivo(f)
      if (!t.length) { setErro('Nenhuma tabela com cabeçalho encontrada no arquivo.'); return }
      setTabelas(t); setAba(0); setMapa(mapearAutomatico(t[0].colunas))
    } catch (e) { setErro(`Não foi possível ler o arquivo: ${(e as Error).message}`) }
  }
  const tabela = tabelas[aba]
  const linhas = useMemo(() => (tabela ? converterLinhas(tabela, mapa, { tipoPadrao, valorNegativoEhDespesa: negativoDespesa, existentes: lancamentos }) : []), [tabela, mapa, tipoPadrao, negativoDespesa, lancamentos])
  const validas = linhas.filter((l) => l.item)
  const duplicadas = validas.filter((l) => l.duplicata)
  const aImportar = validas.filter((l) => !(pularDuplicatas && l.duplicata))
  const faltando = CAMPOS.filter((c) => c.obrigatorio && !Object.values(mapa).includes(c.id))

  const enviar = async () => {
    if (!arquivo) return
    setEnviando(true); setConfirmar(false)
    try {
      const itens = aImportar.map((l) => {
        const it = { ...l.item!, foraDoFluxo, ledger: foraDoFluxo ? arquivo.name : null }
        if (it.tipo === 'despesa') it.grupo = grupoPadrao
        if (sugerir && !it.categoria) { const s = sugerirCategoria(lancamentos, it.descricao, it.tipo); if (s) { it.categoria = s.categoria; it.subcategoria = s.subcategoria; if (it.tipo === 'despesa' && s.grupo) it.grupo = s.grupo } }
        if (l.duplicata) it.observacoes = [it.observacoes, `Possível duplicata de ${l.duplicata.id}`].filter(Boolean).join(' · ')
        return it
      })
      const r = await api.lote(itens, arquivo.name)
      await recarregar()
      aviso(`${r.criados} lançamento(s) importado(s)${r.rejeitados.length ? `; ${r.rejeitados.length} rejeitado(s) pelo servidor` : ''}.`)
      setArquivo(null); setTabelas([])
    } catch (e) { aviso((e as Error).message, 'erro') } finally { setEnviando(false) }
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Importar extrato ou planilha</h1><p className="text-xs text-muted">Leia um arquivo CSV/XLSX (extrato do banco, fatura do cartão ou planilha própria), relacione as colunas e confira a prévia antes de gravar.</p></div>
      <Card title="1. Arquivo" subtitle="CSV, XLS ou XLSX com uma linha de cabeçalho. O arquivo é lido apenas na sua máquina.">
        <input type="file" accept=".csv,.xls,.xlsx,.ods,text/csv" onChange={(e) => escolher(e.target.files?.[0] ?? null)} className="text-sm" />
        {erro && <p className="text-sm text-bad mt-2">{erro}</p>}
        {tabelas.length > 1 && (
          <Campo rotulo="Aba" className="mt-3 max-w-xs"><select className="input" value={aba} onChange={(e) => { const i = Number(e.target.value); setAba(i); setMapa(mapearAutomatico(tabelas[i].colunas)) }}>{tabelas.map((t, i) => <option key={t.nome} value={i}>{t.nome} ({t.linhas.length} linhas)</option>)}</select></Campo>
        )}
      </Card>
      {tabela && (<>
        <Card title="2. Relacionar colunas" subtitle="Data, descrição e valor são obrigatórios. As demais colunas são opcionais.">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {tabela.colunas.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm"><span className="w-40 truncate text-ink-2" title={c}>{c}</span>
                <select className="input" value={mapa[c] ?? 'ignorar'} onChange={(e) => setMapa((m) => ({ ...m, [c]: e.target.value as CampoDestino }))}>{CAMPOS.map((f) => <option key={f.id} value={f.id}>{f.rotulo}</option>)}</select></label>
            ))}
          </div>
          {faltando.length > 0 && <p className="text-sm text-bad mt-2">Mapeie: {faltando.map((f) => f.rotulo).join(', ')}.</p>}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <Campo rotulo="Tipo padrão (quando não há coluna de tipo)"><select className="input" value={tipoPadrao} onChange={(e) => setTipoPadrao(e.target.value as TipoLancamento)}>{TIPOS.map((t) => <option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select></Campo>
            <Campo rotulo="Natureza das despesas"><select className="input" value={grupoPadrao} onChange={(e) => setGrupoPadrao(e.target.value as Grupo)}>{GRUPOS_DESPESA.map((g) => <option key={g}>{g}</option>)}</select></Campo>
            <div className="text-xs space-y-1.5 pt-5">
              <label className="flex items-center gap-2"><input type="checkbox" checked={negativoDespesa} onChange={(e) => setNegativoDespesa(e.target.checked)} />Valores negativos são despesas (extratos)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={sugerir} onChange={(e) => setSugerir(e.target.checked)} />Sugerir categoria pelo histórico</label>
            </div>
            <div className="text-xs space-y-1.5 pt-5">
              <label className="flex items-center gap-2"><input type="checkbox" checked={pularDuplicatas} onChange={(e) => setPularDuplicatas(e.target.checked)} />Ignorar possíveis duplicatas</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={foraDoFluxo} onChange={(e) => setForaDoFluxo(e.target.checked)} />Importar como custos de projeto (fora do fluxo mensal)</label>
            </div>
          </div>
        </Card>
        <Card title="3. Prévia e validação" subtitle={`${linhas.length} linhas lidas · ${validas.length} válidas · ${linhas.length - validas.length} com erro · ${duplicadas.length} possíveis duplicatas`}>
          {!linhas.length ? <Vazio>Sem linhas.</Vazio> : (
            <div className="overflow-x-auto max-h-[420px]"><table className="data min-w-[720px]">
              <thead><tr><th>#</th><th>Status</th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria</th><th className="text-right">Valor</th></tr></thead>
              <tbody>{linhas.slice(0, 300).map((l) => (
                <tr key={l.indice} className={l.erros.length ? 'text-bad' : l.duplicata ? 'text-muted' : ''}>
                  <td className="tnum">{l.indice + 1}</td>
                  <td className="text-xs">{l.erros.length ? l.erros.join('; ') : l.duplicata ? <span title={`Já existe: ${l.duplicata.descricao} em ${fmtData(l.duplicata.data)}`}>duplicata?</span> : <span className="text-good">ok</span>}</td>
                  <td className="tnum">{l.item ? fmtData(l.item.data) : String(l.bruto[Object.keys(mapa).find((k) => mapa[k] === 'data') ?? ''] ?? '')}</td>
                  <td className="max-w-[280px] truncate">{l.item?.descricao ?? String(l.bruto[Object.keys(mapa).find((k) => mapa[k] === 'descricao') ?? ''] ?? '')}</td>
                  <td>{l.item ? TIPO_LABEL[l.item.tipo] : ''}</td>
                  <td className="text-ink-2">{l.item?.categoria ?? (sugerir && l.item ? <span className="text-muted">{sugerirCategoria(lancamentos, l.item.descricao, l.item.tipo)?.categoria ?? '—'} (sugerida)</span> : '')}</td>
                  <td className="text-right tnum">{l.item ? fmtBRL(l.item.valor) : ''}</td>
                </tr>))}</tbody>
            </table>{linhas.length > 300 && <p className="text-xs text-muted p-2">Mostrando as primeiras 300 linhas.</p>}</div>
          )}
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <p className="text-sm"><strong>{aImportar.length}</strong> lançamento(s) serão importados{pularDuplicatas && duplicadas.length ? ` (${duplicadas.length} duplicata(s) ignorada(s))` : ''}; {linhas.length - validas.length} linha(s) com erro serão descartadas.</p>
            <button className="btn-primary" disabled={!aImportar.length || faltando.length > 0 || enviando} onClick={() => setConfirmar(true)}>{enviando ? 'Importando…' : 'Importar'}</button>
          </div>
        </Card>
      </>)}
      <Confirm aberto={confirmar} titulo="Confirmar importação" confirmar={`Importar ${aImportar.length}`} onCancelar={() => setConfirmar(false)} onConfirmar={enviar}
        mensagem={<>Serão criados <strong>{aImportar.length}</strong> lançamentos a partir de <strong>{arquivo?.name}</strong>{foraDoFluxo ? ' como custos de projeto' : ''}. Você poderá editá-los ou excluí-los depois.</>} />
    </div>
  )
}
