import { useState } from 'react'
import { Link } from 'react-router'
import { useStore } from '@pat/lib/store'
import { api } from '@pat/lib/api'
import { Card, Confirm, Modal, Valor, Vazio } from '@pat/components/ui'
import { baixarCSV, baixarJSON } from '@pat/lib/csv'
import { fmtData } from '@pat/lib/format'
import type { Backup } from '@pat-shared/types'

export function Dados() {
  const { base, info, pendencias, alteracoes, recarregar, aviso } = useStore()
  const [restaurar, setRestaurar] = useState<{ b: Backup; modo: 'substituir' | 'mesclar' } | null>(null)
  const [limpar, setLimpar] = useState(false)
  const [confirmaTexto, setConfirmaTexto] = useState('')


  const contagens = info?.contagens ?? {}
  const lerBackup = async (f: File | null, modo: 'substituir' | 'mesclar') => {
    if (!f) return
    try { const b = JSON.parse(await f.text()) as Backup; if (b.versao !== 2 || b.app !== 'patrimonio') throw new Error('não é um backup do Patrimônio (versão 2)'); setRestaurar({ b, modo }) } catch (e) { aviso(`Arquivo inválido: ${(e as Error).message}`, 'erro') }
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

      <Card title="Integração com o Finanças" subtitle="Os dois apps usam bancos separados no mesmo processo.">
        <a id="financas" />
        <p className="text-sm text-ink-2">Finanças cuida do fluxo de caixa; Patrimônio, das posições. A comparação mês a mês, a importação do aporte líquido e a ligação entre lançamentos e movimentações ficam em <Link className="underline" to="/patrimonio/conciliacao">Conciliação</Link>. Aplicações nunca viram despesa, nem resgates viram renda.</p>
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

    </div>
  )
}
