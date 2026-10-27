import { getNavigationAuthView } from '../services/navigationAuth.js'
import { buildAuthPath } from '../services/authNavigation.js'

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
        {!accountView.user && <a href="/my-collection">Favourites</a>}
        <a href="/community">Community</a>
        <a href={accountView.user || userAuth?.status === 'loading' || userAuth?.status === 'error' ? '/profile' : buildAuthPath('login', '/profile')}>Profile</a>
      </nav>
      <div className="site-account-actions" aria-label="Account actions">
        {accountView.loading && <span className="nav-auth-loading" role="status">Checking account…</span>}
        {!accountView.loading && <>
          {accountView.user && <div className="site-account-group" aria-label="Regular user account">
            <span className="site-account-identity">{accountView.user.username || accountView.user.email}</span>
            <a href="/my-collection">My Collection</a>
            <button className="nav-account-button" type="button" onClick={userAuth.logout} disabled={userAuth.logoutBusy} aria-label="Sign out of your regular account">{userAuth.logoutBusy ? 'Signing out…' : 'Sign out'}</button>
          </div>}
          {accountView.showRegularSignIn && <div className="site-account-group">
            <a href="/login">Sign in</a><a href="/register">Create account</a>
          </div>}
          {accountView.admin && <div className="site-account-group" aria-label="Administrator account">
            <a href="/admin">Review submissions</a>
            <button className="nav-account-button" type="button" onClick={adminAuth.logout} disabled={adminAuth.logoutBusy} aria-label="Sign out of the administrator account">{adminAuth.logoutBusy ? 'Signing out…' : 'Sign out'}</button>
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
