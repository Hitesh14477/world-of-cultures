export function getNavigationAuthView(userAuth, adminAuth) {
  const loading = userAuth?.status === 'loading' || adminAuth?.status === 'loading'
  const user = userAuth?.user || null
  const admin = adminAuth?.session || null

  return {
    loading,
    user,
    admin,
    showRegularSignIn: !loading && userAuth?.status === 'ready' && !user && !admin,
    userError: userAuth?.error || '',
    adminError: adminAuth?.error || '',
    retryUserSession: userAuth?.status === 'error' ? userAuth.retry : null,
    retryAdminSession: adminAuth?.status === 'error' ? adminAuth.retry : null,
  }
}
