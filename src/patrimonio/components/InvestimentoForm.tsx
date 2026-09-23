import { useState } from 'react'
import { api } from '@pat/lib/api'
import { useStore } from '@pat/lib/store'
import { Modal, Campo } from './ui'
import { CATEGORIAS, CATEGORIA_LABEL, type Investimento, type InvestimentoInput } from '@pat-shared/types'

const vazio: InvestimentoInput = { nome: '', codigo: null, categoria: 'RendaFixa', subtipo: null, instituicao: null, dataInicio: null, dataEncerramento: null, vencimento: null, indexador: null, condicoes: null, observacoes: null, situacao: 'ativo', origem: 'manual', origemArquivo: null }

export function InvestimentoForm({ inv, onFechar, onSalvo }: { inv?: Investimento; onFechar: () => void; onSalvo: (i: Investimento) => void }) {
  const { aviso, base } = useStore()
  const [f, setF] = useState<InvestimentoInput>(inv ? { ...inv } : vazio)
  const [motivo, setMotivo] = useState('')
  const set = (k: keyof InvestimentoInput, v: string) => setF({ ...f, [k]: v === '' ? null : v })
  const instituicoes = [...new Set(base.investimentos.map((i) => i.instituicao).filter(Boolean))] as string[]
  const salvar = async () => {
    try {
      const salvo = inv ? await api.atualizar<Investimento>('investimentos', inv.id, { ...f, motivo: motivo || undefined }) : await api.criar<Investimento>('investimentos', f)
      aviso(inv ? 'Investimento atualizado.' : 'Investimento cadastrado.')
      onSalvo(salvo)
    } catch (e) { aviso((e as Error).message, 'erro') }
  }
  return (
    <Modal aberto titulo={inv ? `Editar ${inv.nome}` : 'Novo investimento'} onFechar={onFechar}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Campo rotulo="Nome" className="sm:col-span-2"><input className="input" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="ex.: CDB Banco X 110% CDI, ITSA4, Fundo Y" /></Campo>
        <Campo rotulo="Código / ticker"><input className="input" value={f.codigo ?? ''} onChange={(e) => set('codigo', e.target.value.toUpperCase())} /></Campo>
        <Campo rotulo="Categoria"><select className="input" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value as Investimento['categoria'] })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>)}</select></Campo>
        <Campo rotulo="Subtipo" dica="CDB, LCA, Multimercado…"><input className="input" value={f.subtipo ?? ''} onChange={(e) => set('subtipo', e.target.value)} /></Campo>
        <Campo rotulo="Instituição"><input className="input" list="instituicoes" value={f.instituicao ?? ''} onChange={(e) => set('instituicao', e.target.value)} /><datalist id="instituicoes">{instituicoes.map((i) => <option key={i} value={i} />)}</datalist></Campo>
        <Campo rotulo="Data de início"><input className="input" type="date" value={f.dataInicio ?? ''} onChange={(e) => set('dataInicio', e.target.value)} /></Campo>
        <Campo rotulo="Vencimento"><input className="input" type="date" value={f.vencimento ?? ''} onChange={(e) => set('vencimento', e.target.value)} /></Campo>
        <Campo rotulo="Indexador" dica="CDI, IPCA, SELIC, prefixado"><input className="input" value={f.indexador ?? ''} onChange={(e) => set('indexador', e.target.value)} /></Campo>
        <Campo rotulo="Condições" dica="ex.: 110% do CDI, IPCA + 6%"><input className="input" value={f.condicoes ?? ''} onChange={(e) => set('condicoes', e.target.value)} /></Campo>
        <Campo rotulo="Situação"><select className="input" value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as Investimento['situacao'] })}><option value="ativo">Ativo</option><option value="encerrado">Encerrado</option><option value="revisar">Revisar</option></select></Campo>
        {f.situacao === 'encerrado' && <Campo rotulo="Data de encerramento"><input className="input" type="date" value={f.dataEncerramento ?? ''} onChange={(e) => set('dataEncerramento', e.target.value)} /></Campo>}
        <Campo rotulo="Observações" className="sm:col-span-2"><textarea className="input" rows={2} value={f.observacoes ?? ''} onChange={(e) => set('observacoes', e.target.value)} /></Campo>
        {inv && <Campo rotulo="Motivo da alteração (opcional, vai para o histórico)" className="sm:col-span-2"><input className="input" value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>}
      </div>
      <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={onFechar}>Cancelar</button><button className="btn-primary" onClick={salvar} disabled={!f.nome.trim()}>Salvar</button></div>
    </Modal>
  )
}
