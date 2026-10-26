export default function Footer() {
  return (
    <footer className="site-footer">
      <a className="brand" href="/#home" aria-label="World of Cultures home">World <span>of</span> Cultures</a>
      <nav aria-label="Footer navigation">
        <a href="/#home">Home</a><a href="/countries">Explore Countries</a><a href="/#topics">Cultural Stories</a>
      </nav>
      <span className="copyright">© {new Date().getFullYear()} World of Cultures</span>
    </footer>
  )
}
