import { useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import ExploreCountries from './pages/ExploreCountries.jsx'
import CountryDetail from './pages/CountryDetail.jsx'
import CulturalEntryDetail from './pages/CulturalEntryDetail.jsx'
import PlaceDetail from './pages/PlaceDetail.jsx'
import ContributionPage from './pages/ContributionPage.jsx'
import AdminPage from './pages/AdminPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import { adminLogout, fetchAdminSession, fetchCountries, fetchUserSession, logoutUser } from './services/api.js'
import { resolveAppRoute } from './services/route.js'
import UserAuthPage from './pages/UserAuthPage.jsx'
import MyCollectionPage from './pages/MyCollectionPage.jsx'
import CommunityPage, { CommunityPostDetailPage } from './pages/CommunityPage.jsx'
import AccountProfilePage from './pages/AccountProfilePage.jsx'
import { buildAuthPath } from './services/authNavigation.js'
import './App.css'

function useCountries(enabled = true) {
  const [countries, setCountries] = useState([])
  const [loadState, setLoadState] = useState('loading')
  const [errorMessage, setErrorMessage] = useState('')
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (!enabled) return undefined
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
  }, [retry, enabled])

  function onRetry() {
    setLoadState('loading')
    setErrorMessage('')
    setRetry((value) => value + 1)
  }

  return { countries, loadState, errorMessage, onRetry }
}

function useUserAuth() {
  const [auth, setAuth] = useState({ status: 'loading', user: null, csrfToken: '', error: '', retry: 0 })
  const [logoutBusy, setLogoutBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchUserSession({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setAuth((current) => ({ ...current, status: 'ready', user: data.user, csrfToken: data.csrfToken, error: '' }))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error.response?.status === 401) setAuth((current) => ({ ...current, status: 'ready', user: null, csrfToken: '', error: '' }))
        else setAuth((current) => ({ ...current, status: 'error', error: 'Your account session could not be checked.' }))
      })
    return () => controller.abort()
  }, [auth.retry])

  async function logout() {
    if (!auth.csrfToken || logoutBusy) return
    setLogoutBusy(true)
    try {
      await logoutUser(auth.csrfToken)
      setAuth((current) => ({ ...current, status: 'ready', user: null, csrfToken: '', error: '' }))
      window.location.assign('/')
    } catch {
      setAuth((current) => ({ ...current, error: 'Could not sign out. Please try again.' }))
    } finally {
      setLogoutBusy(false)
    }
  }

  function retry() {
    setAuth((current) => ({ ...current, status: 'loading', error: '', retry: current.retry + 1 }))
  }

  function updateUser(updated) {
    setAuth((current) => ({ ...current, user: { ...current.user, username: updated.username, displayName: updated.displayName } }))
  }

  return { ...auth, logoutBusy, logout, retry, updateUser }
}

function useAdminAuth() {
  const [auth, setAuth] = useState({ status: 'loading', session: null, error: '', retry: 0 })
  const [logoutBusy, setLogoutBusy] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetchAdminSession({ signal: controller.signal })
      .then((session) => {
        if (!controller.signal.aborted) setAuth((current) => ({ ...current, status: 'ready', session, error: '' }))
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        if (error.response?.status === 401) setAuth((current) => ({ ...current, status: 'ready', session: null, error: '' }))
        else setAuth((current) => ({ ...current, status: 'error', error: 'The administrator session could not be checked.' }))
      })
    return () => controller.abort()
  }, [auth.retry])

  async function logout() {
    if (!auth.session?.csrfToken || logoutBusy) return
    setLogoutBusy(true)
    try {
      await adminLogout(auth.session.csrfToken)
      setAuth((current) => ({ ...current, status: 'ready', session: null, error: '' }))
      window.location.assign('/')
    } catch {
      setAuth((current) => ({ ...current, error: 'Could not sign out of the administrator account. Please try again.' }))
    } finally {
      setLogoutBusy(false)
    }
  }

  function retry() {
    setAuth((current) => ({ ...current, status: 'loading', error: '', retry: current.retry + 1 }))
  }

  return { ...auth, logoutBusy, logout, retry }
}

export default function App() {
  const route = resolveAppRoute(window.location.pathname)
  const userAuth = useUserAuth()
  const countriesState = useCountries(route.type === 'home' || route.type === 'directory' || route.type === 'contribute' || route.type === 'community')
  const adminAuth = useAdminAuth()

  useEffect(() => {
    const communityParams = new URLSearchParams(window.location.search)
    if (route.type === 'community'
      && (communityParams.get('compose') === '1' || communityParams.has('edit'))
      && userAuth.status === 'ready'
      && !userAuth.user) {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(buildAuthPath('login', destination))
    }
  }, [route.type, userAuth.status, userAuth.user])

  useEffect(() => {
    if (route.type === 'profile' && userAuth.status === 'ready' && !userAuth.user) {
      window.location.replace(buildAuthPath('login', '/profile'))
    }
  }, [route.type, userAuth.status, userAuth.user])

  return <div className="site-shell" id="home">
    <Navbar userAuth={userAuth} adminAuth={adminAuth} />
    {route.type === 'country' && <CountryDetail slug={route.slug} auth={userAuth} />}
    {route.type === 'culturalEntry' && <CulturalEntryDetail slug={route.slug} entryId={route.entryId} auth={userAuth} />}
    {route.type === 'place' && <PlaceDetail slug={route.slug} placeId={route.placeId} auth={userAuth} />}
    {route.type === 'directory' && <ExploreCountries {...countriesState} />}
    {route.type === 'contribute' && <ContributionPage {...countriesState} auth={userAuth} />}
    {route.type === 'search' && <SearchPage />}
    {route.type === 'community' && <CommunityPage auth={userAuth} {...countriesState} />}
    {route.type === 'communityPost' && <CommunityPostDetailPage postId={route.postId} auth={userAuth} />}
    {route.type === 'profile' && userAuth.status === 'error' && <main className="profile-page"><p role="alert">Your account session could not be checked.</p><button type="button" onClick={userAuth.retry}>Try again</button></main>}
    {route.type === 'profile' && userAuth.status === 'loading' && <main className="profile-page"><p role="status">Checking your account…</p></main>}
    {route.type === 'profile' && userAuth.status === 'ready' && userAuth.user && <AccountProfilePage auth={userAuth} />}
    {(route.type === 'login' || route.type === 'register') && <UserAuthPage mode={route.type} />}
    {route.type === 'myCollection' && <MyCollectionPage auth={userAuth} />}
    {(route.type === 'adminLogin' || route.type === 'adminDashboard') && <AdminPage mode={route.type === 'adminLogin' ? 'login' : 'dashboard'} auth={adminAuth} />}
    {route.type === 'home' && <Home {...countriesState} />}
    {route.type === 'notFound' && <main className="record-detail-page"><div className="detail-feedback" role="status"><h1>Page not found</h1><p>This address could not be opened.</p><a className="detail-back-link" href="/countries">Browse countries</a></div></main>}
    <Footer />
  </div>
}
