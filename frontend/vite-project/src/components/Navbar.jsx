import { useState, useEffect, useRef } from 'react'
import { Bell, Bookmark, CirclePlus, Globe2, House, LogIn, LogOut, Menu, Search, ShieldCheck, UserPlus, UserRound, UsersRound, X } from 'lucide-react'
import { getNavigationAuthView } from '../services/navigationAuth.js'
import { buildAuthPath } from '../services/authNavigation.js'
import NotificationBell from './NotificationBell.jsx'
import AdminReviewBell from './AdminReviewBell.jsx'

function NavLink({ href, icon: Icon, children }) {
  return (
    <a className="nav-icon-link" href={href}>
      <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
      <span>{children}</span>
    </a>
  )
}

export default function Navbar({ userAuth, adminAuth }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navRootRef = useRef(null)
  const accountView = getNavigationAuthView(userAuth, adminAuth)

  useEffect(() => {
    if (!mobileMenuOpen) return undefined

    const handlePointerDown = (event) => {
      if (!navRootRef.current?.contains(event.target) || event.target.closest?.('.notification-bell, .notification-dropdown')) {
        setMobileMenuOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false)
      }
    }

    const handleResize = () => {
      if (window.innerWidth > 900) {
        setMobileMenuOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
    }
  }, [mobileMenuOpen])

  const closeMenu = () => setMobileMenuOpen(false)

  const myCollectionHref = accountView.user || accountView.admin || userAuth?.status === 'loading' || userAuth?.status === 'error'
    ? '/my-collection'
    : buildAuthPath('login', '/my-collection')

  return (
    <header className="site-header" ref={navRootRef}>
      <a className="brand" href="/#home" aria-label="World of Cultures home" onClick={closeMenu}>
        World <span>of</span> Cultures
      </a>

      {/* Desktop navigation links */}
      <nav className="site-nav-links" aria-label="Main navigation">
        <NavLink href="/#home" icon={House}>Home</NavLink>
        <NavLink href="/countries" icon={Globe2}>Explore Countries</NavLink>
        <NavLink href="/search" icon={Search}>Search</NavLink>
        <NavLink href="/community" icon={UsersRound}>Community</NavLink>
        <NavLink href="/contribute" icon={CirclePlus}>Contribute</NavLink>
        <NavLink href={myCollectionHref} icon={Bookmark}>My Collection</NavLink>
        {accountView.admin && <NavLink href="/admin" icon={ShieldCheck}>Admin Dashboard</NavLink>}
      </nav>

      {/* Action area: Notifications, Desktop Account & Mobile Menu Toggle */}
      <div className="site-account-actions" aria-label="Account actions">
        {accountView.loading && <span className="nav-auth-loading" role="status">Checking account…</span>}

        {!accountView.loading && (
          <>
            {/* Bell is mounted here on the header bar for both desktop and mobile */}
            {accountView.user && !accountView.admin && (
              <NotificationBell key={accountView.user.id} user={accountView.user} csrfToken={userAuth.csrfToken} />
            )}
            {accountView.admin && (
              <AdminReviewBell session={adminAuth.session} />
            )}
            {accountView.showRegularSignIn && !accountView.admin && (
              <NotificationBell key="signed-out" user={null} csrfToken="" />
            )}

            {/* Desktop account info and actions */}
            <div className="site-account-desktop">
              {accountView.user && !accountView.admin && (
                <div className="site-account-group" aria-label="Regular user account">
                  <a className="site-account-profile" href="/profile" aria-label={`Open ${accountView.user.username || 'your'} profile`}>
                    {accountView.user.avatarUrl
                      ? <img className="site-account-avatar" src={accountView.user.avatarUrl} alt="" />
                      : <span className="site-account-avatar site-account-avatar-fallback"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></span>}
                    <span className="site-account-identity">{accountView.user.username || 'Account'}</span>
                  </a>
                  <button className="nav-account-button logout-control" type="button" onClick={userAuth.logout} disabled={userAuth.logoutBusy} aria-label="Log out of your regular account">
                    <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
                    {userAuth.logoutBusy ? 'Logging out…' : 'Log out'}
                  </button>
                </div>
              )}

              {accountView.showRegularSignIn && !accountView.admin && (
                <div className="site-account-group">
                  <NavLink href="/login" icon={LogIn}>Sign in</NavLink>
                  <NavLink href="/register" icon={UserPlus}>Create account</NavLink>
                </div>
              )}

              {accountView.admin && (
                <div className="site-account-group" aria-label="Administrator account">
                  <a className="site-account-profile" href="/admin/profile" aria-label={`Open administrator profile for ${accountView.admin.username}`}>
                    {adminAuth.session?.member?.avatarUrl
                      ? <img className="site-account-avatar" src={adminAuth.session.member.avatarUrl} alt="" />
                      : <span className="site-account-avatar site-account-avatar-fallback"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></span>}
                    <span className="site-account-identity">{accountView.admin.username}</span>
                  </a>
                  <button className="nav-account-button logout-control" type="button" onClick={adminAuth.logout} disabled={adminAuth.logoutBusy} aria-label="Log out of the administrator account">
                    <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
                    {adminAuth.logoutBusy ? 'Logging out…' : 'Log out'}
                  </button>
                </div>
              )}

              {accountView.userError && (
                <p className="nav-account-message" role="alert">
                  {accountView.userError}
                  {accountView.retryUserSession && <button className="nav-account-retry" type="button" onClick={accountView.retryUserSession}>Retry</button>}
                </p>
              )}
              {accountView.adminError && (
                <p className="nav-account-message" role="alert">
                  {accountView.adminError}
                  {accountView.retryAdminSession && <button className="nav-account-retry" type="button" onClick={accountView.retryAdminSession}>Retry</button>}
                </p>
              )}
            </div>
          </>
        )}

        {/* Mobile menu toggle button */}
        <button
          type="button"
          className="nav-menu-toggle"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav-panel"
          onClick={() => setMobileMenuOpen((open) => !open)}
        >
          {mobileMenuOpen
            ? <X size={20} strokeWidth={2} aria-hidden="true" />
            : <Menu size={20} strokeWidth={2} aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile dropdown navigation menu */}
      {mobileMenuOpen && (
        <div id="mobile-nav-panel" className="site-mobile-menu" aria-label="Mobile navigation panel">
          <nav className="mobile-nav-links" aria-label="Mobile navigation links">
            <a className="mobile-nav-item" href="/#home" onClick={closeMenu}>
              <House size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Home</span>
            </a>
            <a className="mobile-nav-item" href="/countries" onClick={closeMenu}>
              <Globe2 size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Explore Countries</span>
            </a>
            <a className="mobile-nav-item" href="/search" onClick={closeMenu}>
              <Search size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Search</span>
            </a>
            <a className="mobile-nav-item" href="/community" onClick={closeMenu}>
              <UsersRound size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Community</span>
            </a>
            <a className="mobile-nav-item" href="/contribute" onClick={closeMenu}>
              <CirclePlus size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>Contribute</span>
            </a>
            <a className="mobile-nav-item" href={myCollectionHref} onClick={closeMenu}>
              <Bookmark size={18} strokeWidth={1.8} aria-hidden="true" />
              <span>My Collection</span>
            </a>
            {accountView.admin && (
              <a className="mobile-nav-item" href="/admin" onClick={closeMenu}>
                <ShieldCheck size={18} strokeWidth={1.8} aria-hidden="true" />
                <span>Admin Dashboard</span>
              </a>
            )}
          </nav>

          <div className="mobile-menu-divider" />

          <div className="mobile-account-actions">
            {accountView.loading && <span className="nav-auth-loading" role="status">Checking account…</span>}

            {!accountView.loading && (
              <>
                {accountView.user && !accountView.admin && (
                  <div className="mobile-user-card">
                    <a className="mobile-profile-info" href="/profile" onClick={closeMenu} aria-label={`Open ${accountView.user.username || 'your'} profile`}>
                      {accountView.user.avatarUrl
                        ? <img className="site-account-avatar" src={accountView.user.avatarUrl} alt="" />
                        : <span className="site-account-avatar site-account-avatar-fallback"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></span>}
                      <div className="mobile-profile-text">
                        <span className="mobile-profile-username">{accountView.user.username || 'Account'}</span>
                        <span className="mobile-profile-link-text">View Profile →</span>
                      </div>
                    </a>
                    <a className="mobile-nav-item mobile-sub-item" href="/notifications" onClick={closeMenu}>
                      <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
                      <span>Notifications</span>
                    </a>
                    <button
                      className="mobile-account-button mobile-logout-button"
                      type="button"
                      onClick={() => { closeMenu(); userAuth.logout(); }}
                      disabled={userAuth.logoutBusy}
                    >
                      <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>{userAuth.logoutBusy ? 'Logging out…' : 'Log out'}</span>
                    </button>
                  </div>
                )}

                {accountView.admin && (
                  <div className="mobile-user-card">
                    <a className="mobile-profile-info" href="/admin/profile" onClick={closeMenu} aria-label={`Open administrator profile for ${accountView.admin.username}`}>
                      {adminAuth.session?.member?.avatarUrl
                        ? <img className="site-account-avatar" src={adminAuth.session.member.avatarUrl} alt="" />
                        : <span className="site-account-avatar site-account-avatar-fallback"><UserRound size={17} strokeWidth={1.8} aria-hidden="true" /></span>}
                      <div className="mobile-profile-text">
                        <span className="mobile-profile-username">{accountView.admin.username}</span>
                        <span className="mobile-profile-badge">Administrator</span>
                      </div>
                    </a>
                    <button
                      className="mobile-account-button mobile-logout-button"
                      type="button"
                      onClick={() => { closeMenu(); adminAuth.logout(); }}
                      disabled={adminAuth.logoutBusy}
                    >
                      <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>{adminAuth.logoutBusy ? 'Logging out…' : 'Log out'}</span>
                    </button>
                  </div>
                )}

                {accountView.showRegularSignIn && !accountView.admin && (
                  <div className="mobile-auth-buttons">
                    <a className="mobile-auth-btn mobile-signin-btn" href="/login" onClick={closeMenu}>
                      <LogIn size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>Sign in</span>
                    </a>
                    <a className="mobile-auth-btn mobile-register-btn" href="/register" onClick={closeMenu}>
                      <UserPlus size={17} strokeWidth={1.8} aria-hidden="true" />
                      <span>Create account</span>
                    </a>
                  </div>
                )}

                {accountView.userError && (
                  <p className="nav-account-message" role="alert">
                    {accountView.userError}
                    {accountView.retryUserSession && <button className="nav-account-retry" type="button" onClick={accountView.retryUserSession}>Retry</button>}
                  </p>
                )}
                {accountView.adminError && (
                  <p className="nav-account-message" role="alert">
                    {accountView.adminError}
                    {accountView.retryAdminSession && <button className="nav-account-retry" type="button" onClick={accountView.retryAdminSession}>Retry</button>}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
