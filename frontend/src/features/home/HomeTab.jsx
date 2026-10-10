import { useNav } from '../../lib/nav'

export default function HomeTab() {
  const { go } = useNav()
  return (
    <>
      <section className="network-hero" id="home">
        <div className="network-kicker">PEOPLE <i>/</i> SKILLS <i>/</i> FOOD <i>/</i> OPPORTUNITIES</div>
        <h1>The campus<br />network for<br /><em>ideas and people.</em></h1>
        <p className="network-intro">Hire student freelancers, find collaborators, and pre-order from the canteen without the queue.</p>
        <div className="hero-bubbles" aria-label="Campus destinations">
          <button type="button" onClick={() => go('explore')}>Explore</button>
          <button type="button" onClick={() => go('eat', { name: 'list' })}>Canteen</button>
          <button type="button" onClick={() => go('connect', { name: 'home' })}>Connect</button>
        </div>
      </section>
      <section className="campus-photo" id="campus" aria-label="Amrita Coimbatore campus"><img src="/campus-hero.jpg.jpeg" alt="Amrita Vishwa Vidyapeetham campus in Coimbatore" /></section>
    </>
  )
}
