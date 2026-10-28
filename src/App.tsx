import { useMemo } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { Layout } from './components/Layout'
import { createRepository } from './data/createRepository'
import { DataProvider } from './data/DataContext'
import { useAuth } from './hooks/useAuth'
import { BankCallbackPage } from './pages/BankCallbackPage'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MortgageDetailPage } from './pages/MortgageDetailPage'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'hypotheek/:id', element: <MortgageDetailPage /> },
      { path: 'bank/callback', element: <BankCallbackPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
])

/**
 * Toegangspoort: zonder geldige sessie wordt alleen het inlogscherm gerenderd. De app
 * (en daarmee elke data-aanroep) bestaat pas na inloggen. De URL blijft staan, zodat je
 * na het inloggen terugkomt op de pagina die je opende.
 */
function Gate() {
  const { state } = useAuth()
  const client = state.status === 'signed-in' ? state.client : null
  const repository = useMemo(() => createRepository(client), [client])

  switch (state.status) {
    case 'loading':
      return <p className="py-20 text-center text-sm text-slate-500">Laden…</p>
    case 'error':
      return (
        <p role="alert" className="py-20 text-center text-sm text-red-700">
          {state.message}
        </p>
      )
    case 'signed-out':
      return <LoginPage />
    case 'local':
    case 'signed-in':
      return (
        // `key`: bij een andere gebruiker begint de data-state helemaal opnieuw.
        <DataProvider
          key={state.status === 'signed-in' ? state.user.id : 'local'}
          repository={repository}
          autoSeed={state.status === 'local'}
        >
          <RouterProvider router={router} />
        </DataProvider>
      )
  }
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}
