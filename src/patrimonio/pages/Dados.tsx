import { useEffect, useState } from 'react'
import { useStore } from '@pat/lib/store'
import { api, type FluxoFinancas } from '@pat/lib/api'
import { Card, Confirm, Modal, Valor, Vazio } from '@pat/components/ui'
import { baixarCSV, baixarJSON } from '@pat/lib/csv'
import { fmtData, fmtMesAno } from '@pat/lib/format'
import type { Backup } from '@pat-shared/types'

export function Dados() {
  const { base, info, pendencias, alteracoes, recarregar, aviso } = useStore()
  const [fluxos, setFluxos] = useState<{ disponivel: boolean; caminho?: string; meses: FluxoFinancas[] } | null>(null)
  const [restaurar, setRestaurar] = useState<{ b: Backup; modo: 'substituir' | 'mesclar' } | null>(null)
  const [limpar, setLimpar] = useState(false)
  const [confirmaTexto, setConfirmaTexto] = useState('')
  const [conflito, setConflito] = useState<{ ano: number; mes: number; atual: number; novo: number } | null>(null)

  useEffect(() => { api.financasFluxos().then(setFluxos).catch(() => setFluxos({ disponivel: false, meses: [] })) }, [base])

  const contagens = info?.contagens ?? {}
  const lerBackup = async (f: File | null, modo: 'substituir' | 'mesclar') => {
    if (!f) return
    try { const b = JSON.parse(await f.text()) as Backup; if (b.versao !== 2 || b.app !== 'patrimonio') throw new Error('não é um backup do Patrimônio (versão 2)'); setRestaurar({ b, modo }) } catch (e) { aviso(`Arquivo inválido: ${(e as Error).message}`, 'erro') }
  }
  const importarFluxo = async (m: FluxoFinancas, substituir = false) => {
    try { await api.financasImportarFluxo(m.ano, m.mes, substituir); aviso(`Aporte líquido de ${fmtMesAno(m.ano, m.mes)} importado do Finanças.`); await recarregar() }
    catch (e) { const c = (e as Error & { corpo?: { conflito?: boolean; atual?: { aportesLiquidos: number }; novo?: number } }).corpo; if (c?.conflito) setConflito({ ano: m.ano, mes: m.mes, atual: c.atual!.aportesLiquidos, novo: c.novo! }); else aviso((e as Error).message, 'erro') }
  }
  const resolverPend = async (id: string, resolvido: boolean) => { try { await api.atualizar('pendencias', id, { resolvido }); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Dados</h1>
      <Card title="Onde os dados ficam">
        <ul className="text-sm space-y-1 text-ink-2">
          <li>Tudo fica em um arquivo SQLite <strong>neste computador</strong>: <code className="text-xs">{info?.banco}</code>. A API escuta só em 127.0.0.1; nada é enviado para a internet.</li>
          <li>Armazenamento local <strong>não sincroniza</strong> entre dispositivos. Para levar os dados a outro computador, baixe o backup JSON e restaure lá.</li>
          <li>Registros: {Object.entries(contagens).map(([k, v]) => `${k} ${v}`).join(' · ')}.</li>
          <li>Não guarde senhas ou dados de acesso aqui — só valores e datas.</li>
        </ul>
      </Card>

      <Card title="Backup e restauração">
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={async () => { try { baixarJSON(`patrimonio-backup-${new Date().toISOString().slice(0, 10)}.json`, await api.backup()); } catch (e) { aviso((e as Error).message, 'erro') } }}>Baixar backup (JSON)</button>
          <button className="btn-ghost" onClick={async () => { try { const r = await api.backupArquivo(); aviso(`Cópia gravada em ${r.arquivo}`) } catch (e) { aviso((e as Error).message, 'erro') } }}>Copiar arquivo .db</button>
          <label className="btn-ghost cursor-pointer">Restaurar (substituir)<input type="file" accept=".json" className="hidden" onChange={(e) => { lerBackup(e.target.files?.[0] ?? null, 'substituir'); e.target.value = '' }} /></label>
          <label className="btn-ghost cursor-pointer">Restaurar (mesclar)<input type="file" accept=".json" className="hidden" onChange={(e) => { lerBackup(e.target.files?.[0] ?? null, 'mesclar'); e.target.value = '' }} /></label>
        </div>
        <p className="text-xs text-muted mt-2">"Substituir" apaga a base atual antes de restaurar; "mesclar" só acrescenta o que ainda não existe — um registro do backup para um mês/ativo que já tem dado aqui é ignorado, nunca sobrescreve. Ambos pedem confirmação.</p>
      </Card>

      <Card title="Exportar tabelas (CSV)">
        <div className="flex flex-wrap gap-2">
          {([['investimentos', 'Investimentos'], ['posicoes', 'Posições por ativo'], ['posicoesConsolidadas', 'Posições consolidadas'], ['movimentacoes', 'Movimentações'], ['fluxosConsolidados', 'Fluxos mensais'], ['contas', 'Contas'], ['saldosConta', 'Saldos de contas'], ['bens', 'Bens'], ['avaliacoesBem', 'Avaliações'], ['dividas', 'Dívidas'], ['saldosDivida', 'Saldos de dívidas'], ['fechamentos', 'Fechamentos']] as [keyof typeof base, string][]).map(([k, r]) => (
            <button key={k} className="btn-ghost !py-1 text-xs" onClick={() => baixarCSV(`${k}.csv`, base[k] as unknown as Record<string, unknown>[])}>{r} ({(base[k] as unknown[]).length})</button>
          ))}
        </div>
      </Card>

      <Card title="Integração com o app Finanças" subtitle={fluxos?.disponivel ? `Banco do Finanças encontrado em ${fluxos.caminho} (leitura direta, somente leitura).` : 'Banco do app Finanças não encontrado. Configure o caminho na variável FINANCAS_DB.'}>
        <a id="financas" />
        <p className="text-sm text-ink-2 mb-2">Finanças cuida do fluxo de caixa; Patrimônio, das posições. A ponte: (1) o <strong>aporte líquido</strong> de cada mês pode ser importado dos lançamentos investimento/resgate do Finanças (com os ids guardados, sem duplicar); (2) uma aplicação/resgate registrada aqui com dinheiro externo pode gerar o lançamento de caixa no Finanças (tela Movimentações → "→ Finanças"; exige o Finanças rodando em {info?.financas.api}). Aplicações nunca viram despesa, nem resgates viram renda.</p>
        {fluxos?.disponivel && fluxos.meses.length > 0 && (
          <div className="overflow-x-auto max-h-80 overflow-y-auto"><table className="data text-xs whitespace-nowrap">
            <thead><tr><th>Mês</th><th className="text-right">Investimentos</th><th className="text-right">Resgates</th><th className="text-right">Líquido</th><th className="text-right">No Patrimônio</th><th>Situação</th><th></th></tr></thead>
            <tbody>{[...fluxos.meses].reverse().map((m) => { const f = base.fluxosConsolidados.find((x) => x.ano === m.ano && x.mes === m.mes); const igual = f?.aportesLiquidos != null && Math.abs(f.aportesLiquidos - m.liquido) < 0.005; return (
              <tr key={`${m.ano}-${m.mes}`}><td>{fmtMesAno(m.ano, m.mes)}</td><td className="text-right"><Valor v={m.investimentos} /></td><td className="text-right"><Valor v={m.resgates} /></td><td className="text-right"><Valor v={m.liquido} sinal /></td><td className="text-right"><Valor v={f?.aportesLiquidos} vazio="—" /></td>
                <td>{!f ? <span className="text-muted">não importado</span> : igual ? <span className="tag-ok">confere{f.origem?.startsWith('financas') ? ' (importado)' : ''}</span> : <span className="tag-warn">valor diferente do registrado</span>}</td>
                <td className="text-right">{(!f || !igual) && <button className="btn-ghost !py-0.5 !px-2" onClick={() => importarFluxo(m)}>Importar</button>}</td></tr>) })}</tbody>
          </table></div>
        )}
      </Card>

      <Card title={`Pendências de revisão (${pendencias.filter((p) => !p.resolvido).length} abertas)`} subtitle="Registros incompletos ou inconsistentes preservados na importação. Nada foi inventado para completá-los.">
        <a id="pendencias" />
        {pendencias.length === 0 ? <Vazio>Nenhuma pendência.</Vazio> : (
          <table className="data text-xs"><thead><tr><th>Origem</th><th>Registro</th><th>Motivo</th><th></th></tr></thead>
            <tbody>{[...pendencias].sort((a, b) => Number(a.resolvido) - Number(b.resolvido)).map((p) => <tr key={p.id} className={p.resolvido ? 'text-muted line-through' : ''}><td>{p.origemArquivo} · {p.origem}</td><td>{p.descricao}</td><td>{p.motivo}</td><td className="text-right"><button className="btn-ghost !py-0.5 !px-2" onClick={() => resolverPend(p.id, !p.resolvido)}>{p.resolvido ? 'Reabrir' : 'Marcar resolvida'}</button></td></tr>)}</tbody></table>
        )}
      </Card>

      <Card title={`Histórico de alterações (${alteracoes.length})`} subtitle="Correções e exclusões de registros, com o valor anterior e os períodos afetados.">
        {alteracoes.length === 0 ? <Vazio>Nenhuma alteração registrada.</Vazio> : (
          <div className="max-h-80 overflow-y-auto"><table className="data text-xs"><thead><tr><th>Quando</th><th>Entidade</th><th>Descrição</th><th>Períodos</th><th>Motivo</th><th>Antes → depois</th></tr></thead>
            <tbody>{[...alteracoes].reverse().slice(0, 200).map((a) => { const an = a.antes as Record<string, unknown> | null; const dp = a.depois as Record<string, unknown> | null; const campo = ['saldo', 'valor', 'saldoDevedor', 'aportesLiquidos'].find((k) => an?.[k] !== undefined || dp?.[k] !== undefined); return (
              <tr key={a.id}><td>{fmtData(a.data.slice(0, 10))}</td><td>{a.entidade}</td><td>{a.descricao}</td><td>{a.periodosAfetados.join(', ')}</td><td>{a.motivo}</td><td>{campo ? <><Valor v={an?.[campo] as number | null} vazio="—" /> → <Valor v={dp?.[campo] as number | null} vazio="excluído" /></> : ''}</td></tr>) })}</tbody></table></div>
        )}
      </Card>

      <Card title="Zona de risco">
        <button className="btn-danger" onClick={() => setLimpar(true)}>Apagar todos os dados</button>
        <p className="text-xs text-muted mt-2">Remove tudo do banco local (investimentos, posições, bens, dívidas…). Não há como desfazer: baixe um backup antes.</p>
      </Card>

      <Confirm aberto={!!restaurar} titulo={`Restaurar backup (${restaurar?.modo})`} confirmar="Restaurar" perigoso={restaurar?.modo === 'substituir'} onCancelar={() => setRestaurar(null)}
        mensagem={<>Backup gerado em {restaurar && fmtData(restaurar.b.geradoEm.slice(0, 10))} com {restaurar?.b.investimentos?.length ?? 0} investimentos, {restaurar?.b.posicoes?.length ?? 0} posições e {restaurar?.b.movimentacoes?.length ?? 0} movimentações.{restaurar?.modo === 'substituir' && <> <strong>Toda a base atual será apagada</strong> antes.</>}</>}
        onConfirmar={async () => { try { const r = await api.restaurar(restaurar!.b, restaurar!.modo); aviso(`Restaurado: ${Object.entries(r.inseridos).map(([k, v]) => `${k} ${v}`).join(', ')}.${r.copia ? ` Cópia dos dados anteriores: ${r.copia}` : ''}`); setRestaurar(null); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }} />
      <Modal aberto={limpar} titulo="Apagar todos os dados" onFechar={() => { setLimpar(false); setConfirmaTexto('') }} largura="max-w-md">
        <p className="text-sm text-ink-2">Digite <code>APAGAR TUDO</code> para confirmar. Isto não pode ser desfeito sem um backup.</p>
        <input className="input mt-2" value={confirmaTexto} onChange={(e) => setConfirmaTexto(e.target.value)} />
        <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => { setLimpar(false); setConfirmaTexto('') }}>Cancelar</button><button className="btn-danger" disabled={confirmaTexto !== 'APAGAR TUDO'} onClick={async () => { try { const r = await api.limpar(); aviso(`Base apagada.${r.copia ? ` Cópia guardada em ${r.copia}` : ''}`); setLimpar(false); setConfirmaTexto(''); await recarregar() } catch (e) { aviso((e as Error).message, 'erro') } }}>Apagar</button></div>
      </Modal>
      <Confirm aberto={!!conflito} titulo="Valor diferente já registrado" confirmar="Substituir pelo valor do Finanças" onCancelar={() => setConflito(null)}
        mensagem={<>Em {conflito && fmtMesAno(conflito.ano, conflito.mes)} o Patrimônio registra aporte líquido de <Valor v={conflito?.atual} sinal /> e o Finanças soma <Valor v={conflito?.novo} sinal />. Nada foi alterado. Se substituir, a alteração fica registrada como correção histórica e o resultado do mês é recalculado.</>}
        onConfirmar={async () => { const c = conflito!; setConflito(null); await importarFluxo({ ano: c.ano, mes: c.mes } as FluxoFinancas, true) }} />
    </div>
  )
}
