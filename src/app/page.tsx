import Link from "next/link";
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, HeartHandshake, KeyRound, LockKeyhole, MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { HeroSearch } from "@/components/search-controls";
import { FeaturedListings, RecentlyViewed } from "@/components/home-sections";
import { ScrollReveal } from "@/components/scroll-reveal";
import { ValuePropositions } from "@/components/value-propositions";
import { findProperties, getTopNeighborhoods } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [result, neighborhoods] = await Promise.all([
    findProperties({ limit: 30 }),
    getTopNeighborhoods(),
  ]);
  return <main>
    <section className="hero-section">
      <div className="container hero-layout">
        <div className="hero-copy">
          <span className="hero-eyebrow hero-reveal">
            <span className="hero-eyebrow-star"><Sparkles size={14} fill="currentColor"/></span> A MORE THOUGHTFUL WAY HOME
          </span>
          <h1 className="hero-reveal hero-delay-1">Find a place<br/>that feels <em>like yours.</em></h1>
          <p className="hero-subtitle hero-reveal hero-delay-2">The best moves start with feeling at home. Explore verified rental homes, discover your next chapter, and leave the spam calls behind.</p>
          <div className="hero-reveal hero-delay-3">
            <HeroSearch/>
          </div>
          <div className="hero-below hero-reveal hero-delay-4">
            <div className="hero-below-icon"><ShieldCheck size={20}/></div>
            <span>Every listing reviewed. Your contact details kept private.</span>
            <Link href="/privacy">How we protect you <ArrowRight size={15}/></Link>
          </div>
        </div>
        <div className="hero-visual hero-reveal hero-delay-2">
          <div className="hero-photo-shape">
            <img src="https://images.pexels.com/photos/7031732/pexels-photo-7031732.jpeg?auto=compress&cs=tinysrgb&w=1500" alt="Sunlit modern living room with warm neutral interiors"/>
          </div>
          <div className="hero-photo-tag">
            <span className="tag-sparkle"><Sparkles size={17}/></span>
            <span>Beautiful homes.<br/><strong>Better beginnings.</strong></span>
          </div>
          <div className="hero-floating-card">
            <span className="floating-icon"><BadgeCheck size={23}/></span>
            <div><strong>Only good surprises</strong><span>Homes verified by our team</span></div>
            <span className="floating-check"><Check size={16}/></span>
          </div>
          <span className="hero-ring hero-ring-one"/><span className="hero-ring hero-ring-two"/>
        </div>
      </div>
    </section>

    <ScrollReveal>
      <section className="promise-strip">
        <div className="container promise-inner">
          <div className="promise-item">
            <span className="promise-icon"><BadgeCheck size={23} strokeWidth={1.7}/></span>
            <div><strong>Verified, not just listed</strong><span>Real details you can rely on</span></div>
          </div>
          <span className="promise-divider"/>
          <div className="promise-item">
            <span className="promise-icon"><LockKeyhole size={22} strokeWidth={1.7}/></span>
            <div><strong>Your privacy, protected</strong><span>No shared numbers. No spam.</span></div>
          </div>
          <span className="promise-divider"/>
          <div className="promise-item">
            <span className="promise-icon"><HeartHandshake size={23} strokeWidth={1.7}/></span>
            <div><strong>A human in the loop</strong><span>We make the introductions</span></div>
          </div>
        </div>
      </section>
    </ScrollReveal>

    <ScrollReveal>
      <ValuePropositions />
    </ScrollReveal>

    <ScrollReveal>
      <section className="category-section section-pad">
        <div className="container">
          <div className="section-heading-row">
            <div>
              <span className="eyebrow"><span className="eyebrow-line"/> YOUR SPACE, YOUR STORY</span>
              <h2>Where would you like to <em>begin?</em></h2>
              <p>Whatever home means to you, there’s a place for it here.</p>
            </div>
            <Link href="/search" className="text-link desktop-only">Browse all rentals <ArrowUpRight size={17}/></Link>
          </div>
          <div className="category-single-wrap">
            <Link href="/search" className="category-card category-card-hero" aria-label="Rent a home">
              <img
                src="https://images.pexels.com/photos/7214171/pexels-photo-7214171.jpeg?auto=compress&cs=tinysrgb&w=1400"
                alt="Rent a home"
                loading="lazy"
              />
              <span className="category-shade"/>
              <span className="category-top">
                <span className="category-number">01 / 01</span>
                <span className="category-arrow"><ArrowUpRight size={22}/></span>
              </span>
              <span className="category-bottom">
                <span className="category-icon"><KeyRound size={22} strokeWidth={1.8}/></span>
                <span className="category-title">Rent a home</span>
                <span className="category-descriptor">Make room for what’s next · Explore verified rental homes</span>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </ScrollReveal>

    <ScrollReveal>
      <FeaturedListings properties={result.items}/>
    </ScrollReveal>

    <ScrollReveal>
      <section className="privacy-story">
        <div className="container privacy-story-inner">
          <div className="privacy-story-copy">
            <span className="eyebrow light"><span className="eyebrow-line"/> A BETTER KIND OF CONNECTION</span>
            <h2>Find your place.<br/><em>Keep your peace.</em></h2>
            <p>Finding a home shouldn’t mean giving your number to everyone. When you’re interested, our team brings the right people together — without ever sharing your contact details with the other side.</p>
            <div className="privacy-points">
              <span><Check size={16}/> No direct contact exchange</span>
              <span><Check size={16}/> One dedicated team, no lead reselling</span>
            </div>
            <Link href="/privacy" className="btn btn-sand">See how it works <ArrowUpRight size={18}/></Link>
          </div>
          <div className="privacy-story-visual">
            <div className="privacy-photo">
              <img src="https://images.pexels.com/photos/7018401/pexels-photo-7018401.jpeg?auto=compress&cs=tinysrgb&w=1000" alt="Bright welcoming apartment interior" loading="lazy"/>
            </div>
            <div className="privacy-visual-stamp">
              <LockKeyhole size={25}/>
              <span>Your details<br/>stay yours.</span>
            </div>
            <span className="privacy-orbit"/>
          </div>
        </div>
      </section>
    </ScrollReveal>

    {neighborhoods.length > 0 && (
      <ScrollReveal>
        <section className="neighborhood-section section-pad">
          <div className="container">
            <div className="section-heading-row">
              <div>
                <span className="eyebrow"><MapPin size={15}/> CLOSE TO WHAT MATTERS</span>
                <h2>Explore the neighbourhood.</h2>
                <p>Good homes are even better in places you love.</p>
              </div>
            </div>
            <div className="neighborhood-grid">
              {neighborhoods.map((area) => (
                <Link href={`/search?q=${encodeURIComponent(area.name)}`} className="neighborhood-card" key={area.name}>
                  <img src={area.image} alt="" loading="lazy"/>
                  <div>
                    <span>EXPLORE AREA</span>
                    <strong>{area.name}</strong>
                    <small><MapPin size={13}/> {area.city}</small>
                  </div>
                  <span className="neighborhood-arrow"><ArrowUpRight size={20}/></span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>
    )}

    <RecentlyViewed properties={result.items}/>

    <ScrollReveal>
      <section className="final-cta">
        <div className="container final-cta-inner">
          <div>
            <span className="eyebrow light">READY WHEN YOU ARE</span>
            <h2>Your next chapter<br/>starts with a place.</h2>
            <p>Discover somewhere you’ll love coming home to.</p>
          </div>
          <Link href="/search" className="btn btn-white">Explore homes <ArrowRight size={18}/></Link>
          <span className="cta-decoration">⌂</span>
        </div>
      </section>
    </ScrollReveal>
  </main>;
}
