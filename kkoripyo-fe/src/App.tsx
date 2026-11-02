import { Navigate, Route, Routes } from 'react-router'
import HomePage from '@/pages/home-page'
import NotFoundPage from '@/pages/not-found-page'

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/streaming" element={<Navigate to="/" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
