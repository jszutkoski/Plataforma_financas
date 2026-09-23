import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Alteracao, Pendencia, Info } from '@pat-shared/types'
import { indexar, mesesDisponiveis, ultimoFechamento, type Base, type Indices } from '@pat-shared/calc'
import { api } from './api'

export interface Store {
  base: Base
  ix: Indices
  alteracoes: Alteracao[]
  pendencias: Pendencia[]
  info: Info | null
  carregando: boolean
  erro: string | null
  recarregar: () => Promise<void>
  aviso: (msg: string, tipo?: 'ok' | 'erro') => void
  toast: { msg: string; tipo: 'ok' | 'erro' } | null
  /** ocultar valores monetários (privacidade) */
  oculto: boolean
  setOculto: (v: boolean) => void
  /** faixa de meses conhecida e último fechamento */
  meses: ReturnType<typeof mesesDisponiveis>
  ultimo: [number, number] | null
  anos: number[]
}

const VAZIA: Base = { investimentos: [], posicoes: [], posicoesConsolidadas: [], movimentacoes: [], fluxosConsolidados: [], contas: [], saldosConta: [], bens: [], avaliacoesBem: [], dividas: [], saldosDivida: [], fechamentos: [] }
const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [base, setBase] = useState<Base>(VAZIA)
  const [alteracoes, setAlt] = useState<Alteracao[]>([])
  const [pendencias, setPend] = useState<Pendencia[]>([])
  const [info, setInfo] = useState<Info | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [toast, setToast] = useState<Store['toast']>(null)
  const [oculto, setOcultoState] = useState(() => localStorage.getItem('pat.oculto') === '1')
  const setOculto = useCallback((v: boolean) => { setOcultoState(v); localStorage.setItem('pat.oculto', v ? '1' : '0') }, [])

  const recarregar = useCallback(async () => {
    try {
      const [b, i] = await Promise.all([api.base(), api.info()])
      const { alteracoes: a, pendencias: p, ...resto } = b
      setBase(resto as Base); setAlt(a as Alteracao[]); setPend(p as Pendencia[]); setInfo(i); setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => { void recarregar() }, [recarregar])

  const aviso = useCallback((msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    window.setTimeout(() => setToast(null), tipo === 'erro' ? 7000 : 3000)
  }, [])

  const ix = useMemo(() => indexar(base), [base])
  const meses = useMemo(() => mesesDisponiveis(base), [base])
  const ultimo = useMemo(() => ultimoFechamento(base, ix), [base, ix])
  const anos = useMemo(() => {
    const a0 = Number(meses.primeiro.slice(0, 4)), a1 = Math.max(Number(meses.ultimo.slice(0, 4)), new Date().getFullYear())
    return Array.from({ length: a1 - a0 + 1 }, (_, i) => a0 + i)
  }, [meses])

  const value = useMemo<Store>(() => ({ base, ix, alteracoes, pendencias, info, carregando, erro, recarregar, aviso, toast, oculto, setOculto, meses, ultimo, anos }),
    [base, ix, alteracoes, pendencias, info, carregando, erro, recarregar, aviso, toast, oculto, setOculto, meses, ultimo, anos])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fora do StoreProvider')
  return s
}
