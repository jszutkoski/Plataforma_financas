import { useState } from 'react'
import type { Backup } from '@fin-shared/types'
import { useStore } from '@fin/lib/store'
import { api } from '@fin/lib/api'
import { resumoMes } from '@fin/lib/analytics'
import { fmtData } from '@fin/lib/format'
import { lancamentosParaCSV, tabelaParaCSV, baixarArquivo } from '@fin/lib/csv'
import { Card, Confirm } from '@fin/components/ui'

export function Dados() {
  const { lancamentos, info, recarregar, aviso } = useStore()
  const [confirmarLimpar, setConfirmarLimpar] = useState(false)
  const [textoConf, setTextoConf] = useState('')
  const [restaurar, setRestaurar] = useState<{ b: Backup; modo: 'substituir' | 'mesclar' } | null>(null)
  const baixarBackup = async () => { try { const b = await api.backup(); baixarArquivo(`financas-backup-${b.geradoEm.slice(0, 10)}.json`, JSON.stringify(b, null, 1)); aviso('Backup gerado.') } catch (e) { aviso((e as Error).message, 'erro') } }
  const backupArquivo = async () => { try { const r = await api.backupArquivo(); aviso(`Cópia do banco salva em ${r.arquivo}`) } catch (e) { aviso((e as Error).message, 'erro') } }
  const escolherRestauracao = async (f: File | null, modo: 'substituir' | 'mesclar') => {
    if (!f) return
    try { const b = JSON.parse(await f.text()) as Backup; if (b.versao !== 1 || !Array.isArray(b.lancamentos)) throw new Error('Arquivo de backup inválido.'); setRestaurar({ b, modo }) } catch (e) { aviso((e as Error).message, 'erro') }
  }
  const confirmarRestauracao = async () => { if (!restaurar) return; try { const r = await api.restaurar(restaurar.b, restaurar.modo); await recarregar(); aviso(`Backup restaurado (${r.lancamentos} lançamentos).${r.copia ? ` Cópia dos dados anteriores: ${r.copia}` : ''}`) } catch (e) { aviso((e as Error).message, 'erro') } setRestaurar(null) }
  const limpar = async () => { try { const r = await api.limpar(); await recarregar(); aviso(`Todos os dados foram apagados.${r.copia ? ` Cópia guardada em ${r.copia}` : ''}`) } catch (e) { aviso((e as Error).message, 'erro') } setConfirmarLimpar(false); setTextoConf('') }
  const exportarResumo = () => {
    const anos = [...new Set(lancamentos.filter((l) => !l.foraDoFluxo).map((l) => l.ano))].sort()
    const linhas: (string | number)[][] = []
    for (const a of anos) for (let m = 1; m <= 12; m++) { const r = resumoMes(lancamentos, a, m); if (r.temDados) linhas.push([a, m, r.receitaBruta, r.deducoes, r.renda, r.gastos, r.porGrupo.Fixas ?? 0, r.porGrupo['Variáveis'] ?? 0, r.porGrupo.Extras ?? 0, r.porGrupo.Adicionais ?? 0, r.aportes, r.resgates, r.saldo]) }
    baixarArquivo('resumo-mensal.csv', tabelaParaCSV(['ano', 'mes', 'receita_bruta', 'deducoes', 'renda_liquida', 'gastos', 'fixas', 'variaveis', 'extras', 'adicionais', 'aportes', 'resgates', 'saldo'], linhas))
  }

  return (
    <div className="space-y-4">
      <div><h1 className="text-lg font-semibold">Dados e backup</h1><p className="text-xs text-muted">Tudo fica na sua máquina. Faça backups com regularidade — é a única cópia dos seus lançamentos.</p></div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Banco de dados" subtitle={info ? `${info.lancamentos} lançamentos · ${info.banco}` : ''}>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={baixarBackup}>Baixar backup (JSON)</button>
            <button className="btn-ghost" onClick={backupArquivo}>Copiar arquivo .db</button>
            <button className="btn-ghost" onClick={() => baixarArquivo('lancamentos-completo.csv', lancamentosParaCSV(lancamentos))}>Exportar tudo (CSV)</button>
            <button className="btn-ghost" onClick={exportarResumo}>Relatório mensal (CSV)</button>
          </div>
          <p className="text-xs text-muted mt-2">O backup JSON contém lançamentos, categorias, contas, recorrências e projetos — é o formato para levar os dados para outro computador. A cópia do .db fica em <code>data/backups/</code>.</p>
        </Card>
        <Card title="Restaurar backup">
          <div className="space-y-2 text-sm">
            <label className="block"><span className="label">Substituir tudo pelo backup</span><input type="file" accept=".json" onChange={(e) => { escolherRestauracao(e.target.files?.[0] ?? null, 'substituir'); e.target.value = '' }} /></label>
            <label className="block"><span className="label">Mesclar (só adiciona o que não existe)</span><input type="file" accept=".json" onChange={(e) => { escolherRestauracao(e.target.files?.[0] ?? null, 'mesclar'); e.target.value = '' }} /></label>
          </div>
        </Card>
      </div>
      <Card title="Zona de risco">
        <button className="btn-danger" onClick={() => setConfirmarLimpar(true)}>Apagar todos os dados</button>
        <p className="text-xs text-muted mt-2">Remove lançamentos, categorias, contas, recorrências e projetos deste computador. Não há como desfazer: baixe um backup antes.</p>
      </Card>
      <Confirm aberto={!!restaurar} titulo="Restaurar backup" perigoso={restaurar?.modo === 'substituir'} confirmar="Restaurar" onCancelar={() => setRestaurar(null)} onConfirmar={confirmarRestauracao}
        mensagem={restaurar ? <>{restaurar.modo === 'substituir' ? 'Todos os dados atuais serão substituídos' : 'Os dados do backup serão mesclados aos atuais'} pelo backup de {fmtData(restaurar.b.geradoEm)} ({restaurar.b.lancamentos.length} lançamentos).</> : null} />
      <Confirm aberto={confirmarLimpar} titulo="Apagar todos os dados" perigoso confirmar="Apagar definitivamente" onCancelar={() => { setConfirmarLimpar(false); setTextoConf('') }} onConfirmar={() => textoConf === 'APAGAR TUDO' ? limpar() : undefined}
        mensagem={<div className="space-y-2"><p>Isso remove <strong>todos</strong> os lançamentos, categorias, contas, recorrências e projetos do banco local. Faça um backup antes. Digite <code>APAGAR TUDO</code> para confirmar:</p><input className="input" value={textoConf} onChange={(e) => setTextoConf(e.target.value)} /></div>} />
    </div>
  )
}
