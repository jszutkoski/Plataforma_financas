import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lancamento, Categoria, Conta, Recorrencia, Projeto } from '@fin-shared/types'
import { api, type Info } from './api'

interface Store {
  lancamentos: Lancamento[]
  categorias: Categoria[]
  contas: Conta[]
  recorrencias: Recorrencia[]
  projetos: Projeto[]
  info: Info | null
  carregando: boolean
  erro: string | null
  recarregar: () => Promise<void>
  aviso: (msg: string, tipo?: 'ok' | 'erro') => void
  toast: { msg: string; tipo: 'ok' | 'erro' } | null
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [lancamentos, setL] = useState<Lancamento[]>([])
  const [categorias, setC] = useState<Categoria[]>([])
  const [contas, setCo] = useState<Conta[]>([])
  const [recorrencias, setR] = useState<Recorrencia[]>([])
  const [projetos, setP] = useState<Projeto[]>([])
  const [info, setInfo] = useState<Info | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [toast, setToast] = useState<Store['toast']>(null)

  const recarregar = useCallback(async () => {
    try {
      const [l, c, co, r, p, i] = await Promise.all([api.lancamentos(), api.categorias(), api.contas(), api.recorrencias(), api.projetos(), api.info()])
      setL(l); setC(c); setCo(co); setR(r); setP(p); setInfo(i); setErro(null)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void recarregar() }, [recarregar])

  const aviso = useCallback((msg: string, tipo: 'ok' | 'erro' = 'ok') => {
    setToast({ msg, tipo })
    window.setTimeout(() => setToast(null), tipo === 'erro' ? 6000 : 3000)
  }, [])

  const value = useMemo<Store>(() => ({ lancamentos, categorias, contas, recorrencias, projetos, info, carregando, erro, recarregar, aviso, toast }),
    [lancamentos, categorias, contas, recorrencias, projetos, info, carregando, erro, recarregar, aviso, toast])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('useStore fora do StoreProvider')
  return s
}
