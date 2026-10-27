import { getNavigationAuthView } from '../services/navigationAuth.js'
import { buildAuthPath } from '../services/authNavigation.js'
import NotificationBell from './NotificationBell.jsx'
import AdminReviewBell from './AdminReviewBell.jsx'

export default function Navbar({ userAuth, adminAuth }) {
  const accountView = getNavigationAuthView(userAuth, adminAuth)
  return (
    <header className="site-header">
      <a className="brand" href="/#home" aria-label="World of Cultures home">World <span>of</span> Cultures</a>
      <nav className="site-nav-links" aria-label="Main navigation">
        <a href="/#home">Home</a>
        <a href="/countries">Explore Countries</a>
        <a href="/search">Search</a>
        <a href="/contribute">Contribute</a>
        <a href="/community">Community</a>
        <a href={accountView.user || accountView.admin || userAuth?.status === 'loading' || userAuth?.status === 'error' ? '/my-collection' : buildAuthPath('login', '/my-collection')}>My Collection</a>
        {accountView.admin && <a href="/admin">Admin Dashboard</a>}
      </nav>
      <div className="site-account-actions" aria-label="Account actions">
        {accountView.loading && <span className="nav-auth-loading" role="status">Checking account…</span>}
        {!accountView.loading && <>
          {accountView.user && !accountView.admin && <div className="site-account-group" aria-label="Regular user account">
            <NotificationBell key={accountView.user.id} user={accountView.user} csrfToken={userAuth.csrfToken} />
            <a className="site-account-profile" href="/profile" aria-label={`Open ${accountView.user.username || 'your'} profile`}>
              {accountView.user.avatarUrl
                ? <img className="site-account-avatar" src={accountView.user.avatarUrl} alt="" />
                : <span className="site-account-avatar site-account-avatar-fallback" aria-hidden="true">{(accountView.user.username || accountView.user.email || 'W').slice(0, 1).toUpperCase()}</span>}
              <span className="site-account-identity">{accountView.user.username || 'Account'}</span>
            </a>
            <button className="nav-account-button logout-control" type="button" onClick={userAuth.logout} disabled={userAuth.logoutBusy} aria-label="Log out of your regular account">{userAuth.logoutBusy ? 'Logging out…' : 'Log out'}</button>
          </div>}
          {accountView.showRegularSignIn && !accountView.admin && <div className="site-account-group">
            <NotificationBell key="signed-out" user={null} csrfToken="" />
            <a href="/login">Sign in</a><a href="/register">Create account</a>
          </div>}
          {accountView.admin && <div className="site-account-group" aria-label="Administrator account">
            <AdminReviewBell session={adminAuth.session} />
            <a className="site-account-profile" href="/admin/profile" aria-label={`Open administrator profile for ${accountView.admin.username}`}>
              {adminAuth.session?.member?.avatarUrl
                ? <img className="site-account-avatar" src={adminAuth.session.member.avatarUrl} alt="" />
                : <span className="site-account-avatar site-account-avatar-fallback" aria-hidden="true">{(accountView.admin.username || 'A').slice(0, 1).toUpperCase()}</span>}
              <span className="site-account-identity">{accountView.admin.username}</span>
            </a>
            <button className="nav-account-button logout-control" type="button" onClick={adminAuth.logout} disabled={adminAuth.logoutBusy} aria-label="Log out of the administrator account">{adminAuth.logoutBusy ? 'Logging out…' : 'Log out'}</button>
          </div>}
          {accountView.userError && <p className="nav-account-message" role="alert">
            {accountView.userError}
            {accountView.retryUserSession && <button className="nav-account-retry" type="button" onClick={accountView.retryUserSession}>Retry</button>}
          </p>}
          {accountView.adminError && <p className="nav-account-message" role="alert">
            {accountView.adminError}
            {accountView.retryAdminSession && <button className="nav-account-retry" type="button" onClick={accountView.retryAdminSession}>Retry</button>}
          </p>}
        </>}
      </div>
    </header>
  )
}
