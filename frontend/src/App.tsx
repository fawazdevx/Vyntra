import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Feed } from './pages/Feed'
import { Spawn } from './pages/Spawn'
import { Token } from './pages/Token'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'
import { Platform } from './pages/Platform'
import { Bridge } from './pages/Bridge'
import { Landing } from './pages/Landing'
import { About } from './pages/About'
import { Docs, VyntraAgentsPage } from './pages/Docs'
import { ErrorBoundary } from './components/ErrorBoundary'

function withBoundary(node: React.ReactNode) {
  return <ErrorBoundary>{node}</ErrorBoundary>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={withBoundary(<Landing />)} />
        <Route path="docs" element={withBoundary(<Docs />)} />
        <Route path="docs/:slug" element={withBoundary(<Docs />)} />
        <Route path="apps/mcp" element={withBoundary(<VyntraAgentsPage />)} />
        <Route element={<Layout allowUnconfigured />}>
          <Route path="about" element={withBoundary(<About />)} />
        </Route>
        <Route element={<Layout />}>
          <Route path="markets" element={withBoundary(<Feed />)} />
          <Route path="spawn" element={withBoundary(<Spawn />)} />
          <Route path="token/:id" element={withBoundary(<Token />)} />
          <Route path="dashboard" element={withBoundary(<Dashboard />)} />
          <Route path="portfolio" element={withBoundary(<Portfolio />)} />
          <Route path="vyntra" element={withBoundary(<Platform />)} />
          <Route path="bridge" element={withBoundary(<Bridge />)} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
