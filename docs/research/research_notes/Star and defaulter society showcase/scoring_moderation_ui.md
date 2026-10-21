# Star and defaulter society showcase: scoring, moderation and UI

> **How this was researched (2026-10-21).** Every page fetch failed: WebFetch got DNS errors on dnb.com, w3.org, evanmiller.org and nngroup.com, and curl got a 403 from the proxy. So every finding below rests on search-result summaries and the snippets they quote, not on reading the full pages. Treat the exact figures as needing a re-check against the primary page. Inferences are mine and are marked as such.

## 1. Payment behaviour scoring

### Takeaway
The reference scores weight late payment by how late it was and how much money was involved, and refuse to score a firm with no history:
- D&B's Days Beyond Terms is a **dollar-weighted** average of lateness.
- PAYDEX maps that lateness onto a 1–100 scale, with 80 meaning "on terms".
- CIBIL's MSME Rank is a 1–10 default-risk rank over 24 months of history.

FirsThing can copy that shape (dollar-weighted days-beyond-due over a rolling window) without copying the proprietary weights, which are not published.

### Cited Findings
- **D&B Days Beyond Terms.** A dollar-weighted average of payment experiences reported in the past 3 months; a 12-month version uses the same method over 12 months. — [D&B Detailed Trade Risk Insight (via search summary)](https://www.dnb.com/en-us/resources/supplier-risk/detailed-trade-risk-insight.html)
- **PAYDEX method.** D&B describes PAYDEX as algorithm-driven, using the payment trend from the past 12 months.
  - A third-party explainer describes the calculation: each payment goes into a timing category, the dollars are summed per category, and each category's share of dollars is weighted. The category weights are not published.
  - A third-party source gives the example that a late $15,000 bill hurts far more than an early $1,000 bill.
  - Sources conflict on the lookback: 12 months vs 24 months.
  - Sources: [Rho](https://www.rho.co/blog/paydex-score); [Resolve](https://resolvepay.com/blog/paydex-score-explained); [Enterprise Times](https://www.enterprisetimes.co.uk/2021/12/24/what-is-the-paydex-score-and-how-does-it-work/)
- **Official PAYDEX table** — [D&B supplier FAQ PDF](https://docs.dnb.com/static/doc-uploads/supplier/en-US/support/FAQs.pdf); [D&B slow-pay page](https://www-stgaka.dnb.co.uk/resources/financial-risk/slow-pay-late-payments.html)

  | Score | Meaning |
  | --- | --- |
  | 100 | Anticipate (pays early) |
  | 90 | Discount |
  | 80 | Prompt |
  | 70 | 15 days beyond terms |
  | 60 | 22 days |
  | 50 | 30 days |
  | 40 | 60 days |
  | 30 | 90 days |
  | 20 | 120 days |
  | 0–19 | More than 120 days |
  | UN | Unavailable |

  Secondary sources disagree slightly: one maps 70 to 14 days ([SlideShare D&B deck](https://www.slideshare.net/slideshow/business-credit-scoring-101/96660133)).
- **TransUnion CIBIL MSME Rank (CMR).**
  - A machine-learning model of the probability that an MSME becomes an NPA within 12 months.
  - Trained on more than 7 years of through-the-cycle data and computed from 24 months of the firm's own history.
  - CMR-1 is the lowest risk, CMR-10 the highest.
  - A firm with no reported credit gets no rank.
  - Factor weights are not public; blog band mappings are unofficial.
  - Sources: [TransUnion CIBIL press release](https://www.transunioncibil.com/press-release/transunion-cibil-launches-cibil-msme-rank); [enhanced CMR release](https://newsroom.transunioncibil.com/enhanced-cibil-msme-rank-launched-by-transunion-cibil-to-cover-smaller-businesses/)
- **Accounts-receivable metrics** — [Corcentric](https://www.corcentric.com/blog/metrics-accounts-receivable-performance/); [Altline](https://altline.sobanco.com/average-days-delinquent-add-in-accounting/); [Wise](https://wise.com/gb/blog/accounts-receivable-performance-metrics)
  - DSO counts all receivables.
  - Average Days Delinquent = DSO − Best Possible DSO, and isolates the past-due part.
  - Collection Effectiveness Index = (beginning AR + credit sales − ending total AR) ÷ (beginning AR + credit sales − ending current AR) × 100. Above 90% is "excellent" and below 70% is "a problem" (vendor bands).
  - DSO can rise with revenue growth even when collections improve; CEI avoids that distortion.

### Inferences
- **Per-invoice measure.** Use dollar-weighted days beyond due date (DBT) per invoice, measured on the day the last rupee settled it. Count TDS as paid on the date it is recorded, since FirsThing already treats received + TDS as settling the invoice.
- **Society score.** The ₹-weighted mean DBT over the last 12 months. Time decay is optional, for example a half-life of about 6 months.
- **Map to bands, PAYDEX-style.** On or before due is "Prompt". Then ≤15, ≤30, ≤60 and >60 days late.
- **Partial payments.** Weight each tranche by its amount and its own DBT, rather than using the final settlement date for the whole invoice. That matches the dollar-weighting rationale.
- **Open invoices.** An unpaid invoice past its due date should count at its current days overdue and grow daily. Otherwise a non-payer looks better than a late payer.
- **Disputes and holds.**
  - A disputed invoice (a deviation review is open) should be excluded or paused until resolved.
  - Invoices recorded paid at intake, from before the system, may lack a real payment date. Exclude them unless a date is recorded.
  - Neither rule is sourced; both are design judgments.
- **New customers.** Follow CIBIL's no-history → no-rank rule. Show "Not enough history" below a minimum, for example fewer than 3 released invoices or less than 3 months billed.
- **Defaulter flag.** Should rest on a hard factual trigger the system already has, for example CON-13 "suspended", or an invoice more than N days overdue with fresh confirmation. It should not rest on a composite score.

### Gaps
- PAYDEX's exact category weights and CMR's factor weights are proprietary; nothing was found.
- How bureaus treat disputed trade lines was not found in sources reached here.
- The primary D&B pages could not be fetched.

## 2. Composite scores with several parameters

### Takeaway
Rank on a shrunk, confidence-aware score rather than a raw average, so that a society with two good months cannot outrank one with twenty. Add parameters as independently normalised 0–1 sub-scores with explicit weights and a data-sufficiency rule. Collect subjective staff-behaviour input as structured, evidence-backed incident logs from several raters, with anchored scales and calibration.

### Cited Findings
- **Evan Miller's ranking posts** — [How Not To Sort By Average Rating](https://evanmiller.org/how-not-to-sort-by-average-rating.html); [Bayesian Average Ratings](https://evanmiller.org/bayesian-average-ratings.html); [Ranking Items With Star Ratings](https://www.evanmiller.org/ranking-items-with-star-ratings.html)
  - Raw averages and net votes both mis-rank. Two positives and zero negatives outrank 100 positives and one negative.
  - His 2009 fix ranks by the lower bound of the Wilson score interval.
  - His 2012 post calls that a "hack" and recommends a Bayesian approach that pulls small-sample items toward a prior.
  - His 2014 post extends this to K-star scales.
- **Critique.** A beta prior with a lower credible bound handles small samples more gracefully than the frequentist Wilson bound. — [GreaterWrong commentary](https://www.greaterwrong.com/posts/SnSYB8CFpjESfRuCm/how-not-to-sort-by-a-complicated-frequentist-formula)
- **Implementation.** Instacart publishes a dependency-free Wilson lower-bound library with a continuity correction. — [instacart/wilson_score](https://github.com/instacart/wilson_score)
- **Behaviourally anchored rating scales** — [AJS study summary (IU ScholarWorks)](https://scholarworks.indianapolis.iu.edu/items/8647cf95-224d-41c0-8715-f931f4d330bb); [rater-bias format comparison](https://opact.sdu.edu.tr/vufind/SummonRecord/FETCH-LOGICAL-a224t-145269ca2c324822ccdbc196a1cabf74f64629b766000bc8e95f732a9db0fe753); [SHRM/hr.university](https://hr.university/shrm/performance-management/behaviorally-anchored-rating-scale/)
  - Ratings are more reliable when raters judge observable behaviour, not inferred traits (Smith & Kendall 1963).
  - A 2020 *American Journal of Surgery* study: video-anchored scales reached 0.80 inter-rater reliability with untrained raters.
  - Anchors reduce halo effects.
  - Vendors say calibration sessions, where raters score the same sample and discuss, are needed to stop drift. Figures like "28% bias reduction" could not be traced to a primary source.

### Inferences
**A suggested formula:**
- Score = Σ wᵢ · sᵢ / Σ wᵢ over the parameters that have enough data.
- Each sᵢ is normalised to 0–1, for example s_payment = PAYDEX-like band ÷ 100.
- Shrink each sᵢ toward the portfolio mean m: ŝ = (n·s + k·m) / (n + k), where n is the number of observations and k is the prior strength (say 3 invoices).
- Rank for "star" on the lower bound, not the mean.
- **Extensibility.** Store parameters as rows (key, weight, normaliser, minimum n, decay) so a new one is a config entry. When a parameter lacks data for a society, renormalise over the remaining weights, and show which parameters contributed.
- **Staff-behaviour parameter.** Keep it fair:
  - an incident log with date, executive, category from a fixed list (for example: refused entry, abusive language, obstructed work, cooperative/helpful), a free-text description and an optional photo;
  - one incident per visit per rater;
  - require at least 2 distinct raters or at least 2 incidents before it counts;
  - cap any single rater's influence;
  - weight positive and negative incidents symmetrically;
  - review incidents in the approval queue (section 4).

  This mirrors anchored rating scales and calibration.
- **Keep the two lists asymmetric.**
  - Star list: composite score with a confidence lower bound.
  - Defaulter list: a factual rule (overdue or suspended), never "lowest composite". A low staff-behaviour score alone should not make a society a "defaulter".

### Gaps
- No published standard for composite customer scores in B2B services was found.
- Specific k (prior-strength) values are design choices; no source was found.

## 3. Hysteresis and stability

### Takeaway
Rating agencies favour stability and change ratings only when a shift looks persistent. Copy that with separate entry and exit thresholds, a minimum dwell time, and automatic exit after a recovery period.

### Cited Findings
- **Stability vs accuracy.** Rating users prefer stable ratings, but through-the-cycle ratings produce "cliff effects" and predict defaults less well. — [IMF WP "Rating Through-the-Cycle"](https://www.imf.org/external/pubs/cat/longres.aspx?sk=40378); [SSRN](https://papers.ssrn.com/abstract=2239540)
- **The counter-finding.** A later IMF paper using bank internal ratings found no accuracy-stability trade-off. — [IMF via search summary](https://www.imf.org/external/pubs/cat/longres.aspx?sk=40378.0)
- **What drives stability.** Moody's changes through-the-cycle ratings only when shifts look permanent. Altman & Rijken found the migration policy, more than the horizon, drives stability. — [NYU archive](https://archive.nyu.edu/handle/2451/26557)

### Inferences
Suggested rules (design, unsourced):

| Rule | Star | Defaulter |
| --- | --- | --- |
| Entry | Score ≥ 85 and no invoice overdue more than 15 days in the last 6 months | Suspended, or any invoice more than 60 days overdue with fresh payment confirmation |
| Exit | Score < 75, or any invoice more than 30 days overdue | All dues cleared and on-time payment for 3 consecutive invoices or 90 days |

Plus:
- re-evaluate monthly, not continuously;
- give every showcase entry an expiry (for example 90 days), after which it needs re-approval;
- once a society is removed, it cannot re-enter for 30 days unless approved.

### Gaps
- No source on rating watch/outlook mechanics was reached.

## 4. Human-in-the-loop approval and appeals

### Takeaway
Practitioner moderation tooling converges on one pattern:
- a queue with claim-and-lock;
- the flag reason and evidence beside the item;
- approve, reject, edit or escalate, with reason codes;
- an immutable audit log;
- appeals handled by a different reviewer;
- reversal rates monitored.

The EU DSA codifies a statement of reasons and an internal complaint route. That is useful as a model even though it does not apply to FirsThing.

### Cited Findings
- **What the reviewer sees.** The tool shows the item verbatim, history, why the filter flagged it, and Accept / Reject / Escalate. — [Bugnet](https://bugnet.io/blog/how-to-build-a-content-moderation-queue-for-player-ugc)
- **Evidence and rationale.** Preserve evidence (screenshots, related content), document the rationale, and require a rationale on irreversible actions. — [social.plus review process](https://learn.social.plus/social-plus-sdk/social/content-management/moderation/review-process); [social.plus console](https://learn.social.plus/analytics-and-moderation/console/moderation)
- **Audit log.** Immutable, recording reviewer, timestamp, action and reason code. Claim-and-lock stops two reviewers acting at once. Appeals go to a different reviewer (one source suggests a 48 h SLA). Track overturn rates to find reviewer drift. All vendor sources. — [AppMaster](https://appmaster.io/blog/content-moderation-queue-design); [GetStream](https://getstream.io/resources/projects/moderation-course/admin/queue/); [DEV](https://dev.to/multigrid/build-a-content-moderation-queue-2n2)
- **DSA Article 17.** Requires a "clear and specific statement of reasons", including the facts relied on and the redress available. Article 20 requires an effective internal complaint system, free and electronic per the proposal-stage summary. — [Verfassungsblog](https://verfassungsblog.de/remedying-overremoval/); [TaskUs](https://www.taskus.com/insights/dsa-internal-complaint-handling-system/); [Latham summary](https://www.lw.com/en/people/admin/upload/SiteAttachments/The%20EU%E2%80%99s%20Proposed%20Digital%20Services%20Act%20v2.pdf)

### Inferences
**Queue item.** Each item shows:
- the society;
- the proposed list (star or defaulter);
- the rule that fired, in words, for example "Invoice FT/2026-27/055 is 64 days overdue; payment status confirmed 20-10-2026";
- the evidence: the invoices and payments behind it, with links;
- the score breakdown per parameter;
- for staff-behaviour, the incidents with their raters;
- the proposed card text, editable;
- a "show description publicly" toggle;
- an expiry date.

**Actions:**
- approve;
- approve with edits;
- reject (reason required);
- snooze until a date.

**Four-eyes control.**
- A defaulter listing needs two approvers, or the creator cannot approve their own manual addition. This matches the codebase's existing `DateChangeRequest` pattern: no self-approval, plus a permission.
- A star listing could need one approver.
- A manual addition goes through the same queue with "manual" as its reason.

**Before it goes public:**
- Before a defaulter entry is shown, notify the society's office-bearer through the portal. Give a right of reply window (for example 7 days) and a way to dispute, routed to a reviewer who did not approve it.
- Auto-withdraw an entry when its exit rule fires, and log the withdrawal.
- Re-check the triggering facts at approval time (the request may be stale), following the existing "superseded" pattern.

### Gaps
- No primary standard for four-eyes on reputational listings was found. The SLAs cited are vendor examples.

## 5. Carousel UI, accessibility and alternatives

### Takeaway
An auto-rotating carousel has to meet several requirements:
- **WCAG 2.2 SC 2.2.2 (Level A):** a visible pause/stop control.
- **WAI-ARIA Authoring Practices example:** pause on hover and focus, and start paused under reduced-motion preferences.

NN/g evidence and other research say auto-forwarding carousels are often ignored or missed. A static grid or a manually scrolled row is usually better.

### Cited Findings
- **APG carousel example** — [W3C APG carousel examples](https://w3c.github.io/wai-website/ARIA/apg/patterns/carousel/examples/carousel-1-prev-next/); [tablist example](https://w3c.github.io/wai-website/ARIA/apg/patterns/carousel/examples/carousel-2-tablist/)
  - Rotation pauses while the pointer hovers or keyboard focus is inside the carousel.
  - Rotation starts paused if the OS reduced-motion setting is on.
  - The rotation control is always visible.
  - Starting rotation explicitly overrides hover and focus.
- **Restart after pause.** One guide argues rotation should restart only on an explicit user action, which is stricter than the APG example; the sources conflict. — [TestParty](https://testparty.ai/blog/accessible-carousels-sliders-auto-playing-media)
- **WCAG level.** SC 2.2.2 Pause, Stop, Hide is Level A. — [TestParty](https://testparty.ai/blog/accessible-carousels-sliders-auto-playing-media)
- **NN/g findings (2013, reported second-hand).**
  - Users missed content in auto-rotating carousels, including when the target was the first slide.
  - Banner blindness: users "never look at anything that looks like an advertisement".
  - Not enough time to read, especially for second-language readers.
  - Motor-impaired users struggle to click before a slide moves.
  - On mobile, users have scrolled past before the slide changes.
  - Recommended alternative: several rows of content.
  - Sources: [Texas A&M web](https://web.tamu.edu/?p=1845); [Yale usability](https://usability.yale.edu/usability-best-practices/hero-imagescarousels); [UNC](https://www.med.unc.edu/webguide/accessibility/carousels)
- **Counterpoint.** A TecEd study found users noticed a homepage carousel as a signal of importance. — [TecEd](https://teced.com/?p=3642)

### Inferences
**If the carousel stays, meet these requirements:**
- a visible Pause/Play button as the first control;
- no autoplay under `prefers-reduced-motion`;
- pause on hover and on focus within;
- prev/next buttons and dots, keyboard reachable;
- each slide `role="group"` with `aria-roledescription="slide"` and a label "3 of 8";
- `aria-live="off"` while rotating and `"polite"` when paused;
- at least about 7 s per card;
- no autoplay on mobile; use a swipeable `scroll-snap` row instead.

**A better pattern.** A static 3-up grid of star cards on desktop that becomes a horizontal snap-scroll row on mobile, with "See all stars →". Show the defaulter list as a separate, quieter list on its own page, not in the moving carousel (see section 6).

**Stats strip.** 3–4 plain figures with labels, for example "Societies served 19 · Lights retrofitted 42,000 · kWh saved this year …". Use tabular numbers, no icon bubbles (matching existing portal rules), and give each figure a source and an as-of date.

### Gaps
- NN/g, W3C and Baymard primary pages could not be fetched. Baymard-specific guidance was not found.
- No 2023–2026 quantitative study on carousel click-through was reached.

## 6. Wording, leaderboards and legal exposure

### Takeaway
Use neutral, factual, specific labels ("Payments overdue 60+ days") instead of loaded ones ("Defaulter", "Worst rated"). Avoid full rank-ordered bottom lists. "Defaulter" has a regulated meaning in Indian banking and creates defamation and data-protection exposure.

### Cited Findings
- **Neutral wording.** Avoid blame and assumed intent, prefer neutral alternatives to evocative words ("Terminate" → "Cancel"), and avoid exclamation marks. — [uxdesign.cc](https://uxdesign.cc/how-to-write-for-interactions-3ff03080fb18); [Pega writing guidelines](https://design.pega.com/design/ux-writing-guidelines)
- **Leaderboard research is mixed.**
  - Na & Han (2023, *Internet Research*) found high-ranked participants became complacent while low-ranked participants kept motivated, though neither motivation was intrinsic. — [Emerald](https://www.emerald.com/insight/content/doi/10.1108/intr-12-2021-0897/full/html)
  - Practitioner Yu-kai Chou argues full rankings demoralise the bottom 90% and recommends micro, percentile or relative leaderboards. This is opinion, not research. — [Yu-kai Chou](https://yukaichou.com/behavioral-design/points-badges-leaderboards-part-3-of-3/)
- **"Defaulter" is a regulated term in Indian banking.** RBI issued the Master Direction on Treatment of Wilful Defaulters and Large Defaulters (30-07-2024, RBI/DoR/2024-25/122), effective 28-10-2024. It sets due process for classifying and reporting defaulters. — [RBI Master Direction](https://rbi.org.in/Scripts/BS_ViewMasDirections.aspx?id=12713); [AZB](https://www.azbpartners.com/bank/rbis-updated-framework-for-wilful-defaulters-key-provisions-and-impact/)
- **Defamation.** India has both civil and criminal defamation. Civil defamation broadly follows strict liability. Opinion is protected only if it is not based on false facts. — [Kelly Warner](https://kellywarnerlaw.com/india-defamation-laws); [CPJ](https://cpj.org/2014/10/big-businesses-attempt-to-muzzle-critical-reportin/)
  - The search summary noted that the IPC was replaced by the Bharatiya Nyaya Sanhita in 2024, and that the statutory truth exception needs truth plus public good. This was not verified in a primary source.
- **DPDP Act and RWAs.** The DPDP Act was enacted in 2023 and its Rules notified on 13-11-2025. Secondary guides treat RWAs and committees as data fiduciaries for resident data. — [KSK](https://ksandk.com/data-protection-and-data-privacy/dpdp-act-rwa-compliance-guide/); [ADDA](https://blog.ind.adda.io/2026/02/dpdp-act-for-housing-societies-guide-for-rwas/)

### Inferences
**Labels.**
- Rename the lists. "Star" can stay, or use "Prompt payers" / "Top partner societies".
- For the negative list, use a factual status like "Payment overdue" or "Account on hold — dues outstanding". Show the fact (days overdue as a band, not exact rupees) instead of a rank.
- Never show a "worst rated" ordinal.
- A society's *name* is not personal data. But never show office-bearer names or individuals' conduct on a public or cross-society surface.

**Audience.** Decide who sees the showcase, which is the most consequential product decision. The portal home page is seen by other societies' committees, so a negative list there is published about a third party to a third party. Safer options:
- show only stars across societies;
- show each society its own standing privately;
- keep the defaulter list internal (back office only), or behind the four-eyes approval plus right of reply.

Get legal review before publishing any negative list. "Defaulter" in particular echoes the RBI term and implies a formal classification FirsThing does not perform.

**Descriptive text.** Factual and templated from data ("Paid all 12 invoices on or before the due date"). The back office toggles it per entry (as requested) and must never free-type allegations.

### Gaps
- No source specific to publishing a customer defaulter list on a B2B portal in India was found.
- The DPDP Rules text and the BNS defamation provisions were not read in primary form.
- Trust & Safety Professional Association material was not reached.
