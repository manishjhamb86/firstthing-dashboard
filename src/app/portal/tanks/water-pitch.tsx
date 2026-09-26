import { Check, Droplets, Gauge, Hand, Mail, Phone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui";
import { SALES_CONTACTS } from "@/lib/company";
import { WaterEnquiryForm } from "./water-enquiry-form";

/**
 * What a society with no tanks connected sees on its water page
 * (2026-09-26, user-asked: "show them what they are missing"). Written as a
 * pitch, in the order a committee decides: the problem they already have,
 * proof from their own account that FirsThing delivers, two clear options,
 * how it happens, and one way to ask — plus a person to call.
 *
 * Every claim is one the product can stand behind: no invented percentages,
 * and the lighting figure is the society's own published total. Automation
 * runs on the controller on site; this portal only ever shows it (INV-08).
 */
export function WaterPitch({ lightingSaved, sentOn }: { lightingSaved: number | null; sentOn: string | null }) {
  return (
    <div className="flex flex-col gap-6">
      {/* The hook */}
      <section
        className="overflow-hidden rounded-[var(--r-lg)] border p-6 sm:p-8"
        style={{ borderColor: "var(--accent-line)", background: "var(--accent-subtle)" }}
      >
        <p className="lbl mb-3" style={{ color: "var(--accent)" }}>
          Water &amp; pump systems
        </p>
        <h2 className="max-w-[30ch] text-[26px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[32px]">
          Stop paying to pump water that overflows
        </h2>
        <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          An overflowing tank wastes the water and the electricity it took to pump it — and it is usually
          noticed only when someone happens to see it. FirsThing can watch every tank for you and stop the
          overflow before it starts.
        </p>
        {lightingSaved !== null && lightingSaved > 0 && (
          <p
            className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-[var(--r-md)] px-3 py-2 text-[13.5px] font-semibold"
            style={{ background: "var(--ok-bg)", color: "var(--ok-fg)" }}
          >
            <Check size={16} aria-hidden />
            FirsThing has already saved your society ₹{Math.round(lightingSaved).toLocaleString("en-IN")} on
            lighting. Bring the same care to your water.
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="#enquiry" className="btn-primary h-11 px-6 text-[15px]">
            Contact us
          </a>
          <a href={`tel:+91${SALES_CONTACTS.calls[0].phone}`} className="btn-secondary h-11 px-6 text-[15px]">
            <Phone size={16} aria-hidden className="mr-2" />
            Call {SALES_CONTACTS.calls[0].name.split(" ")[0]}
          </a>
        </div>
      </section>

      {/* The problem, in their words */}
      <section>
        <h3 className="mb-3 text-[17px] font-bold">What an unwatched water system costs you</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <Problem
            icon={Droplets}
            title="Overflow"
            text="A tank fills, keeps filling, and runs off the terrace — water you paid to pump, and the power it took."
          />
          <Problem
            icon={Gauge}
            title="Pumps running dry"
            text="A pump left on with no water behind it wears out fast, and the repair bill arrives without warning."
          />
          <Problem
            icon={Hand}
            title="Switching by hand"
            text="Someone has to be there at the right time, every time — including at night and on holidays."
          />
        </div>
      </section>

      {/* The two offers */}
      <section>
        <h3 className="mb-3 text-[17px] font-bold">Two ways to fix it</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <Plan
            title="Tank monitoring & overflow control"
            fit="For societies whose pumps are managed, but whose tanks still overflow."
            points={[
              "A level sensor on every tank, live in this portal",
              "An automatic flow-control valve on each monitored tank closes the inlet before it overflows — zero overflow",
              "An alert when a tank runs low or a sensor stops reporting",
            ]}
          />
          <Plan
            title="Complete pump-room automation"
            fit="For societies that switch pumps by hand or on a timer."
            recommended
            points={[
              "Everything in tank monitoring & overflow control",
              "An automatic pump controller starts and stops the pumps from the tank levels — nobody needs to be on duty",
              "Dry-run protection: a pump never runs without water",
              "Variable-frequency drives where your pumps need them, so they run only as hard as the demand — and use less electricity",
              "It all runs on its own on site; this portal shows you what it is doing",
            ]}
          />
        </div>
      </section>

      {/* How it happens */}
      <section>
        <h3 className="mb-3 text-[17px] font-bold">How it works</h3>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Ask", "Use the form below, or call us."],
            ["We visit", "Our engineers walk your tanks and pump room."],
            ["You decide", "You get a proposal for your society's setup."],
            ["We install", "Then you watch every tank, live, right here."],
          ].map(([t, d], i) => (
            <li key={t} className="card flex gap-3 p-4">
              <span
                className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[14px] font-bold"
                style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
              >
                {i + 1}
              </span>
              <span>
                <span className="block text-[14px] font-bold">{t}</span>
                <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                  {d}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* The ask */}
      <section id="enquiry" className="grid scroll-mt-6 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card className="p-6">
          <h3 className="mb-1 text-[17px] font-bold">Contact us</h3>
          <p className="mb-4 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
            Tell us which option interests you and where to reach you. Our team will call you back.
          </p>
          <WaterEnquiryForm sentOn={sentOn} />
        </Card>
        <Card className="p-6">
          <h3 className="mb-1 text-[17px] font-bold">Rather talk to someone?</h3>
          <p className="mb-4 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
            Call or write — we&apos;ll answer your questions before any visit.
          </p>
          <ul className="flex flex-col gap-2">
            {SALES_CONTACTS.calls.map((c) => (
              <li key={c.phone}>
                <a
                  href={`tel:+91${c.phone}`}
                  className="flex items-center gap-3 rounded-[var(--r-md)] border px-4 py-3"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <Phone size={18} aria-hidden style={{ color: "var(--accent)" }} />
                  <span className="flex-1">
                    <span className="block text-[14px] font-semibold">Call {c.name}</span>
                    <span className="num text-[13px]" style={{ color: "var(--text-muted)" }}>
                      +91 {c.phone.slice(0, 5)} {c.phone.slice(5)}
                    </span>
                  </span>
                </a>
              </li>
            ))}
            {SALES_CONTACTS.emails.map((e) => (
              <li key={e}>
                <a
                  href={`mailto:${e}?subject=${encodeURIComponent("Water & pump system for our society")}`}
                  className="flex items-center gap-3 rounded-[var(--r-md)] border px-4 py-3"
                  style={{ borderColor: "var(--border-subtle)" }}
                >
                  <Mail size={18} aria-hidden style={{ color: "var(--accent)" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-semibold">Email us</span>
                    <span className="block truncate text-[13px]" style={{ color: "var(--text-muted)" }}>
                      {e}
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </Card>
      </section>
    </div>
  );
}

function Problem({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <Card className="p-5">
      <span
        className="mb-3 flex h-10 w-10 items-center justify-center rounded-full"
        style={{ background: "var(--warn-bg)", color: "var(--warn-fg)" }}
      >
        <Icon size={20} aria-hidden />
      </span>
      <p className="text-[15px] font-bold">{title}</p>
      <p className="mt-1 text-[13.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {text}
      </p>
    </Card>
  );
}

function Plan({ title, fit, points, recommended }: { title: string; fit: string; points: string[]; recommended?: boolean }) {
  return (
    <div
      className="card flex flex-col p-6"
      style={recommended ? { borderColor: "var(--accent)", boxShadow: "0 0 0 1px var(--accent)" } : undefined}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[17px] font-bold">{title}</h4>
        {recommended && (
          <span
            className="rounded-[var(--r-pill)] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
            style={{ background: "var(--accent)", color: "var(--text-on-accent)" }}
          >
            Recommended
          </span>
        )}
      </div>
      <p className="mb-4 text-[13.5px]" style={{ color: "var(--text-muted)" }}>
        {fit}
      </p>
      <ul className="flex flex-col gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex gap-2.5 text-[14px] leading-snug">
            <Check size={17} aria-hidden className="mt-0.5 shrink-0" style={{ color: "var(--ok-fg)" }} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
