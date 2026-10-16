import { auth } from "@/lib/auth";
import { ROLE_HOME, isRole } from "@/lib/roles";
import { BrandMark } from "@/components/brand-mark";
import { Calculator } from "./calculator";
import { MobileNav } from "./mobile-nav";
import { ContactForm } from "./contact-form";
import styles from "./marketing.module.css";

export const dynamic = "force-dynamic";

// The public homepage (2026-10-16, user-supplied HTML — "keep the layout and
// design as it is"; wire the contact form and the login/dashboard button to
// the real backend). Content, copy, stats, disclaimers, images and the CSS
// are ported as given — only three things changed from the raw HTML:
//  - the text logo became the real dashboard app's own BrandMark asset
//    (user-asked, same day), in both the nav and the footer;
//  - the mailto: lead form now calls a real Server Action (./actions.ts,
//    ./contact-form.tsx) instead of opening the visitor's email client;
//  - every "Customer Login" link reads the session (auth(), the same
//    role→home map src/app/page.tsx already uses) and becomes "Dashboard",
//    pointed at /admin or /portal, when the visitor is already signed in.
//
// Reached at /marketing directly, and rewritten here from `/` on the public
// hosts by src/proxy.ts — nothing there redirects a signed-in session away
// from this page, so "already logged in" is a real, reachable state here,
// not a hypothetical one.
export default async function MarketingHomePage() {
  const session = await auth();
  const role = session?.user?.role;
  const loggedIn = !!session?.user && isRole(role);
  const dashboardHref = loggedIn ? ROLE_HOME[role!] : "/login";
  const loginLabel = loggedIn ? "Dashboard" : "Customer Login";

  return (
    <div className={styles.page}>
      <header className={styles.nav}>
        <div className={`${styles.container} ${styles.navInner}`}>
          <a className={styles.logo} href="#home" aria-label="FirsThing.earth">
            <BrandMark variant="light" className="h-7" />
          </a>
          <MobileNav loggedIn={loggedIn} dashboardHref={dashboardHref} />
        </div>
      </header>

      <main>
        <div id="home" className={styles.hero}>
          <div className={styles.container}>
            <p className={styles.eyebrow}>The future of smarter infrastructure</p>
            <h1>
              Smarter Buildings.
              <br />
              Lower Costs.
              <br />
              <span style={{ color: "var(--green)" }}>Greener Tomorrow.</span>
            </h1>
            <p className={styles.lead}>
              We help residential communities and commercial properties reduce energy waste, automate
              essential infrastructure and achieve measurable operational savings.
            </p>
            <div className={styles.buttons}>
              <a href="#contact" className={styles.btn}>
                Get a Free Energy Assessment ↗
              </a>
              <a href="#solutions" className={`${styles.btn} ${styles.secondary}`}>
                Explore Solutions
              </a>
            </div>
            <div className={styles.heroPhoto}>
              <div className={styles.photoCaption}>Energy efficiency • Water automation • Intelligence</div>
            </div>
            <div className={styles.stats}>
              <div className={styles.stat}>
                <strong>19+</strong>
                <small>Societies served*</small>
              </div>
              <div className={styles.stat}>
                <strong>30K+</strong>
                <small>Devices deployed*</small>
              </div>
              <div className={styles.stat}>
                <strong>Up to 70%</strong>
                <small>Potential lighting savings</small>
              </div>
            </div>
            <p className={styles.disclaimer}>*Previously reported business figures. Confirm current totals before publication.</p>
          </div>
        </div>

        <section className={styles.soft}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>The hidden cost of inefficiency</p>
              <h2>Your Building Is Spending More Than It Should.</h2>
              <p>
                Every day, properties lose money through inefficient lighting, manually operated pumps,
                water overflow and limited visibility into consumption. FirsThing identifies these
                inefficiencies and deploys measurable, automated solutions.
              </p>
            </div>
            <div className={`${styles.grid} ${styles.four}`}>
              <div className={styles.tile}>
                <span className={styles.symbol}>💡</span>Lighting waste
              </div>
              <div className={styles.tile}>
                <span className={styles.symbol}>💧</span>Water overflow
              </div>
              <div className={styles.tile}>
                <span className={styles.symbol}>⚙️</span>Manual operations
              </div>
              <div className={styles.tile}>
                <span className={styles.symbol}>📊</span>Untracked consumption
              </div>
            </div>
          </div>
        </section>

        <section id="solutions">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Our solutions</p>
              <h2>One Partner. Complete Infrastructure Efficiency.</h2>
              <p>Integrated solutions designed to reduce operating costs and simplify infrastructure management.</p>
            </div>
            <div className={styles.grid}>
              <article className={styles.solution}>
                {/* eslint-disable-next-line @next/next/no-img-element -- external, unoptimizable marketing stock photo, ported as given */}
                <img
                  src="https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1000&q=80"
                  alt="Modern building lighting"
                />
                <div className={styles.solutionBody}>
                  <h3>01. Smart Lighting</h3>
                  <p>Motion-based lighting automation for basements, staircases, lift lobbies and common areas.</p>
                  <small>Up to 70% potential lighting energy savings</small>
                </div>
              </article>
              <article className={styles.solution}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1000&q=80"
                  alt="Industrial automation equipment"
                />
                <div className={styles.solutionBody}>
                  <h3>02. Pump Automation</h3>
                  <p>Intelligent controls, scheduling, monitoring and optimization for building water pumps.</p>
                  <small>Lower energy use and manual intervention</small>
                </div>
              </article>
              <article className={styles.solution}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1437482078695-73f5ca6c96e2?auto=format&fit=crop&w=1000&q=80"
                  alt="Water infrastructure"
                />
                <div className={styles.solutionBody}>
                  <h3>03. Water Automation</h3>
                  <p>Live tank levels, automated filling, motorised valves, alerts and smarter water management.</p>
                  <small>Better visibility. Less avoidable overflow.</small>
                </div>
              </article>
              <article className={styles.solution}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=1000&q=80"
                  alt="Data analytics screen"
                />
                <div className={styles.solutionBody}>
                  <h3>04. Energy Intelligence</h3>
                  <p>Live metering, baseline comparison, savings verification and downloadable performance reports.</p>
                  <small>Measure what matters</small>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section id="process" className={styles.soft}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Our process</p>
              <h2>From Assessment to Continuous Savings.</h2>
            </div>
            <div className={styles.steps}>
              <div className={styles.step}>
                <div className={styles.number}>01</div>
                <h3>Assess</h3>
                <p>Inspect the property and identify improvement opportunities.</p>
              </div>
              <div className={styles.step}>
                <div className={styles.number}>02</div>
                <h3>Measure</h3>
                <p>Establish a baseline using metering and operating data.</p>
              </div>
              <div className={styles.step}>
                <div className={styles.number}>03</div>
                <h3>Deploy</h3>
                <p>Install the right efficiency and automation solutions.</p>
              </div>
              <div className={styles.step}>
                <div className={styles.number}>04</div>
                <h3>Verify</h3>
                <p>Compare performance against the baseline.</p>
              </div>
              <div className={styles.step}>
                <div className={styles.number}>05</div>
                <h3>Maintain</h3>
                <p>Continue monitoring, servicing and optimizing.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="impact">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Our impact</p>
              <h2>Real Buildings. Measurable Results.</h2>
              <p>
                Examples of previously reported lighting performance. Final reports and customer
                publication permissions should be confirmed.
              </p>
            </div>
            <div className={styles.grid}>
              <article className={styles.case}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1000&q=80"
                  alt="Illustrative residential buildings"
                />
                <div className={styles.caseBody}>
                  <h3>Princely Estate</h3>
                  <strong>61.52%</strong>
                  <p>Previously reported lighting energy savings</p>
                </div>
              </article>
              <article className={styles.case}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80"
                  alt="Illustrative apartment buildings"
                />
                <div className={styles.caseBody}>
                  <h3>French Apartment</h3>
                  <strong>62.19%</strong>
                  <p>Previously reported lighting energy savings</p>
                </div>
              </article>
            </div>
            <p className={styles.disclaimer} style={{ marginTop: 14 }}>
              Images are illustrative and do not depict the named societies.
            </p>
          </div>
        </section>

        <section className={styles.soft}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Flexible commercial models</p>
              <h2>Flexible Models. Measurable Value.</h2>
            </div>
            <div className={styles.grid}>
              <div className={styles.model}>
                <div className={styles.symbol}>🔁</div>
                <h3>Savings-Sharing Model</h3>
                <p>
                  Eligible projects can be deployed with little or no upfront equipment investment by the
                  society. FirsThing earns an agreed share of verified savings.
                </p>
              </div>
              <div className={styles.model}>
                <div className={styles.symbol}>💳</div>
                <h3>Direct Purchase Model</h3>
                <p>Customers purchase the solution upfront, with installation, warranty and support terms agreed for each project.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="calculator">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Savings calculator</p>
              <h2>How Much Could Your Society Save?</h2>
              <p>Estimate potential monthly lighting savings using your own operating assumptions.</p>
            </div>
            <Calculator />
            <p className={styles.disclaimer} style={{ marginTop: 15 }}>
              Assumes 30 days and a constant full-rated baseline. Actual savings depend on site
              conditions and verified usage; estimates exclude service fees and are not guarantees.
            </p>
          </div>
        </section>

        <section className={styles.soft}>
          <div className={`${styles.container} ${styles.dashboard}`}>
            <div>
              <p className={styles.eyebrow}>Built on data, backed by transparency</p>
              <h2>Every Unit Saved. Every System Monitored.</h2>
              <p className={styles.muted}>
                Access energy consumption, savings reports, inspection records and water-system
                visibility from one customer portal.
              </p>
              <p>
                ✓ Live energy monitoring
                <br />✓ Verified savings reports
                <br />✓ Water tank visibility
                <br />✓ Inspection and billing reports
              </p>
              <a className={`${styles.btn} ${styles.secondary}`} href={dashboardHref}>
                {loginLabel} ↗
              </a>
            </div>
            <div className={styles.dashVisual}>
              <p className={styles.eyebrow}>Illustrative dashboard</p>
              <h3>Infrastructure Overview</h3>
              <div className={styles.dashRow}>
                <span>Monthly energy reduction</span>
                <b>64%</b>
              </div>
              <div className={styles.bar}>
                <span />
              </div>
              <div className={styles.dashRow}>
                <span>Energy monitoring</span>
                <b style={{ color: "var(--green)" }}>Active</b>
              </div>
              <div className={styles.dashRow}>
                <span>Water monitoring</span>
                <b style={{ color: "var(--green)" }}>Connected</b>
              </div>
              <div className={styles.dashRow}>
                <span>Reports</span>
                <b>Available</b>
              </div>
              <p className={styles.disclaimer} style={{ marginTop: 18 }}>
                Sample UI, not live customer data.
              </p>
            </div>
          </div>
        </section>

        <section id="industries">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Industries we serve</p>
              <h2>Efficiency for Every Kind of Building.</h2>
            </div>
            <div className={styles.industries}>
              <div className={styles.industry}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80"
                  alt="Residential buildings"
                />
                <h3>Residential Societies</h3>
              </div>
              <div className={styles.industry}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80"
                  alt="Commercial building interior"
                />
                <h3>Commercial Buildings</h3>
              </div>
              <div className={styles.industry}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="https://images.unsplash.com/photo-1581092334651-ddf26d9a09d0?auto=format&fit=crop&w=800&q=80"
                  alt="Industrial facility"
                />
                <h3>Industrial Facilities</h3>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.cta} id="contact">
          <div className={`${styles.container} ${styles.ctaWrap}`}>
            <div>
              <p className={styles.eyebrow}>Let&rsquo;s make your property more efficient</p>
              <h2>Your Next Electricity Bill Could Be Smarter.</h2>
              <p>
                Discover how much energy and water your property could save with measurement,
                automation and intelligent infrastructure.
              </p>
              <p>
                ✉ info@firsthing.earth
                <br />🌐 www.firsthing.earth
              </p>
            </div>
            <ContactForm />
          </div>
        </section>
      </main>

      <footer>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <a className={styles.logo} href="#home" aria-label="FirsThing.earth">
                <BrandMark variant="dark" className="h-7" />
              </a>
              <p>
                Energy &amp; Water Infrastructure Automation.
                <br />
                Smarter buildings, lower costs, greener tomorrow.
              </p>
              <p>BlueStonez Trailblazzer Private Limited</p>
            </div>
            <div>
              <h3>Solutions</h3>
              <a href="#solutions">Smart Lighting</a>
              <a href="#solutions">Pump Automation</a>
              <a href="#solutions">Water Automation</a>
              <a href="#solutions">Energy Intelligence</a>
            </div>
            <div>
              <h3>Connect</h3>
              <a href="#contact">Get an Assessment</a>
              <a href={dashboardHref}>{loginLabel}</a>
              <a href="mailto:info@firsthing.earth">info@firsthing.earth</a>
              <a href="https://www.firsthing.earth">www.firsthing.earth</a>
            </div>
          </div>
          <div className={styles.fine}>
            © {new Date().getFullYear()} FirsThing.earth · Website concept preview · Confirm legal details, client approvals
            and current metrics before launch.
          </div>
        </div>
      </footer>
    </div>
  );
}
