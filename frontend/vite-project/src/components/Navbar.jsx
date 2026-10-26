export default function Navbar() {
  return (
    <header className="site-header">
      <a className="brand" href="/#home" aria-label="World of Cultures home">World <span>of</span> Cultures</a>
      <nav aria-label="Main navigation">
        <a href="/#home">Home</a>
        <a href="/countries">Explore Countries</a>
        <a href="/#topics">Cultural Stories</a>
      </nav>
    </header>
  )
}
