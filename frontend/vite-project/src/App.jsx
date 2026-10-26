import { useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import ExploreCountries from './pages/ExploreCountries.jsx'
import { fetchCountries } from './services/api.js'
import './App.css'

function useCountries() {
  const [countries, setCountries] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetchCountries({ signal: controller.signal })
      .then((items) => {
        setCountries(items)
        setLoadState(items.length ? 'ready' : 'empty')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setErrorMessage(error.response?.data?.message || (error.message === 'Network Error'
          ? 'The country directory could not be reached. Check the backend connection and try again.'
          : error.message || 'The country directory could not be reached.'))
        setLoadState('error')
      })
    return () => controller.abort()
  }, [retry])

  function onRetry() {
    setLoadState('loading')
    setErrorMessage('')
    setRetry((value) => value + 1)
  }

  return { countries, loadState, errorMessage, onRetry }
}

export default function App() {
  const countriesState = useCountries()
  const isDirectoryPage = window.location.pathname.replace(/\/+$/, '') === '/countries'
  return <div className="site-shell" id="home">
    <Navbar />
    {isDirectoryPage ? <ExploreCountries {...countriesState} /> : <Home {...countriesState} />}
    <Footer />
  </div>
}
