import { Activity, Gauge, LineChart, ShieldCheck, Wrench, ClipboardCheck, Zap } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { resolveTheme } from "@/lib/resolve-theme";
import { COMPANY, SALES_CONTACTS } from "@/lib/company";

export const dynamic = "force-dynamic";

// The public marketing homepage (2026-10-02, user-specified): www.firsthing.earth
// was a separate static site; this is the same content and claims, brought
// into this app and rebuilt on its own design-token system (the user's own
// choice — "rebuild with the app's own design system") so the public site and
// the product read as one brand rather than two unrelated-looking surfaces.
// Reachable directly at /marketing on any host, and rewritten here by
// src/proxy.ts whenever the request's own Host header is the public domain —
// see that file's comment for what this app-level change does and does not
// cover (DNS/reverse-proxy for the real app./www. split is a separate step).
//
// Content basis: the live site as fetched 2026-10-02 (nav: About us, Contact;
// hero; Who We Are; Solutions/EnergiTrack; How It Works; Products;
// Testimonials; footer contact details). Two nav items on the live site are
// deliberately NOT reproduced here, stated rather than silently dropped:
// "Analytics" points at a separate subdomain (Analytics.FirsThing.earth) this
// app does not own, and "Basement Parking" names a page whose content this
// pass had nothing to recreate from.

const SOLUTIONS = [
  { icon: Activity, title: "Appliance-level monitoring", body: "See what every circuit draws, not just the building's total — the same per-light-type metering the product itself runs on." },
  { icon: Gauge, title: "Real-time consumption data", body: "Hourly readings, not an estimate reconciled once a quarter." },
  { icon: LineChart, title: "Savings you can trace", body: "Every percentage traces back to the readings and the benchmark that produced it." },
  { icon: ShieldCheck, title: "No control over your equipment", body: "The platform reads sensor and meter data — it never issues a command to switch anything off." },
  { icon: Zap, title: "Up to 50% lower energy spend", body: "Measured against a commissioned baseline, not a rule of thumb." },
];

const STEPS = [
  { icon: ClipboardCheck, step: "1", title: "Site audit", body: "We walk the site, count the fixtures, and commission a measured baseline for each circuit." },
  { icon: Wrench, step: "2", title: "Automation", body: "Energy-efficient devices go in; a meter watches the result against that baseline." },
  { icon: LineChart, step: "3", title: "Saving money", body: "You pay a share of the saving the readings actually show, every month, on an invoice you can audit." },
];

const PRODUCTS = [
  { name: "Energy Track Device", body: "The meter behind every figure on your monthly bill — installed per circuit, read hourly." },
  { name: "Energy Saving Device", body: "Automated lighting control sized to cut a circuit's draw by up to 35%, verified against its own commissioned baseline." },
];

const TESTIMONIALS = [
  { quote: "Our common-area electricity bill dropped noticeably within the first billing cycle, and we can see exactly where the saving comes from.", name: "RWA office-bearer", place: "Gurugram" },
  { quote: "No upfront cost, no hardware to manage ourselves — FirsThing installed it and we just watch the bill.", name: "Facility manager", place: "Noida" },
  { quote: "What won us over was that the savings are measured, not promised — we could see the readings behind the number.", name: "Committee member", place: "Bengaluru" },
];

export default async function MarketingHomePage() {
  const theme = await resolveTheme();
  const wordmarkVariant = theme === "dark" ? "dark" : "light";

  return (
    <div style={{ background: "var(--surface)", color: "var(--text)" }}>
      {/* Nav */}
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b px-6 py-4 backdrop-blur"
        style={{ borderColor: "var(--border-subtle)", background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
      >
        <BrandMark variant={wordmarkVariant} className="h-7" />
        <nav className="hidden items-center gap-6 text-[14px] font-medium sm:flex" style={{ color: "var(--text-muted)" }}>
          <a href="#who-we-are" className="hover:text-[var(--text)]">Who we are</a>
          <a href="#solutions" className="hover:text-[var(--text)]">Solutions</a>
          <a href="#how-it-works" className="hover:text-[var(--text)]">How it works</a>
          <a href="#contact" className="hover:text-[var(--text)]">Contact</a>
        </nav>
        <a href="https://app.firsthing.earth/login" className="btn-primary btn-sm">
          Login
        </a>
      </header>

      {/* Hero */}
      <section
        className="relative overflow-hidden px-6 py-20 sm:py-28"
        style={{
          background: `linear-gradient(160deg, var(--auth-panel) 0%, var(--auth-panel-lift) 100%)`,
          color: "var(--auth-panel-text)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-[28rem] w-[28rem] rounded-full"
          style={{ background: `radial-gradient(circle, var(--auth-glow) 0%, transparent 70%)` }}
        />
        <div className="relative mx-auto max-w-3xl text-center">
          <h1 className="text-[36px] font-bold leading-[1.15] tracking-[-0.02em] text-balance sm:text-[48px]">
            IoT-based energy management for residential and commercial infrastructure
          </h1>
          <p className="mt-5 text-[17px] leading-relaxed" style={{ color: "var(--auth-panel-muted)" }}>
            FirsThing instruments your building&rsquo;s lighting and power circuits, measures what they
            actually draw, and cuts your energy spend — with no upfront cost and no control over your
            equipment.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="https://app.firsthing.earth/login" className="btn-primary">Login</a>
            <a href="#contact" className="btn-outline" style={{ borderColor: "var(--auth-panel-line)", color: "var(--auth-panel-text)" }}>
              Get in touch
            </a>
          </div>
        </div>
      </section>

      {/* Who we are */}
      <section id="who-we-are" className="mx-auto max-w-4xl px-6 py-20 text-center">
        <h2 className="text-[26px] font-bold tracking-[-0.01em]">Who we are</h2>
        <p className="mt-4 text-[16px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          FirsThing builds IoT-based energy management for the buildings people actually live and
          work in — residential societies, co-living spaces, and commercial infrastructure. We
          instrument a site, measure it, and keep measuring it for as long as we bill against it.
        </p>
      </section>

      {/* Solutions */}
      <section id="solutions" className="px-6 py-20" style={{ background: "var(--surface-sunken)" }}>
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <p className="lbl" style={{ color: "var(--accent)" }}>EnergiTrack</p>
            <h2 className="mt-2 text-[26px] font-bold tracking-[-0.01em]">Our flagship solution</h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px]" style={{ color: "var(--text-muted)" }}>
              Appliance-level visibility, measured savings, and no control over your equipment.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUTIONS.map(({ icon: Icon, title, body }) => (
              <div key={title} className="card p-6">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-[var(--r-sm)]"
                  style={{ background: "var(--accent-subtle)", color: "var(--accent)" }}
                >
                  <Icon size={19} strokeWidth={1.75} />
                </span>
                <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-[26px] font-bold tracking-[-0.01em]">How it works</h2>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, step, title, body }, i) => (
            <div key={step} className="relative text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}>
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <p className="mt-4 num text-[13px] font-semibold" style={{ color: "var(--accent)" }}>Step {step}</p>
              <h3 className="mt-1 text-[16px] font-semibold">{title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{body}</p>
              {i < STEPS.length - 1 && (
                <div
                  aria-hidden
                  className="absolute left-[calc(50%+40px)] top-7 hidden h-px w-[calc(100%-80px)] sm:block"
                  style={{ background: "var(--border)" }}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Products */}
      <section className="px-6 py-20" style={{ background: "var(--surface-sunken)" }}>
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <h2 className="text-[26px] font-bold tracking-[-0.01em]">Products</h2>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {PRODUCTS.map((p) => (
              <div key={p.name} className="card p-6">
                <h3 className="text-[16px] font-semibold">{p.name}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="text-center">
          <h2 className="text-[26px] font-bold tracking-[-0.01em]">What societies say</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <figure key={t.name} className="card p-6">
              <blockquote className="text-[13.5px] leading-relaxed" style={{ color: "var(--text)" }}>
                &ldquo;{t.quote}&rdquo;
              </blockquote>
              <figcaption className="mt-4 text-[13px] font-medium" style={{ color: "var(--text-muted)" }}>
                {t.name} · {t.place}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Contact / footer */}
      <footer id="contact" className="border-t px-6 py-16" style={{ borderColor: "var(--border-subtle)" }}>
        <div className="mx-auto grid max-w-5xl gap-10 sm:grid-cols-2">
          <div>
            <BrandMark variant={wordmarkVariant} className="h-7" />
            <p className="mt-4 max-w-xs text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {COMPANY.legalName}
            </p>
            <p className="mt-2 max-w-xs text-[13px] leading-relaxed" style={{ color: "var(--text-subtle)" }}>
              {COMPANY.address}
            </p>
          </div>
          <div>
            <p className="lbl" style={{ color: "var(--text-subtle)" }}>Get in touch</p>
            <p className="mt-3 text-[14px]">
              <a href={`mailto:${COMPANY.email}`} className="font-medium hover:underline">{COMPANY.email}</a>
            </p>
            <ul className="mt-2 space-y-1 text-[14px]">
              {SALES_CONTACTS.calls.map((c) => (
                <li key={c.phone}>
                  <a href={`tel:+91${c.phone}`} className="font-medium hover:underline">
                    {c.name} · +91 {c.phone}
                  </a>
                </li>
              ))}
            </ul>
            <a href="https://app.firsthing.earth/login" className="btn-primary btn-sm mt-6 inline-flex">
              Login to your dashboard
            </a>
          </div>
        </div>
        <p className="mx-auto mt-12 max-w-5xl text-[12.5px]" style={{ color: "var(--text-subtle)" }}>
          © {new Date().getFullYear()} {COMPANY.legalName}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
