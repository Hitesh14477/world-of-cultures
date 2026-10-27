import { Bookmark, CirclePlus, Globe2, House, LogIn, LogOut, Search, ShieldCheck, UserPlus, UserRound, UsersRound } from 'lucide-react'
import { getNavigationAuthView } from '../services/navigationAuth.js'
import { buildAuthPath } from '../services/authNavigation.js'
import NotificationBell from './NotificationBell.jsx'
import AdminReviewBell from './AdminReviewBell.jsx'

function NavLink({ href, icon: Icon, children }) {
  return <a className="nav-icon-link" href={href}><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{children}</span></a>
}

export default function Navbar({ userAuth, adminAuth }) {
  const accountView = getNavigationAuthView(userAuth, adminAuth)
  return (
    <header className="site-header">
      <a className="brand" href="/#home" aria-label="World of Cultures home">World <span>of</span> Cultures</a>
      <nav className="site-nav-links" aria-label="Main navigation">
        <NavLink href="/#home" icon={House}>Home</NavLink>
        <NavLink href="/countries" icon={Globe2}>Explore Countries</NavLink>
        <NavLink href="/search" icon={Search}>Search</NavLink>
        <NavLink href="/community" icon={UsersRound}>Community</NavLink>
        <NavLink href="/contribute" icon={CirclePlus}>Contribute</NavLink>
        <NavLink href={accountView.user || accountView.admin || userAuth?.status === 'loading' || userAuth?.status === 'error' ? '/my-collection' : buildAuthPath('login', '/my-collection')} icon={Bookmark}>My Collection</NavLink>
        {accountView.admin && <NavLink href="/admin" icon={ShieldCheck}>Admin Dashboard</NavLink>}
      </nav>
      <div className="site-account-actions" aria-label="Account actions">
        {accountView.loading && <span className="nav-auth-loading" role="status">Checking account…</span>}
        {!accountView.loading && <>
          {accountView.user && !accountView.admin && <div className="site-account-group" aria-label="Regular user account">
            <NotificationBell key={accountView.user.id} user={accountView.user} csrfToken={userAuth.csrfToken} />
            <a className="site-account-profile" href="/profile" aria-label={`Open ${accountView.user.username || 'your'} profile`}>
              {accountView.user.avatarUrl
                ? <img className="site-account-avatar" src={accountView.user.avatarUrl} alt="" />
                : <span className="site-account-avatar site-account-avatar-fallback"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></span>}
              <span className="site-account-identity">{accountView.user.username || 'Account'}</span>
            </a>
            <button className="nav-account-button logout-control" type="button" onClick={userAuth.logout} disabled={userAuth.logoutBusy} aria-label="Log out of your regular account"><LogOut size={17} strokeWidth={1.8} aria-hidden="true" />{userAuth.logoutBusy ? 'Logging out…' : 'Log out'}</button>
          </div>}
          {accountView.showRegularSignIn && !accountView.admin && <div className="site-account-group">
            <NotificationBell key="signed-out" user={null} csrfToken="" />
            <NavLink href="/login" icon={LogIn}>Sign in</NavLink><NavLink href="/register" icon={UserPlus}>Create account</NavLink>
          </div>}
          {accountView.admin && <div className="site-account-group" aria-label="Administrator account">
            <AdminReviewBell session={adminAuth.session} />
            <a className="site-account-profile" href="/admin/profile" aria-label={`Open administrator profile for ${accountView.admin.username}`}>
              {adminAuth.session?.member?.avatarUrl
                ? <img className="site-account-avatar" src={adminAuth.session.member.avatarUrl} alt="" />
                : <span className="site-account-avatar site-account-avatar-fallback"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></span>}
              <span className="site-account-identity">{accountView.admin.username}</span>
            </a>
            <button className="nav-account-button logout-control" type="button" onClick={adminAuth.logout} disabled={adminAuth.logoutBusy} aria-label="Log out of the administrator account"><LogOut size={17} strokeWidth={1.8} aria-hidden="true" />{adminAuth.logoutBusy ? 'Logging out…' : 'Log out'}</button>
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
