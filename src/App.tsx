import { Suspense, use } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { Layout } from './components/Layout'
import { createRepository } from './data/createRepository'
import { DataProvider } from './data/DataContext'
import { DashboardPage } from './pages/DashboardPage'
import { MortgageDetailPage } from './pages/MortgageDetailPage'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'hypotheek/:id', element: <MortgageDetailPage /> },
      { path: '*', element: <DashboardPage /> },
    ],
  },
])

const repositoryPromise = createRepository()

function Root() {
  const repository = use(repositoryPromise)
  return (
    <DataProvider repository={repository}>
      <RouterProvider router={router} />
    </DataProvider>
  )
}

export default function App() {
  return (
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  )
}
