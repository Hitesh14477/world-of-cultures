import { lazy, Suspense, useEffect, useState } from 'react'
import Navbar from './components/Navbar.jsx'
import Footer from './components/Footer.jsx'
const Home = lazy(() => import('./pages/Home.jsx'))
const ExploreCountries = lazy(() => import('./pages/ExploreCountries.jsx'))
const CountryDetail = lazy(() => import('./pages/CountryDetail.jsx'))
const CulturalEntryDetail = lazy(() => import('./pages/CulturalEntryDetail.jsx'))
const PlaceDetail = lazy(() => import('./pages/PlaceDetail.jsx'))
const ContributionPage = lazy(() => import('./pages/ContributionPage.jsx'))
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'))
const SearchPage = lazy(() => import('./pages/SearchPage.jsx'))
import { adminLogout, fetchAdminSession, fetchCountries, fetchUserSession, logoutUser } from './services/api.js'
import { resolveAppRoute } from './services/route.js'
const UserAuthPage = lazy(() => import('./pages/UserAuthPage.jsx'))
const MyCollectionPage = lazy(() => import('./pages/MyCollectionPage.jsx'))
const CommunityPage = lazy(() => import('./pages/CommunityPage.jsx'))
const CommunityPostDetailPage = lazy(() => import('./pages/CommunityPage.jsx').then((module) => ({ default: module.CommunityPostDetailPage })))
const MemberProfilePage = lazy(() => import('./pages/CommunityPage.jsx').then((module) => ({ default: module.MemberProfilePage })))
const AccountProfilePage = lazy(() => import('./pages/AccountProfilePage.jsx'))
import { buildAuthPath } from './services/authNavigation.js'
import { buildAdminLoginPath } from './services/adminNavigation.js'
const AdminProfilePage = lazy(() => import('./pages/AdminProfilePage.jsx'))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage.jsx'))
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
      setAuth((current) => ({ ...current, error: 'Could not log out. Please try again.' }))
    } finally {
      setLogoutBusy(false)
    }
  }

  function retry() {
    setAuth((current) => ({ ...current, status: 'loading', error: '', retry: current.retry + 1 }))
  }

  function updateUser(updated) {
    setAuth((current) => ({ ...current, user: { ...current.user, username: updated.username, displayName: updated.displayName, avatarUrl: typeof updated.avatarUrl === 'string' ? updated.avatarUrl : current.user?.avatarUrl || '' } }))
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
      setAuth((current) => ({ ...current, error: 'Could not log out of the administrator account. Please try again.' }))
    } finally {
      setLogoutBusy(false)
    }
  }

  function retry() {
    setAuth((current) => ({ ...current, status: 'loading', error: '', retry: current.retry + 1 }))
  }

  function updateMember(updated) {
    setAuth((current) => current.session?.member ? ({
      ...current,
      session: {
        ...current.session,
        member: {
          ...current.session.member,
          username: updated.username || current.session.member.username,
          displayName: updated.displayName ?? current.session.member.displayName,
          avatarUrl: typeof updated.avatarUrl === 'string' ? updated.avatarUrl : current.session.member.avatarUrl || '',
        },
      },
    }) : current)
  }

  return { ...auth, logoutBusy, logout, retry, updateMember }
}

export default function App() {
  const route = resolveAppRoute(window.location.pathname)
  const userAuth = useUserAuth()
  const countriesState = useCountries(route.type === 'home' || route.type === 'directory' || route.type === 'contribute' || route.type === 'community')
  const adminAuth = useAdminAuth()
  const userIsSignedIn = userAuth.status === 'ready' && Boolean(userAuth.user)
  const adminMember = adminAuth.status === 'ready' ? adminAuth.session?.member : null
  const memberAuth = userIsSignedIn
    ? userAuth
    : adminMember
      ? {
        ...userAuth,
        status: 'ready',
        user: adminMember,
        csrfToken: adminAuth.session.csrfToken,
        error: '',
        retry: () => { userAuth.retry(); adminAuth.retry() },
        updateUser: adminAuth.updateMember,
        logout: adminAuth.logout,
        logoutBusy: adminAuth.logoutBusy,
      }
      : (userAuth.status === 'loading' || adminAuth.status === 'loading')
        ? { ...userAuth, status: 'loading', user: null }
        : (userAuth.status === 'error' || adminAuth.status === 'error')
          ? { ...userAuth, status: 'error', user: null, error: userAuth.error || adminAuth.error, retry: () => { userAuth.retry(); adminAuth.retry() } }
          : userAuth

  useEffect(() => {
    const communityParams = new URLSearchParams(window.location.search)
    if (route.type === 'community'
      && (communityParams.get('compose') === '1' || communityParams.has('edit'))
      && memberAuth.status === 'ready'
      && !memberAuth.user) {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(buildAuthPath('login', destination))
    }
  }, [route.type, memberAuth.status, memberAuth.user])

  useEffect(() => {
    if (route.type === 'notifications' && memberAuth.status === 'ready' && !memberAuth.user) {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(buildAuthPath('login', destination))
    }
  }, [route.type, memberAuth.status, memberAuth.user])

  useEffect(() => {
    if ((route.type === 'adminDashboard' || route.type === 'adminProfile') && adminAuth.status === 'ready' && !adminAuth.session) {
      const destination = `${window.location.pathname}${window.location.search}${window.location.hash}`
      window.location.replace(buildAdminLoginPath(destination))
    }
  }, [route.type, adminAuth.status, adminAuth.session])

  useEffect(() => {
    if (route.type === 'profile' && memberAuth.status === 'ready' && !memberAuth.user) {
      window.location.replace(buildAuthPath('login', '/profile'))
    }
  }, [route.type, memberAuth.status, memberAuth.user])

  return <div className={`site-shell${route.type === 'community' ? ' community-shell' : ''}`} id="home">
    <Navbar userAuth={userAuth} adminAuth={adminAuth} />
    <Suspense fallback={<main className="record-detail-page"><p role="status">Loading page…</p></main>}>
    {route.type === 'country' && <CountryDetail slug={route.slug} auth={memberAuth} />}
    {route.type === 'culturalEntry' && <CulturalEntryDetail slug={route.slug} entryId={route.entryId} auth={memberAuth} />}
    {route.type === 'place' && <PlaceDetail slug={route.slug} placeId={route.placeId} auth={memberAuth} />}
    {route.type === 'directory' && <ExploreCountries {...countriesState} />}
    {route.type === 'contribute' && <ContributionPage {...countriesState} auth={memberAuth} />}
    {route.type === 'search' && <SearchPage />}
    {route.type === 'community' && <CommunityPage auth={memberAuth} adminAuth={adminAuth} {...countriesState} />}
    {route.type === 'communityPost' && <CommunityPostDetailPage postId={route.postId} auth={memberAuth} adminAuth={adminAuth} />}
    {route.type === 'memberProfile' && <MemberProfilePage username={route.username} auth={memberAuth} adminAuth={adminAuth} />}
    {route.type === 'profile' && memberAuth.status === 'error' && <main className="profile-page"><p role="alert">Your account session could not be checked.</p><button type="button" onClick={memberAuth.retry}>Try again</button></main>}
    {route.type === 'profile' && memberAuth.status === 'loading' && <main className="profile-page"><p role="status">Checking your account…</p></main>}
    {route.type === 'profile' && memberAuth.status === 'ready' && memberAuth.user && <AccountProfilePage auth={memberAuth} />}
    {route.type === 'notifications' && memberAuth.status === 'error' && <main className="notifications-page"><p role="alert">Your account session could not be checked.</p><button type="button" onClick={memberAuth.retry}>Try again</button></main>}
    {route.type === 'notifications' && memberAuth.status === 'loading' && <main className="notifications-page"><p role="status">Checking your account…</p></main>}
    {route.type === 'notifications' && memberAuth.status === 'ready' && memberAuth.user && <NotificationsPage auth={memberAuth} />}
    {(route.type === 'login' || route.type === 'register') && <UserAuthPage mode={route.type} />}
    {route.type === 'myCollection' && <MyCollectionPage auth={memberAuth} />}
    {(route.type === 'adminLogin' || route.type === 'adminDashboard') && <AdminPage mode={route.type === 'adminLogin' ? 'login' : 'dashboard'} auth={adminAuth} />}
    {route.type === 'adminProfile' && <AdminProfilePage auth={adminAuth} />}
    {route.type === 'home' && <Home {...countriesState} />}
    {route.type === 'notFound' && <main className="record-detail-page"><div className="detail-feedback" role="status"><h1>Page not found</h1><p>This address could not be opened.</p><a className="detail-back-link" href="/countries">Browse countries</a></div></main>}
    </Suspense>
    <Footer auth={memberAuth} />
  </div>
}
