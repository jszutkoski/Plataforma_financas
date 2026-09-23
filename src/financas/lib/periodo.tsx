import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useStore } from './store'
import { ultimoMesComDados } from './analytics'

interface Periodo { ano: number; mes: number; modo: 'mensal' | 'anual'; setAno: (a: number) => void; setMes: (m: number) => void; setModo: (m: 'mensal' | 'anual') => void; irPara: (ano: number, mes: number) => void }
const Ctx = createContext<Periodo | null>(null)

export function PeriodoProvider({ children }: { children: ReactNode }) {
  const { lancamentos, carregando } = useStore()
  const [ano, setAno] = useState<number>(() => Number(localStorage.getItem('fin.ano')) || new Date().getFullYear())
  const [mes, setMes] = useState<number>(() => Number(localStorage.getItem('fin.mes')) || new Date().getMonth() + 1)
  const [modo, setModo] = useState<'mensal' | 'anual'>(() => (localStorage.getItem('fin.modo') as 'mensal' | 'anual') || 'mensal')
  const [inicializado, setInicializado] = useState(!!localStorage.getItem('fin.ano'))

  useEffect(() => {
    if (carregando || inicializado || !lancamentos.length) return
    const u = ultimoMesComDados(lancamentos)
    setAno(u.ano); setMes(u.mes); setInicializado(true)
  }, [carregando, inicializado, lancamentos])
  useEffect(() => { localStorage.setItem('fin.ano', String(ano)); localStorage.setItem('fin.mes', String(mes)); localStorage.setItem('fin.modo', modo) }, [ano, mes, modo])

  const v = useMemo<Periodo>(() => ({ ano, mes, modo, setAno, setMes, setModo, irPara: (a, m) => { setAno(a); setMes(m); setModo('mensal') } }), [ano, mes, modo])
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>
}
export function usePeriodo(): Periodo {
  const p = useContext(Ctx)
  if (!p) throw new Error('usePeriodo fora do provider')
  return p
}
