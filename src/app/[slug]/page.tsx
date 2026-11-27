import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { certificateDate, monthLabel } from "@/lib/format-date";
import { loadSocietyPublicPage, type SocietyPublicPage } from "@/lib/society-public-page";
import { PrintButton, ShareButton } from "./share-buttons";
import styles from "./community.module.css";
import type { PublicSectionKey } from "@/lib/public-page-sections";

/**
 * A society's public page — firsthing.earth/<slug> (2026-11-27,
 * user-specified). Anyone with the link can open it: it is what an RWA shows
 * its residents about the work done at their society. The app's own paths
 * (/admin, /portal, /login…) are folders beside this one and always win, and
 * no society can take one of those words (src/lib/society-slug.ts). No rupee
 * amount appears here, by the user's rule — only energy and percentages.
 */

export const dynamic = "force-dynamic";

const n = (v: number) => Math.round(v).toLocaleString("en-IN");

async function resolve(slug: string): Promise<SocietyPublicPage> {
  const r = await loadSocietyPublicPage(slug);
  if (!r) notFound();
  if ("redirectTo" in r) permanentRedirect(r.redirectTo);
  return r.page;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await loadSocietyPublicPage((await params).slug);
  if (!r || "redirectTo" in r) return { title: "FirsThing.earth" };
  const p = r.page;
  const description = `${p.name}, ${p.location} — a FirsThing Featured Community.`;
  return {
    title: `${p.name} | FirsThing Featured Community`,
    description,
    // Shared by the society, not searched for: the page carries the names of
    // people when the RWA allows it, so search engines are asked to leave it.
    robots: { index: false, follow: false },
    openGraph: { title: `${p.name} | FirsThing Featured Community`, description, images: p.buildingPhotoUrl ? [p.buildingPhotoUrl] : undefined },
  };
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICON = {
  bulb: "M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z",
  drop: "M12 2.7s-6 6.6-6 11.3a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z",
  pump: "M4 20h16M6 20V9l6-5 6 5v11M10 20v-6h4v6",
  chart: "M3 3v18h18M7 15l4-4 3 3 5-6",
  leaf: "M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.1-6",
};

export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const p = await resolve((await params).slug);
  const since = p.partnerSince ? monthLabel(p.partnerSince) : null;
  // What the back office has chosen to show (Societies → Public pages).
  const show = (k: PublicSectionKey) => !p.hidden.includes(k);
  const leadership = p.showLeadership ? p.leadership : [];
  const pumpPct =
    p.pumpRoom && p.pumpRoom.nowKwhPerKl !== null && p.pumpRoom.beforeKwhPerKl > 0
      ? Math.round(((p.pumpRoom.beforeKwhPerKl - p.pumpRoom.nowKwhPerKl) / p.pumpRoom.beforeKwhPerKl) * 100)
      : null;

  const initiatives: { icon: string; title: string; text: string }[] = [];
  if (p.lights.total > 0)
    initiatives.push({
      icon: ICON.bulb,
      title: "Energy-efficient lighting",
      text: `${n(p.lights.total)} LED lights fitted in the society's common areas, replacing older fittings that drew more power.`,
    });
  if (p.lights.total > 0)
    initiatives.push({
      icon: ICON.chart,
      title: "Measured, month by month",
      text: "Common-area lighting is metered, and the saving is checked against the agreed figure in every monthly report.",
    });
  if (p.tanks > 0)
    initiatives.push({
      icon: ICON.drop,
      title: "Water tank monitoring",
      text: `${n(p.tanks)} water tank${p.tanks === 1 ? " is" : "s are"} watched around the clock, so overflow and dry tanks are caught early.`,
    });
  if (p.pumpRoom)
    initiatives.push({
      icon: ICON.pump,
      title: "Pump-room automation",
      text:
        pumpPct !== null && pumpPct > 0
          ? `Water is now pumped using ${pumpPct}% less electricity per kilolitre than before the automation.`
          : "The pump room runs on automation that matches pumping to demand and is measured every day.",
    });
  if (initiatives.length === 0)
    initiatives.push({
      icon: ICON.leaf,
      title: "A journey that has begun",
      text: `${p.name} has started working with FirsThing on smarter, more efficient management of its shared services.`,
    });

  const stats: { value: string; label: string }[] = [];
  if (p.savings) {
    stats.push({ value: `${n(p.savings.savedKwh)} kWh`, label: "of electricity saved on common-area lighting" });
    if (p.savings.savingsPct !== null) stats.push({ value: `${Math.round(p.savings.savingsPct)}%`, label: "less energy than the old lights used" });
    stats.push({ value: n(p.savings.months), label: `month${p.savings.months === 1 ? "" : "s"} of verified savings` });
  }
  if (p.pumpRoom && p.pumpRoom.savedKwh > 0)
    stats.push({ value: `${n(p.pumpRoom.savedKwh)} kWh`, label: `saved in the pump room since ${monthLabel(p.pumpRoom.since)}` });

  const intro =
    p.intro ??
    `${p.name}'s story is about a community that values thoughtful management, reliable shared services and steady improvement. Working together, the RWA, residents and FirsThing keep finding practical ways to make the society's buildings smarter and more efficient.`;
  const initials = p.name
    .replace(/^the\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  const photo = p.buildingPhotoUrl ? { backgroundImage: `linear-gradient(0deg,#09271e88,transparent 60%), url("${p.buildingPhotoUrl}")` } : undefined;

  return (
    <div className={styles.root}>
      <div className={styles.top}>
        <div className={styles.wrap}>
          <span>FirsThing.earth · Featured Community</span>
          <span className={styles.topRight}>Smarter Buildings. Greener Tomorrow.</span>
        </div>
      </div>
      <header className={styles.header}>
        <div className={styles.wrap}>
          <Link href="/" aria-label="FirsThing.earth home">
            <BrandMark className="h-8" />
          </Link>
          <nav className={styles.nav} aria-label="On this page">
            {show("initiatives") && <a href="#initiatives">Initiatives</a>}
            {show("impact") && stats.length > 0 && <a href="#impact">Impact</a>}
            {show("story") && <a href="#story">Community story</a>}
            {show("recognition") && <a href="#recognition">Recognition</a>}
          </nav>
          <ShareButton name={p.name} className={styles.btn} />
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.wrap}>
          <div className={styles.eyebrow}>A FirsThing Featured Community</div>
          <div className={styles.heroGrid}>
            <div>
              <h1>
                {p.name}.
                <br />
                <em>Moving forward together.</em>
              </h1>
              <p>
                Celebrating the people and initiatives that make {p.name}, {p.location} a smarter and more
                sustainable place to live.
              </p>
              <div className={styles.actions}>
                {show("initiatives") && (
                  <a href="#initiatives" className={`${styles.btn} ${styles.btnLime}`}>
                    See what&apos;s been done ↓
                  </a>
                )}
                {show("recognition") && (
                  <a href="#recognition" className={`${styles.btn} ${styles.btnGhost}`}>
                    View recognition
                  </a>
                )}
              </div>
            </div>
            <div className={styles.photo} style={photo} role={p.buildingPhotoUrl ? "img" : undefined} aria-label={p.buildingPhotoUrl ? `${p.name}` : undefined}>
              {!p.buildingPhotoUrl && (
                <span className={styles.monogram} aria-hidden>
                  {initials}
                </span>
              )}
              <div className={styles.photoTag}>
                {p.name} · {p.location}
              </div>
              <div className={styles.seal} aria-hidden>
                <span>
                  ✦<br />
                  FEATURED
                  <br />
                  COMMUNITY
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className={`${styles.wrap} ${styles.identity}`}>
        <div className={styles.identityCard}>
          <div>
            <div className={styles.label}>Community spotlight</div>
            <h2>{p.name}</h2>
            <p>{p.location} · recognised for community leadership and smarter building management.</p>
          </div>
          <span className={styles.badge}>{since ? `FirsThing partner since ${since}` : "FirsThing featured community"}</span>
        </div>
      </div>

      {show("initiatives") && (
      <section className={styles.section} id="initiatives">
        <div className={styles.wrap}>
          <div className={styles.head}>
            <div>
              <div className={styles.kicker}>A smarter community</div>
              <h2>What {p.name} has put in place.</h2>
            </div>
            <p className={styles.intro}>
              A community is shaped by everyday decisions that improve shared spaces and essential services. These are
              the steps taken here with FirsThing.
            </p>
          </div>
          <div className={styles.cards}>
            {initiatives.map((i) => (
              <div key={i.title} className={styles.card}>
                <div className={styles.ico}>
                  <Icon d={i.icon} />
                </div>
                <h3>{i.title}</h3>
                <p>{i.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {show("impact") && stats.length > 0 && (
        <section className={styles.impact} id="impact">
          <div className={styles.wrap}>
            <div className={styles.head}>
              <div>
                <div className={styles.kicker}>The difference so far</div>
                <h2 style={{ fontSize: "clamp(24px,3vw,32px)", color: "var(--p)", margin: "8px 0 0", letterSpacing: "-0.04em" }}>
                  Energy saved, and still counting.
                </h2>
              </div>
            </div>
            <div className={styles.stats}>
              {stats.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <b>{s.value}</b>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
            <p className={styles.note}>From FirsThing&apos;s monthly savings reports for {p.name}.</p>
          </div>
        </section>
      )}

      {show("story") && (
      <section className={styles.story} id="story">
        <div className={`${styles.wrap} ${styles.storyGrid}`}>
          <div className={styles.storyPanel} style={photo}>
            {!p.buildingPhotoUrl &&
              (p.lights.total > 0 ? (
                <div>
                  <b>{n(p.lights.total)}</b>
                  <span>LED lights fitted with FirsThing</span>
                </div>
              ) : (
                <div>
                  <b>{initials}</b>
                  <span>{p.location}</span>
                </div>
              ))}
          </div>
          <div>
            <div className={styles.kicker}>The community story</div>
            <h2>Building a better everyday experience.</h2>
            <p style={{ whiteSpace: "pre-line" }}>{intro}</p>
            <p>FirsThing is pleased to support this journey with technology-led energy monitoring and efficiency solutions.</p>
            <div className={styles.facts}>
              <div className={styles.fact}>
                <b>{p.location}</b>
                <span>Location</span>
              </div>
              {p.flatCount !== null && (
                <div className={styles.fact}>
                  <b>{n(p.flatCount)} homes</b>
                  <span>Residential community</span>
                </div>
              )}
              {since && (
                <div className={styles.fact}>
                  <b>Since {since}</b>
                  <span>FirsThing partner</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
      )}

      {show("testimonial") && p.testimonial && (
        <section className={styles.quote}>
          <div className={styles.quoteInner}>
            <div className={styles.kicker} style={{ color: "#5f7d3e" }}>
              A word from the RWA
            </div>
            <div className={styles.quoteMark} aria-hidden>
              “
            </div>
            <blockquote>{p.testimonial.quote}</blockquote>
            <div className={styles.by}>
              {p.testimonial.authorPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a member's own uploaded photo
                <img src={p.testimonial.authorPhotoUrl} alt="" className={styles.avatar} />
              )}
              <span>
                <b>{p.testimonial.authorName}</b>
                {p.testimonial.authorRole ? ` · ${p.testimonial.authorRole}` : ""}
              </span>
            </div>
          </div>
        </section>
      )}

      {leadership.length > 0 && (
        <section className={styles.lead}>
          <div className={`${styles.wrap} ${styles.leadGrid}`}>
            <div>
              <div className={styles.kicker}>People behind the progress</div>
              <h2>Recognising community leadership.</h2>
              <p>
                Strong communities are built by the time and care of the people who step forward to serve them. This
                recognises {p.name}&apos;s RWA for its role in supporting these improvements.
              </p>
            </div>
            <div className={styles.people}>
              <h3>{p.name} · RWA leadership</h3>
              {leadership.map((m) => (
                <div key={`${m.name}-${m.position}`} className={styles.person}>
                  <b>{m.name}</b>
                  <span>{m.position}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {show("recognition") && (
      <section className={styles.certSection} id="recognition">
        <div className={styles.wrap}>
          <div className={`${styles.center} ${styles.certIntro}`}>
            <div className={styles.kicker}>A mark of recognition</div>
            <h2>Celebrating {p.name}.</h2>
          </div>
          <div className={styles.cert}>
            <div className={styles.certIn}>
              <div className={styles.certK}>FirsThing.earth · Certificate of Recognition</div>
              <h3>Featured Community</h3>
              <p>This recognition is proudly presented to</p>
              <div className={styles.soc}>
                {p.name}, {p.location}
              </div>
              <p>
                In appreciation of the community&apos;s commitment to thoughtful building management, smarter energy
                practices and a more sustainable residential environment.
              </p>
              <div className={styles.certSeal} aria-hidden>
                <Icon d={ICON.leaf} />
              </div>
              <div className={styles.certK}>Smarter Buildings. Greener Tomorrow.</div>
              <div className={styles.certBottom}>
                <span>FirsThing.earth · {certificateDate(p.recognisedOn)}</span>
                <span>Authorised signatory · FirsThing.earth</span>
              </div>
            </div>
          </div>
          <div className={styles.certActions}>
            <PrintButton className={`${styles.btn} ${styles.btnLime}`} />
            <ShareButton name={p.name} className={`${styles.btn} ${styles.btnGhost}`} />
          </div>
        </div>
      </section>
      )}

      <section className={styles.cta}>
        <div className={styles.wrap}>
          <div>
            <h2>Every community has a story worth sharing.</h2>
            <p>FirsThing is proud to work alongside communities building a smarter, more sustainable future.</p>
          </div>
          <Link href="/" className={styles.btn}>
            Connect with FirsThing ↗
          </Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <b>FirsThing.earth</b>
          <span>Save Energy for Future &amp; Make India Smarter.</span>
          <span>© {new Date().getFullYear()} FirsThing.earth</span>
        </div>
      </footer>
    </div>
  );
}
