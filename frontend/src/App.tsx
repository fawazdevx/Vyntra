import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Feed } from './pages/Feed'
import { Spawn } from './pages/Spawn'
import { Token } from './pages/Token'
import { Dashboard } from './pages/Dashboard'
import { Portfolio } from './pages/Portfolio'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Feed />} />
          <Route path="spawn" element={<Spawn />} />
          <Route path="token/:id" element={<Token />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="portfolio" element={<Portfolio />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
