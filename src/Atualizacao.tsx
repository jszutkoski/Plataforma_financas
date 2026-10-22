import { useEffect, useState } from 'react'
import { atualizacao, infoApp, type Verificacao } from '@app/lib/ponte'
import { Modal } from '@fin/components/ui'

type Estado = { f: 'verificando' } | { f: 'resultado'; v: Verificacao } | { f: 'baixando'; v: Verificacao; pct: number } | { f: 'pronto'; versao: string } | { f: 'erro'; msg: string; v?: Verificacao }

/** Versão instalada e botão de atualizar (consulta o GitHub só quando clicado). */
export function Atualizacao() {
  const [versao, setVersao] = useState<string | null>(null)
  const [estado, setEstado] = useState<Estado | null>(null)
  useEffect(() => { infoApp().then((i) => setVersao(i.versao)).catch(() => setVersao(null)) }, [])
  useEffect(() => atualizacao.aoProgredir((pct) => setEstado((e) => (e?.f === 'baixando' ? { ...e, pct } : e))), [])

  const verificar = async () => {
    setEstado({ f: 'verificando' })
    try { setEstado({ f: 'resultado', v: await atualizacao.verificar() }) } catch (e) { setEstado({ f: 'erro', msg: (e as Error).message }) }
  }
  const instalar = async (v: Verificacao) => {
    setEstado({ f: 'baixando', v, pct: 0 })
    try { const r = await atualizacao.instalar(); setEstado({ f: 'pronto', versao: r.versao }) } catch (e) { setEstado({ f: 'erro', msg: (e as Error).message, v }) }
  }
  const baixando = estado?.f === 'baixando'

  return (
    <>
      <button className="text-left underline-offset-2 hover:underline" onClick={verificar}>Versão {versao ?? '—'} · verificar atualização</button>
      <Modal aberto={!!estado} titulo="Atualização" onFechar={() => { if (!baixando) setEstado(null) }} largura="max-w-lg">
        {estado?.f === 'verificando' && <p className="text-sm text-ink-2">Consultando a última versão no GitHub…</p>}
        {estado?.f === 'resultado' && !estado.v.nova && <p className="text-sm">Você está na versão mais recente ({estado.v.atual}).</p>}
        {(estado?.f === 'resultado' || estado?.f === 'baixando') && estado.v.nova && (
          <div className="space-y-3">
            <p className="text-sm">Versão <strong>{estado.v.ultima}</strong> disponível (você tem a {estado.v.atual}).</p>
            {estado.v.notas && <pre className="text-xs text-ink-2 whitespace-pre-wrap max-h-48 overflow-y-auto bg-surface-2 rounded-lg p-2 font-sans">{estado.v.notas}</pre>}
            {estado.f === 'baixando' ? (
              <div>
                <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full bg-renda transition-[width]" style={{ width: `${estado.pct}%` }} /></div>
                <p className="text-xs text-muted mt-1">Baixando e conferindo… {estado.pct}%. Pode continuar usando o app.</p>
              </div>
            ) : estado.v.podeInstalar ? (
              <div className="flex justify-end gap-2">
                <button className="btn-ghost" onClick={() => setEstado(null)}>Agora não</button>
                <button className="btn-primary" onClick={() => instalar(estado.v)}>Baixar e instalar</button>
              </div>
            ) : (
              <div className="space-y-2">
                {estado.v.motivo && <p className="text-xs text-muted">{estado.v.motivo}</p>}
                <div className="flex justify-end"><a className="btn-primary" href={estado.v.pagina} target="_blank" rel="noreferrer">Abrir página da versão</a></div>
              </div>
            )}
          </div>
        )}
        {estado?.f === 'pronto' && (
          <div className="space-y-3">
            <p className="text-sm">Versão {estado.versao} instalada. Os dados não mudam; reinicie para usar a versão nova.</p>
            <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setEstado(null)}>Depois</button><button className="btn-primary" onClick={() => atualizacao.reiniciar()}>Reiniciar agora</button></div>
          </div>
        )}
        {estado?.f === 'erro' && (
          <div className="space-y-3">
            <p className="text-sm text-bad">{estado.msg}</p>
            <div className="flex justify-end gap-2">
              {estado.v && <a className="btn-ghost" href={estado.v.pagina} target="_blank" rel="noreferrer">Abrir página da versão</a>}
              <button className="btn-primary" onClick={verificar}>Tentar de novo</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
