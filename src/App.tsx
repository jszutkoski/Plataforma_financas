import { HashRouter, Navigate, Route, Routes } from 'react-router'
import { StoreProvider as FinStore } from '@fin/lib/store'
import { PeriodoProvider } from '@fin/lib/periodo'
import { StoreProvider as PatStore } from '@pat/lib/store'
import { Shell } from './Shell'
import { Dashboard as FinDashboard } from '@fin/pages/Dashboard'
import { Lancamentos } from '@fin/pages/Lancamentos'
import { Recorrentes } from '@fin/pages/Recorrentes'
import { Categorias } from '@fin/pages/Categorias'
import { Importar as FinImportar } from '@fin/pages/Importar'
import { Projetos } from '@fin/pages/Projetos'
import { Dados as FinDados } from '@fin/pages/Dados'
import { Projecao } from '@fin/pages/Projecao'
import { Tendencia } from '@fin/pages/Tendencia'
import { Dashboard as PatDashboard } from '@pat/pages/Dashboard'
import { Anos } from '@pat/pages/Anos'
import { AtualizarMes } from '@pat/pages/AtualizarMes'
import { Investimentos } from '@pat/pages/Investimentos'
import { Movimentacoes } from '@pat/pages/Movimentacoes'
import { BensDividas } from '@pat/pages/Bens'
import { Importar as PatImportar } from '@pat/pages/Importar'
import { Dados as PatDados } from '@pat/pages/Dados'
import { Conciliacao } from '@pat/pages/Conciliacao'

export default function App() {
  return (
    <FinStore>
      <PeriodoProvider>
        <PatStore>
          <HashRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Navigate to="/financas" replace />} />
                <Route path="financas">
                  <Route index element={<FinDashboard />} />
                  <Route path="lancamentos" element={<Lancamentos />} />
                  <Route path="recorrentes" element={<Recorrentes />} />
                  <Route path="categorias" element={<Categorias />} />
                  <Route path="importar" element={<FinImportar />} />
                  <Route path="projetos" element={<Projetos />} />
                  <Route path="projecao" element={<Projecao />} />
                  <Route path="tendencias" element={<Tendencia />} />
                  <Route path="dados" element={<FinDados />} />
                </Route>
                <Route path="patrimonio">
                  <Route index element={<PatDashboard />} />
                  <Route path="anos" element={<Anos />} />
                  <Route path="atualizar" element={<AtualizarMes />} />
                  <Route path="investimentos" element={<Investimentos />} />
                  <Route path="movimentacoes" element={<Movimentacoes />} />
                  <Route path="bens" element={<BensDividas />} />
                  <Route path="importar" element={<PatImportar />} />
                  <Route path="conciliacao" element={<Conciliacao />} />
                  <Route path="dados" element={<PatDados />} />
                </Route>
                <Route path="*" element={<Navigate to="/financas" replace />} />
              </Route>
            </Routes>
          </HashRouter>
        </PatStore>
      </PeriodoProvider>
    </FinStore>
  )
}
