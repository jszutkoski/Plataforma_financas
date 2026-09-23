import { useState } from 'react'
import { api } from '@pat/lib/api'
import { useStore } from '@pat/lib/store'
import { Modal, Campo } from './ui'
import { parseValorBR, hojeISO } from '@pat/lib/format'
import { TIPOS_MOV, TIPO_MOV_LABEL, ORIGEM_RECURSO_LABEL, CATEGORIA_LABEL, type Movimentacao, type MovimentacaoInput, type TipoMovimentacao, type OrigemRecurso } from '@pat-shared/types'

export function MovimentacaoForm({ mov, investimentoId, onFechar, onSalvo }: { mov?: Movimentacao; investimentoId?: string; onFechar: () => void; onSalvo: () => void }) {
  const { base, aviso } = useStore()
  const [f, setF] = useState({
    investimentoId: mov?.investimentoId ?? investimentoId ?? '', tipo: (mov?.tipo ?? 'aplicacao') as TipoMovimentacao, data: mov?.data ?? hojeISO(), valor: mov?.valor != null ? String(mov.valor).replace('.', ',') : '',
    quantidade: mov?.quantidade != null ? String(mov.quantidade).replace('.', ',') : '', preco: mov?.preco != null ? String(mov.preco).replace('.', ',') : '', taxas: mov?.taxas != null ? String(mov.taxas).replace('.', ',') : '', irrf: mov?.irrf != null ? String(mov.irrf).replace('.', ',') : '',
    origemRecurso: (mov?.origemRecurso ?? 'externo') as OrigemRecurso, contaId: mov?.contaId ?? '', foraDaPosicao: mov?.foraDaPosicao ?? true, observacoes: mov?.observacoes ?? '', situacao: mov?.situacao ?? 'confirmada',
  })
  const [motivo, setMotivo] = useState('')
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v })
  const comQtd = ['compra', 'venda', 'bonificacao', 'evento'].includes(f.tipo)
  const salvar = async () => {
    const valor = parseValorBR(f.valor), quantidade = parseValorBR(f.quantidade), preco = parseValorBR(f.preco)
    const item: MovimentacaoInput = {
      investimentoId: f.investimentoId || null, tipo: f.tipo, data: f.data || null, valor: valor ?? (quantidade != null && preco != null ? Math.round(quantidade * preco * 100) / 100 : null), quantidade, preco,
      taxas: parseValorBR(f.taxas), irrf: parseValorBR(f.irrf), origemRecurso: f.origemRecurso, contaId: f.contaId || null, foraDaPosicao: f.tipo === 'provento' ? f.foraDaPosicao : false,
      observacoes: f.observacoes || null, origem: mov?.origem ?? 'manual', origemArquivo: mov?.origemArquivo ?? null, situacao: f.situacao as Movimentacao['situacao'],
    }
    try {
      if (mov) await api.atualizar('movimentacoes', mov.id, { ...item, motivo: motivo || undefined }); else await api.criar('movimentacoes', item)
      aviso(mov ? 'Movimentação atualizada.' : 'Movimentação registrada.'); onSalvo()
    } catch (e) { aviso((e as Error).message, 'erro') }
  }
  return (
    <Modal aberto titulo={mov ? 'Editar movimentação' : 'Nova movimentação'} onFechar={onFechar}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="Investimento" className="sm:col-span-2"><select className="input" value={f.investimentoId} onChange={(e) => set('investimentoId', e.target.value)}><option value="">— sem ativo (consolidado) —</option>{[...base.investimentos].sort((a, b) => a.nome.localeCompare(b.nome)).map((i) => <option key={i.id} value={i.id}>{i.nome} · {CATEGORIA_LABEL[i.categoria]}{i.situacao === 'encerrado' ? ' (encerrado)' : ''}</option>)}</select></Campo>
        <Campo rotulo="Tipo"><select className="input" value={f.tipo} onChange={(e) => set('tipo', e.target.value as TipoMovimentacao)}>{TIPOS_MOV.map((t) => <option key={t} value={t}>{TIPO_MOV_LABEL[t]}</option>)}</select></Campo>
        <Campo rotulo="Data" dica="vazia = competência desconhecida (fica pendente)"><input className="input" type="date" value={f.data} onChange={(e) => set('data', e.target.value)} /></Campo>
        {comQtd && <Campo rotulo="Quantidade"><input className="input" inputMode="decimal" value={f.quantidade} onChange={(e) => set('quantidade', e.target.value)} /></Campo>}
        {comQtd && <Campo rotulo="Preço unitário (R$)"><input className="input" inputMode="decimal" value={f.preco} onChange={(e) => set('preco', e.target.value)} /></Campo>}
        <Campo rotulo="Valor (R$)" dica={comQtd ? 'vazio = quantidade × preço' : 'sempre positivo'}><input className="input" inputMode="decimal" value={f.valor} onChange={(e) => set('valor', e.target.value)} /></Campo>
        <Campo rotulo="Taxas (R$)"><input className="input" inputMode="decimal" value={f.taxas} onChange={(e) => set('taxas', e.target.value)} /></Campo>
        <Campo rotulo="IRRF (R$)" dica="informativo; o valor acima é o bruto"><input className="input" inputMode="decimal" value={f.irrf} onChange={(e) => set('irrf', e.target.value)} /></Campo>
        <Campo rotulo="Origem do recurso" dica="define se é dinheiro novo na carteira"><select className="input" value={f.origemRecurso} onChange={(e) => set('origemRecurso', e.target.value as OrigemRecurso)}>{(['externo', 'interno', 'nao_informado'] as OrigemRecurso[]).map((o) => <option key={o} value={o}>{ORIGEM_RECURSO_LABEL[o]}</option>)}</select></Campo>
        <Campo rotulo="Conta (para aplicações/resgates)"><select className="input" value={f.contaId} onChange={(e) => set('contaId', e.target.value)}><option value="">—</option>{base.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></Campo>
        {f.tipo === 'provento' && <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.foraDaPosicao} onChange={(e) => set('foraDaPosicao', e.target.checked)} /> Pago em conta, fora da posição (entra no resultado). Desmarque se o valor já está no saldo do investimento.</label>}
        <Campo rotulo="Situação"><select className="input" value={f.situacao} onChange={(e) => set('situacao', e.target.value as Movimentacao['situacao'])}><option value="confirmada">Confirmada</option><option value="revisar">Revisar</option><option value="pendente">Pendente</option></select></Campo>
        <Campo rotulo="Observações" className="sm:col-span-2"><input className="input" value={f.observacoes} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
        {mov && <Campo rotulo="Motivo da alteração (histórico)" className="sm:col-span-2"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
      </div>
      <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={onFechar}>Cancelar</button><button className="btn-primary" onClick={salvar}>Salvar</button></div>
    </Modal>
  )
}
