import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useStore as useFin } from '@fin/lib/store'
import { useStore as usePat } from '@pat/lib/store'
import { Toast as ToastFin } from '@fin/components/ui'
import { Toast as ToastPat } from '@pat/components/ui'

const NAV_FIN = [
  { to: '/financas', rotulo: 'Painel', icone: '◫' },
  { to: '/financas/lancamentos', rotulo: 'Lançamentos', icone: '☰' },
  { to: '/financas/recorrentes', rotulo: 'Recorrentes', icone: '↻' },
  { to: '/financas/categorias', rotulo: 'Categorias', icone: '⌗' },
  { to: '/financas/importar', rotulo: 'Importar', icone: '⇪' },
  { to: '/financas/projetos', rotulo: 'Projetos', icone: '▤' },
  { to: '/financas/dados', rotulo: 'Dados', icone: '⛁' },
]
const NAV_PAT = [
  { to: '/patrimonio', rotulo: 'Painel', icone: '◫' },
  { to: '/patrimonio/anos', rotulo: 'Anos', icone: '▦' },
  { to: '/patrimonio/atualizar', rotulo: 'Atualizar mês', icone: '✎' },
  { to: '/patrimonio/investimentos', rotulo: 'Investimentos', icone: '☰' },
  { to: '/patrimonio/movimentacoes', rotulo: 'Movimentações', icone: '⇅' },
  { to: '/patrimonio/bens', rotulo: 'Bens e dívidas', icone: '⌂' },
  { to: '/patrimonio/importar', rotulo: 'Importar', icone: '⇪' },
  { to: '/patrimonio/dados', rotulo: 'Dados', icone: '⛁' },
]

function useTema() {
  const [tema, setTema] = useState<'claro' | 'escuro' | 'auto'>(() => (localStorage.getItem('app.tema') as 'claro' | 'escuro' | 'auto') || 'auto')
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aplicar = () => document.documentElement.classList.toggle('dark', tema === 'escuro' || (tema === 'auto' && mq.matches))
    aplicar(); mq.addEventListener('change', aplicar)
    localStorage.setItem('app.tema', tema)
    return () => mq.removeEventListener('change', aplicar)
  }, [tema])
  return { tema, setTema }
}

/** Casca única do aplicativo: as duas seções dividem janela, tema e barra lateral. */
export function Shell() {
  const fin = useFin()
  const pat = usePat()
  const { tema, setTema } = useTema()
  const local = useLocation()
  const emPatrimonio = local.pathname.startsWith('/patrimonio')
  const nav = emPatrimonio ? NAV_PAT : NAV_FIN
  const secao = emPatrimonio ? pat : fin
  const erro = fin.erro ?? pat.erro

  const aba = (ativa: boolean) => `flex-1 rounded-lg px-2 py-1.5 text-xs font-medium text-center ${ativa ? 'bg-renda text-white' : 'text-ink-2 hover:bg-surface-2'}`

  return (
    <div className="min-h-screen flex flex-col sm:flex-row">
      <aside className="hidden sm:flex sm:flex-col w-52 shrink-0 border-r p-3 gap-1 sticky top-0 h-screen" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex gap-1 mb-3 p-1 rounded-xl" style={{ background: 'var(--surface-2)' }}>
          <NavLink to="/financas" className={({ isActive }) => aba(isActive || !emPatrimonio)}>Finanças</NavLink>
          <NavLink to="/patrimonio" className={() => aba(emPatrimonio)}>Patrimônio</NavLink>
        </div>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/financas' || n.to === '/patrimonio'} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-renda/12 text-renda font-medium' : 'text-ink-2 hover:bg-surface-2'}`}>
            <span aria-hidden className="w-4 text-center">{n.icone}</span>{n.rotulo}
          </NavLink>
        ))}
        <div className="mt-auto px-2 text-xs text-muted space-y-2">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={pat.oculto} onChange={(e) => pat.setOculto(e.target.checked)} /> Ocultar valores</label>
          <div>
            <label className="block mb-1">Tema</label>
            <select className="input !py-1 text-xs" value={tema} onChange={(e) => setTema(e.target.value as 'claro' | 'escuro' | 'auto')}>
              <option value="auto">Automático</option><option value="claro">Claro</option><option value="escuro">Escuro</option>
            </select>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 p-3 sm:p-6 pb-20 sm:pb-6 max-w-[1500px]">
        {erro && <div className="card p-3 mb-3 text-sm text-bad">Não foi possível ler os dados locais: {erro}</div>}
        {secao.carregando ? <div className="text-sm text-muted p-6">Carregando dados…</div> : <Outlet />}
      </main>
      <nav className="sm:hidden fixed bottom-0 inset-x-0 border-t flex justify-around py-1 z-40" style={{ borderColor: 'var(--border)', background: 'var(--surface)' }} aria-label="Navegação">
        {nav.slice(0, 6).map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/financas' || n.to === '/patrimonio'} className={({ isActive }) => `flex flex-col items-center px-1 py-1 text-[10px] ${isActive ? 'text-renda font-medium' : 'text-ink-2'}`}>
            <span aria-hidden className="text-base leading-5">{n.icone}</span>{n.rotulo}
          </NavLink>
        ))}
      </nav>
      <ToastFin toast={fin.toast} />
      <ToastPat toast={pat.toast} />
    </div>
  )
}
