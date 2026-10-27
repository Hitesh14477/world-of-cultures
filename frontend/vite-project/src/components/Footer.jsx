import { buildAuthPath } from '../services/authNavigation.js'

export default function Footer({ auth }) {
  const isSignedIn = Boolean(auth?.user)
  const protectedDestination = (destination) => isSignedIn
    ? destination
    : buildAuthPath('login', destination)

  return (
    <footer className="site-footer" aria-label="Site footer">
      <div className="site-footer-main">
        <section className="site-footer-brand" aria-labelledby="footer-brand-title">
          <a className="brand" href="/#home" id="footer-brand-title" aria-label="World of Cultures home">
            World <span>of</span> Cultures
          </a>
          <p>Discover the traditions, stories, and heritage that make every culture unique.</p>
          <span className="site-footer-tagline">Explore the world&apos;s cultural heritage.</span>
        </section>

        <nav className="site-footer-links" aria-label="Explore">
          <h2>Explore</h2>
          <a href="/#home">Home</a>
          <a href="/countries">Explore Countries</a>
          <a href="/#home-continents-title">Explore by Continent</a>
          <a href="/search">Search</a>
          <a href="/community">Community</a>
          <a href={protectedDestination('/my-collection')}>My Collection</a>
        </nav>

        <nav className="site-footer-links" aria-label="Participate">
          <h2>Participate</h2>
          <a href={protectedDestination('/contribute')}>Contribute Cultural Knowledge</a>
          <a href={protectedDestination('/community?compose=1')}>Share a Community Post</a>
        </nav>
      </div>

      <div className="site-footer-bottom">
        <span className="copyright">© 2026 World of Cultures</span>
        <span className="site-footer-message">Made to celebrate cultural diversity.</span>
        <a className="site-footer-top" href="/#home">Back to top <span aria-hidden="true">↑</span></a>
      </div>
    </footer>
  )
}
