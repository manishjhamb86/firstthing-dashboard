# -*- coding: utf-8 -*-
# SUR-01 society portal — prototype 4 of 6.
# Deliberately does NOT reuse _base.make(): the ops console sidebar is the wrong shell for a
# surface read by a committee member on a phone. Portal chrome is a top bar + horizontal nav,
# and the whole surface runs .roomy (05a-theme-system.md 3.6).
from _base import I, CK, CU, SK, states, Deck

# ---------------------------------------------------------------- helpers
def chip(t, txt, sp='dot'):
    return '<span class="chip ' + t + '"><span class="' + sp + '"></span>' + txt + '</span>'

def ban(t, ic, html):
    return '<div class="ban ' + t + '">' + I[ic] + '<div>' + html + '</div></div>'

def panel(title, inner, right=''):
    hd = ''
    if title:
        hd = ('<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;'
              'flex-wrap:wrap"><h3>' + title + '</h3>' + right + '</div>')
    return '<div class="panel">' + hd + inner + '</div>'

def tbl(heads, rows, foot=None, align=None, wrap=None, wrapn=None):
    align = align or []
    wrap = wrap or []
    wrapn = wrapn or []
    def cc(i):
        c = []
        if i in align: c.append('ta-r')
        if i in wrap: c.append('wrap')
        if i in wrapn: c.append('wrapn')
        return ' class="' + ' '.join(c) + '"' if c else ''
    th = ''.join('<th' + cc(i) + '>' + h + '</th>' for i, h in enumerate(heads))
    body = []
    for r in rows:
        cls = ''
        if isinstance(r, tuple): r, cls = r
        tds = ''.join('<td' + cc(i) + '>' + c + '</td>' for i, c in enumerate(r))
        body.append('<tr' + (' class="' + cls + '"' if cls else '') + '>' + tds + '</tr>')
    ft = ''
    if foot:
        ft = ('<tfoot><tr class="tfoot">' + ''.join(
            '<td' + (' class="ta-r"' if i in align else '') + '>' + c + '</td>'
            for i, c in enumerate(foot)) + '</tr></tfoot>')
    return ('<div class="tw"><table class="t"><thead><tr>' + th + '</tr></thead><tbody>'
            + ''.join(body) + '</tbody>' + ft + '</table></div>')

def cols(a, b, ratio='1.55fr 1fr'):
    # each side must be ONE grid child, or auto-placement interleaves the two columns
    w = lambda x: '<div style="display:flex;flex-direction:column;gap:13px;min-width:0">' + x + '</div>'
    return ('<div class="cols2" style="display:grid;grid-template-columns:' + ratio +
            ';gap:13px;align-items:start">' + w(a) + w(b) + '</div>')

def rows2(pairs):
    out = []
    for k, v in pairs:
        out.append('<div style="display:flex;justify-content:space-between;gap:14px;padding:7px 0;'
                   'border-bottom:1px solid var(--border-subtle)">'
                   '<span class="mut" style="font-size:13px">' + k + '</span>'
                   '<span style="font-size:13px;text-align:right">' + v + '</span></div>')
    return '<div>' + ''.join(out) + '</div>'

def big(label, value, note='', tone=''):
    st = ' style="color:var(--signal-ink);background:var(--signal)"' if tone == 'sig' else ''
    return ('<div class="bigfig"' + st + '><span class="lbl">' + label + '</span>'
            '<span class="bv mono">' + value + '</span>'
            '<span class="ts">' + note + '</span></div>')

def bars(items, maxv):
    cells = []
    for lab, v, tone in items:
        h = int(round(v * 100.0 / maxv))
        cells.append('<div class="bcell"><div class="btrack"><div class="bfill ' + tone +
                     '" style="height:' + str(h) + '%"></div></div>'
                     '<span class="blab">' + lab + '</span></div>')
    return '<div class="bchart">' + ''.join(cells) + '</div>'

def thumbs(n, cap):
    t = ''.join('<div class="pthumb">' + I['cam'] + '</div>' for _ in range(n))
    return ('<div class="pthumbs">' + t + '</div><span class="ts">' + cap + '</span>')

# ---------------------------------------------------------------- portal shell
NAV_PROSPECT = []
NAV_PRE      = ['Your offer', 'Documents', 'Contact us']
NAV_INSTALL  = ['Home', 'Installation', 'Documents', 'Contact us']
NAV_LIVE     = ['Home', 'Savings', 'Invoices', 'Documents', 'Your contract']

def pshell(nav, active, title, sub, actions, body, who='R. Menon · Office-bearer', badge=''):
    items = ''
    if nav:
        items = '<nav class="pnav">' + ''.join(
            '<a class="pn' + (' on' if n == active else '') + '">' + n + '</a>' for n in nav) + '</nav>'
    initials = ''.join(p[0] for p in who.split('·')[0].split() if p)[:2].upper()
    acct = ('<div class="pacct"><span class="pav">' + initials + '</span>'
            '<span class="pwho">' + who + '</span></div>')
    bg = ('<span class="pbadge">' + badge + '</span>') if badge else ''
    head = ('<div class="phd"><div style="min-width:0"><h2 class="pttl">' + title + '</h2>'
            '<p class="psub">' + sub + '</p></div>'
            '<div class="pacts">' + actions + '</div></div>')
    return ('<div class="portal roomy"><div class="pt"><div class="pbrand"><span class="mk">F</span>'
            'FirsThing</div>' + bg + acct + '</div>' + items +
            '<div class="pmain"><div class="pinner">' + head + body + '</div></div></div>')

def phoneframe(title, body):
    return ('<div class="pph"><div class="pphtop"><span class="mono">09:41</span>' + I['wifi'] +
            '</div><div class="pphbar">' + title + '</div>'
            '<div class="pphbody">' + body + '</div></div>')

PORTAL_CSS = '''
/* --- society portal shell -------------------------------------------------
   Chrome tokens throughout, so Light / Slate / Dark all resolve correctly and
   the content column never changes between Light and Slate. */
.portal{border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden;
        background:var(--ground);box-shadow:var(--e1)}
.pt{background:var(--chrome);border-bottom:1px solid var(--chrome-border);
    padding:13px 18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.pbrand{display:flex;align-items:center;gap:9px;font-weight:660;font-size:15.5px;
        letter-spacing:-.012em;color:var(--chrome-text)}
.pbrand .mk{width:23px;height:23px;border-radius:6px;background:var(--chrome-accent);
            color:var(--chrome-accent-ink);display:grid;place-items:center;font-size:12.5px;font-weight:700}
.pbadge{font-size:11px;padding:3px 9px;border-radius:var(--r-pill);border:1px solid var(--chrome-border);
        color:var(--chrome-muted)}
.pacct{margin-left:auto;display:flex;align-items:center;gap:9px;min-width:0}
.pwho{font-size:13px;color:var(--chrome-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pav{width:29px;height:29px;flex:none;border-radius:50%;background:var(--chrome-active);
     color:var(--chrome-accent);display:grid;place-items:center;font-size:11.5px;font-weight:680}
.pnav{display:flex;gap:3px;padding:0 12px;background:var(--chrome);
      border-bottom:1px solid var(--chrome-border);overflow-x:auto}
.pn{padding:10px 13px;font-size:13.5px;color:var(--chrome-muted);white-space:nowrap;cursor:pointer;
    border-bottom:2px solid transparent}
.pn:hover{color:var(--chrome-text)}
.pn.on{color:var(--chrome-accent);border-bottom-color:var(--chrome-accent);font-weight:620}
.pmain{padding:22px 18px 28px}
.pinner{max-width:940px;margin:0 auto;display:flex;flex-direction:column;gap:14px}
.phd{display:flex;justify-content:space-between;align-items:flex-end;gap:14px;flex-wrap:wrap}
.pttl{font-size:22px;font-weight:640;letter-spacing:-.018em}
.psub{font-size:13.5px;color:var(--text-muted);margin-top:3px}
.pacts{display:flex;gap:8px;align-items:center;flex-wrap:wrap}

/* big figures — the portal leads with a number, not a table */
.bigrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.bigfig{border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);
        padding:15px 16px;display:flex;flex-direction:column;gap:3px;min-width:0}
.bigfig .bv{font-size:27px;font-weight:650;letter-spacing:-.022em;line-height:1.08}
.hero{border:1px solid var(--accent-line);border-radius:var(--r-md);background:var(--accent-subtle);
      padding:20px 20px;display:flex;flex-direction:column;gap:5px}
.hero .hv{font-size:38px;font-weight:660;letter-spacing:-.028em;line-height:1.02;color:var(--accent)}
.hero .hk{display:inline-flex;align-self:flex-start;gap:7px;align-items:center;margin-top:5px;
          background:var(--signal);color:var(--signal-ink);border-radius:var(--r-pill);
          padding:5px 13px;font-size:12.5px;font-weight:620}
.hero .hk svg{width:14px;height:14px;flex:none}

/* 12-month bar chart */
.bchart{display:flex;gap:7px;align-items:flex-end;height:158px}
.bcell{flex:1;display:flex;flex-direction:column;gap:7px;align-items:center;height:100%;min-width:0}
.btrack{flex:1;width:100%;display:flex;align-items:flex-end;background:var(--neu-bg);border-radius:3px}
.bfill{width:100%;border-radius:3px;background:var(--accent)}
.bfill.mut{background:var(--accent);opacity:.42}
.blab{font-size:10px;color:var(--text-subtle);white-space:nowrap}

/* document / area rows */
.drow{border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);
      padding:14px 15px;display:flex;flex-direction:column;gap:8px}
.drow.bad{border-color:var(--bad-line);background:var(--bad-bg);--tone-fg:var(--bad-fg)}
.dtop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.dz{border:1.5px dashed var(--field-border);border-radius:var(--r-md);background:var(--surface-sunken);
    padding:16px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center}
.dz svg{width:21px;height:21px;color:var(--text-subtle)}
.pthumbs{display:flex;gap:7px;flex-wrap:wrap}
.pthumb{width:52px;height:52px;border-radius:var(--r-sm);border:1px solid var(--border);
        background:var(--surface-sunken);display:grid;place-items:center;color:var(--text-subtle)}
.pthumb svg{width:18px;height:18px}

/* countdown */
.cd{display:flex;align-items:baseline;gap:9px}
.cd .cdv{font-size:31px;font-weight:660;letter-spacing:-.022em;font-family:var(--mono)}

/* phone companion */
.pph{width:340px;flex:none;border:1px solid var(--border);border-radius:24px;overflow:hidden;
     background:var(--ground);box-shadow:var(--e2)}
.pphtop{background:var(--chrome);color:var(--chrome-muted);padding:7px 16px 3px;
        display:flex;justify-content:space-between;align-items:center;font-size:11px}
.pphtop svg{width:14px;height:14px}
.pphbar{background:var(--chrome);color:var(--chrome-text);border-bottom:1px solid var(--chrome-border);
        padding:7px 16px 11px;font-size:14.5px;font-weight:640}
.pphbody{padding:13px;display:flex;flex-direction:column;gap:10px}
.side2{display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap}
.side2>.grow{flex:1;min-width:280px;display:flex;flex-direction:column;gap:13px}

/* modal mock */
.modal{border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface-raised);
       box-shadow:var(--e3);padding:16px;display:flex;flex-direction:column;gap:10px;max-width:430px}

table.t td.wrapn{white-space:normal;min-width:118px}
table.t th.wrapn{white-space:normal}
@media (max-width:700px){.pinner{max-width:100%}.pph{width:100%}}
'''

D = Deck('Prototype 4 of 6 · SUR-01 society portal',
  'Society portal',
  'Seven screens — the only surface an RWA ever sees. FLOW-16 states the success condition in five '
  'words: the committee believes the number. Everything here runs .roomy, leads with a figure rather '
  'than a table, and never shows an internal identifier — no circuit IDs, no status enums, no screen '
  'numbers. The deck follows one society, Prestige Ferns in Whitefield, at two points in its life: '
  'screens 1–4 are its first three months in 2026, from a demo report it receives as a prospect to '
  'the nightly installation approvals; screens 5–7 are the same society eighteen months later, in '
  'February 2028, in the steady monthly state it will stay in for the rest of a seven-year term.',
  css=PORTAL_CSS)

# ================================================================ SCR-031
demo = tbl(['Where', 'Lights we metered', 'Before', 'After', 'Reduction'],
 [['<span class="nm">Corridor &amp; staircase</span>', '<span class="mono">58</span>',
   '<span class="mono">25.0</span>', '<span class="mono">7.9</span>',
   '<span class="mono"><b>68.4%</b></span>'],
  ['<span class="nm">Basement car park</span>', '<span class="mono">62</span>',
   '<span class="mono">34.0</span>', '<span class="mono">9.8</span>',
   '<span class="mono"><b>71.2%</b></span>'],
  ['<span class="nm">Lift lobby</span>', '<span class="mono">54</span>',
   '<span class="mono">12.5</span>', '<span class="mono">4.0</span>',
   '<span class="mono"><b>68.0%</b></span>'],
  ['<span class="nm">Podium &amp; landscape</span>', '<span class="mono">51</span>',
   '<span class="mono">8.6</span>', '<span class="mono">3.2</span>',
   '<span class="mono"><b>62.8%</b></span>']],
 foot=['<b>Across all four</b>', '<span class="mono">225</span>', '<span class="mono">80.1</span>',
       '<span class="mono">24.9</span>', '<span class="mono"><b>69.1%</b></span>'],
 align=[1, 2, 3, 4])

b = ''.join([
 '<div class="hero"><span class="lbl">What we measured in your building</span>'
 '<span class="hv">69.1% less electricity</span>'
 '<p style="font-size:14px;color:var(--text-muted);max-width:62ch">Across the four kinds of light '
 'you have, over five days before we changed anything and five days after. Not a catalogue figure '
 '— your corridors, your car park, your meters.</p>'
 '<span class="hk">' + I['tick'] + 'Measured 20–24 April and 4–8 May 2026</span></div>',

 panel('Before and after, one meter per kind of light',
   demo +
   '<span class="ts">Kilowatt-hours per day. We metered one circuit for each kind of light rather '
   'than one for the whole society, because a car park that runs 24 hours and a staircase that runs '
   'dusk to dawn do not behave the same way and cannot stand in for each other.</span>'),

 cols(panel('What actually changed',
     tbl(['Where', 'Was', 'Now'],
      [['Corridor &amp; staircase', '36 W tube fittings', '12 W LED battens'],
       ['Basement car park', '2 × 36 W tube fittings', '18 W LED battens'],
       ['Lift lobby', '18 W CFL downlights', '7 W LED downlights'],
       ['Podium &amp; landscape', '70 W metal halide', '24 W LED floods']], wrap=[1, 2]) +
     '<span class="ts">The physical reason for the number. Nothing about how you use the building '
     'changed during the ten days — the same lights, on the same hours, in the same places.</span>'),
  ''.join([
   panel('What this would mean over a year',
     rows2([('Electricity you would not use', '<b class="mono">2,67,075 units</b>'),
            ('At your current tariff of ₹9.20', '<b class="mono">₹24,57,090</b>'),
            ('Roughly, to you each month', '<b class="mono">₹1,18,000</b>'),
            ('Carbon avoided', '<span class="mono">213 t / year</span>')]) +
     ban('info', 'i', 'This is an <b>estimate</b>, and it assumes your 1,200 common-area lights and '
       'your current burn hours. The monthly figure assumes the usual 58 / 42 split of what is '
       'saved — <b>the binding numbers come with the offer</b>, not with this report.')),
   panel('What happens next',
     '<p style="font-size:13.5px;color:var(--text-muted)">If the committee wants to go ahead, we '
     'prepare a formal offer with a guaranteed saving for each kind of light. There is nothing to '
     'pay at any stage — we buy and fit the lights, and we are paid only out of what you save.</p>'
     '<div style="display:flex;gap:8px;margin-top:11px;flex-wrap:wrap">'
     '<button class="btn btn-pri">We are interested</button>'
     '<button class="btn btn-sec">Ask a question</button></div>'
     '<span class="ts" style="display:block;margin-top:9px">Or call Rakesh Nair on 98xxx xxxxx.</span>')]),
  '1.35fr 1fr'),
])

D.add('SCR-031', 'Demo report — what a prospect sees',
 'The only portal screen a non-customer reaches, and the evidence the entire sale rests on. It has '
 'to stand completely alone: no navigation into anything they cannot access, no assumed familiarity, '
 'no jargon. The tension is real — overstate it and the first real month disappoints, understate it '
 'and there is no deal — so it resolves the tension by <b>showing the working instead of making a '
 'claim</b>. Every figure on the screen came out of their own building.',
 pshell(NAV_PROSPECT, '', 'Your demo results',
   'Prestige Ferns, Whitefield · measured 20–24 April and 4–8 May 2026',
   '<button class="btn btn-sec">Download PDF</button>'
   '<button class="btn btn-pri">We are interested</button>',
   b, who='K. Ramamurthy · Secretary', badge='Demo report'),
 states(
  ('Loading', '<span class="ts">Skeleton — figure block first, so the shape of the answer appears '
    'before the answer does.</span>' + SK),
  ('Empty — first use', ban('info', 'cal', 'Measurement finishes on <b>14 May</b>. We will email '
    'this to you the same day.')),
  ('Empty — filtered', '<span class="ts">Not applicable — one report, no filters.</span>'),
  ('Partial / stale', ban('warn', 'i', 'Three of your four areas are measured. The '
    '<b>podium and landscape</b> lights are still running — their meter restarted twice for a loose '
    'connection we have since fixed. We will add them on 14 May.')),
  ('Error — network', '<span class="ts">Retry, and a phone number — a prospect will not persist '
    'with a broken page.</span>' + chip('bad', 'Could not load') +
    '<button class="btn btn-sec sm" style="align-self:flex-start">Try again</button>'),
  ('Error — permission', '<span class="ts">A link that expired gets a plain page and a person to '
    'call — deliberately <b>not</b> the internal-looking error screen a logged-in customer sees.</span>' +
    ban('neu', 'i', 'This link has expired. Call Rakesh Nair on 98xxx xxxxx and he will send a new one.')),
  ('Success', chip('ok', 'Complete — all four areas measured', 'tri'))))

# ================================================================ SCR-051
bench = tbl(['Where', 'Lights', 'Saving we guarantee', 'Allowed to vary by', 'Roughly, per month'],
 [['<span class="nm">Corridor &amp; staircase</span>', '<span class="mono">620</span>',
   '<span class="mono"><b>66.0%</b></span>', '<span class="mono">±10%</span>',
   '<span class="mono">₹1,05,200</span>'],
  ['<span class="nm">Basement car park</span>', '<span class="mono">340</span>',
   '<span class="mono"><b>68.0%</b></span>', '<span class="mono">±10%</span>',
   '<span class="mono">₹65,700</span>'],
  ['<span class="nm">Lift lobby</span>', '<span class="mono">180</span>',
   '<span class="mono"><b>68.0%</b></span>', '<span class="mono">±12%</span>',
   '<span class="mono">₹21,900</span>'],
  ['<span class="nm">Podium &amp; landscape</span>', '<span class="mono">60</span>',
   '<span class="mono"><b>60.0%</b></span>', '<span class="mono">±15%</span>',
   '<span class="mono">₹4,800</span>']],
 foot=['<b>All four together</b>', '<span class="mono">1,200</span>', '<span class="mono">66.7%</span>',
       '<span class="ts">each area is judged on its own</span>', '<span class="mono">₹1,97,600</span>'],
 align=[1, 2, 3, 4])

b = ''.join([
 '<div class="bigrow">' +
 big('You pay nothing upfront', '₹0', 'We buy, fit and maintain the lights for the whole seven years') +
 big('You keep', '58%', 'of everything saved, every month') +
 big('We take', '42%', 'only out of what is actually saved') +
 '</div>',

 panel('What we are guaranteeing, area by area', bench +
   '<span class="ts">Each kind of light carries its own guarantee, and each is judged on its own '
   'every month. The 66.7% at the bottom is just those four added together — it is shown for '
   'interest and is not a figure in the agreement.</span>',
   chip('info', 'Valid until 31 August 2026')),

 cols(''.join([
   panel('What a guaranteed saving means',
     '<p style="font-size:13.5px;color:var(--text-muted)">We fit a meter on one circuit of each kind '
     'of light. Every month we read it, work out what those lights would have used before, and the '
     'difference is the saving. You keep 58% of it. We are paid 42%. If we save you nothing, you '
     'pay us nothing.</p>'),
   panel('What happens if we miss it',
     ban('warn', 'warn', 'If an area comes in below its guaranteed saving — outside the range in the '
       'table — for <b>two months running</b>, we stop billing that area at the guaranteed figure and '
       'start billing it on what it actually saved. That is worse for us and better for you, and it '
       'is the honest way round.') +
     '<span class="ts">We are telling you this before you sign rather than letting you discover it '
     'in an invoice in month seven. It is the single most common thing societies later argue '
     'about.</span>'),
   panel('The rest of it', rows2([
     ('Term', '7 years from the day the lights are signed off'),
     ('Maintenance', 'Included — we replace failed fittings for the whole term'),
     ('Who owns the lights', 'FirsThing, until the end of the term'),
     ('If the grid is out', 'Not counted against us, and not counted as saving either'),
     ('If you change the lighting', 'Tell us first, and we adjust the guarantee together'),
     ('Payment terms', '30 days from the invoice date')])),
  ]),
  ''.join([
   panel('What you would keep',
     big('Estimated, to you', '₹1,10,000 – ₹1,19,000', 'each month') +
     '<span class="ts" style="display:block;margin-top:9px">A range, not a promise, because your '
     'tariff moves. At today’s ₹9.20 a unit it works out at about <b>₹1,14,600</b> a month, or '
     '<b>₹13,75,400</b> a year.</span>'),
   panel('Your answer',
     '<div style="display:flex;flex-direction:column;gap:9px">'
     '<button class="btn btn-pri">Accept this offer</button>'
     '<button class="btn btn-sec">Ask a question first</button>'
     '<button class="btn btn-sec">Request a change</button>'
     '<button class="btn btn-sec">Decline</button></div>' +
     '<span class="ts" style="display:block;margin-top:10px">Accepting here tells us to prepare the '
     'agreement. <b>The signed agreement is what binds either of us</b> — this is not a signature.</span>'),
   panel('', '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' + I['doc'] +
     '<span style="font-size:13px">Offer PF-2026-08</span>'
     '<button class="btn btn-sec sm" style="margin-left:auto">Download</button></div>'),
  ]), '1.5fr 1fr'),
])

D.add('SCR-051', 'The offer, and the society’s answer',
 'The sharpest instance of CON-45 in the product: <b>only an office-bearer can accept or decline</b>, '
 'and when someone without that authority opens it the screen names the people who have it rather '
 'than greying a button out. The per-area guarantee table <i>is</i> the offer — since CON-11 the '
 'contract carries a benchmark per kind of light, not one society figure, and presenting it as a '
 'single headline percentage would misrepresent what they are signing. Stating the '
 'measured-billing consequence <i>before</i> signature is deliberate.',
 pshell(NAV_PRE, 'Your offer', 'Your offer from FirsThing',
   'Prestige Ferns, Whitefield · offer PF-2026-08 · valid until 31 August 2026',
   '<button class="btn btn-sec">Download</button>'
   '<button class="btn btn-pri">Accept this offer</button>',
   b, badge='Offer'),
 states(
  ('Loading', SK),
  ('Empty — first use', '<span class="ts">Not applicable — always arrives from an email or a call.</span>'),
  ('Open', chip('ok', 'Live · accept enabled for office-bearers', 'tri')),
  ('<b>No authority</b> — committee or manager viewing',
    ban('info', 'lock', '<b>Only an office-bearer can accept this.</b> R. Menon and S. Iyer can — '
      'forward it to them, or ask us a question first.') +
    '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri" disabled>Accept</button>'
    '<button class="btn btn-sec" disabled>Decline</button>'
    '<button class="btn btn-sec">Forward to R. Menon</button>'
    '<button class="btn btn-sec">Ask a question</button></div>' +
    '<span class="ts">Everything else on the page stays fully readable. Hiding the offer from a '
    'committee member would send them to WhatsApp to find out what was in it.</span>'),
  ('Expiring', ban('warn', 'cal', 'This offer runs out on <b>31 August</b> — six days from now. '
    'Tell us if you need longer; we would rather extend it than have it lapse.')),
  ('Expired', ban('neu', 'i', 'This offer ran out on 31 August. <b>Ask us to reissue it</b> — nothing '
    'is lost, the measurements still stand.')),
  ('Partial / stale — superseded', ban('info', 'i', 'A newer offer was sent on 3 September. '
    '<b>Open the current one</b> — this page is kept only so you can see what changed.')),
  ('Confirming', '<div class="modal"><h3>Accept this offer?</h3>'
    '<p style="font-size:13px;color:var(--text-muted)">You keep <b>58%</b> of what is saved. '
    'The term is <b>7 years</b>. If an area misses its guarantee two months running we bill that '
    'area on what it actually saved.</p>'
    '<p style="font-size:13px;color:var(--text-muted)">We will record that <b>R. Menon, '
    'office-bearer</b> accepted this on 25 August 2026 at 18:04.</p>'
    '<div style="display:flex;gap:8px"><button class="btn btn-pri">Yes, accept</button>'
    '<button class="btn btn-sec">Go back</button></div></div>'),
  ('Error — network', chip('bad', 'Nothing was recorded — try again') +
    '<span class="ts">The offer is untouched. An acceptance that half-succeeded would be the worst '
    'possible outcome on this screen.</span>'),
  ('Success', ban('ok', 'tick', '<b>Accepted.</b> We will send the agreement for signature within '
    'two working days, and Rakesh will call you tomorrow to arrange the survey.'))))

# ================================================================ SCR-041
def docrow(name, why, good, chipel, action, bad=False):
    return ('<div class="drow' + (' bad' if bad else '') + '">'
      '<div class="dtop"><div style="min-width:0"><b style="font-size:14.5px">' + name + '</b>'
      '<p style="font-size:13px;color:var(--text-muted);margin-top:3px">' + why + '</p></div>'
      + chipel + '</div>'
      '<span class="ts">' + good + '</span>' + action + '</div>')

DZ = ('<div class="dz">' + I['up'] + '<b style="font-size:13.5px">Drop a file here, or take a photo</b>'
      '<span class="ts">PDF, JPG or PNG · up to 10 MB</span></div>')

b = ''.join([
 ban('info', 'i', '<b>We need these three things before we can send your agreement.</b> Most '
   'societies have all of them to hand — it usually takes ten minutes.'),

 '<div class="bigrow">' +
 big('Received', '2 of 3', 'We still need your latest electricity bill') +
 big('Holding up', 'Your agreement', 'Everything else is ready to go') +
 '</div>',

 docrow('Society registration certificate',
   'Proof the society is registered, showing its registered name.',
   'What we need: the certificate showing the name exactly as it is registered.',
   chip('ok', 'Checked and accepted', 'tri'),
   '<span class="ts">Received 12 August · accepted 13 August</span>'),

 docrow('PAN card (in the society’s name)',
   'We need this to raise invoices you can claim against.',
   'What we need: the society’s own PAN, not a committee member’s.',
   chip('info', 'With us — being checked'),
   '<span class="ts">Received 12 August. We will come back to you within a working day.</span>'),

 docrow('Your latest electricity bill',
   'This sets the tariff we calculate your savings against, so it has to be current.',
   'What we need: a bill from the last three months, showing the meter number and the tariff slab.',
   chip('bad', 'Please send another'),
   ban('bad', 'x', '<b>The bill you sent is from 2024.</b> We need one from the last three months — '
     'the tariff has changed twice since then and an old bill would understate what you save.') + DZ,
   bad=True),

 panel('', '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' + I['doc'] +
   '<span style="font-size:13.5px">Would rather just email them? Send them to '
   '<b>documents@firsthing.earth</b> and we will do the rest.</span></div>'),
])

D.add('SCR-041', 'Sending us the paperwork',
 'One of the most common stall points in the whole product — FLOW-05’s own note, and what CON-23’s '
 'follow-up counter exists to chase. Two jobs: make the outstanding item unmissable, and put the '
 '<b>rejection reason on the row itself</b>, in the society’s language. A reason that only ever '
 'reached them by email is a reason they missed, and they re-send the same file. It also accepts '
 'that plenty of societies will never use this screen, which is exactly why the email address in '
 'the footer and the back-office entry path are not fallbacks but equal routes.',
 pshell(NAV_PRE, 'Documents', 'Documents we still need',
   'Prestige Ferns, Whitefield · 2 of 3 received',
   '<button class="btn btn-sec">Ask what’s needed</button>', b, badge='Before your agreement'),
 states(
  ('Loading', SK),
  ('Empty — first use', '<span class="ts">All three listed with what each is and why we need it, '
    'before anything has been sent.</span>' + chip('neu', 'Nothing sent yet')),
  ('Partial / stale', chip('info', '2 of 3 received') +
    '<span class="ts">Progress stated as a sentence, not a bar: “We still need your latest '
    'electricity bill.”</span>'),
  ('<b>Rejected</b>', ban('bad', 'x', 'The reason sits on the row, in their words — “The bill you '
    'sent is from 2024” — <b>not</b> “document validation failed”.')),
  ('Uploading', '<span class="ts">Per-file progress; the page stays usable.</span>' +
    '<div class="sk" style="width:60%"></div>'),
  ('Error — network', chip('bad', 'Upload failed') +
    '<span class="ts">The file is kept, so retry does not mean photographing it again.</span>'),
  ('Success', ban('ok', 'tick', '<b>That is everything.</b> We will send your agreement for '
    'signature within two working days.'))))

# ================================================================ SCR-062
areacard = lambda name, n, detail, ph: (
  '<div class="drow"><div class="dtop"><div><b style="font-size:14.5px">' + name + '</b>'
  '<p style="font-size:13px;color:var(--text-muted);margin-top:3px">' + detail + '</p></div>'
  '<span class="mono" style="font-size:21px;font-weight:650">' + n + '</span></div>' + ph + '</div>')

b = ''.join([
 '<div class="panel" style="display:flex;flex-direction:row;justify-content:space-between;'
 'gap:18px;align-items:center;flex-wrap:wrap">'
 '<div><span class="lbl">Fitted today</span>'
 '<div class="mono" style="font-size:36px;font-weight:660;letter-spacing:-.025em;line-height:1.05">168</div>'
 '<span class="ts">Wednesday 26 August · three teams, three towers</span></div>'
 '<div><span class="lbl">Please approve by</span>'
 '<div class="cd"><span class="cdv">06:00</span><span class="ts">tomorrow · 11 h 22 m left</span></div>'
 '<span class="ts">The crew cannot start Thursday until you do</span></div>'
 '<div style="display:flex;gap:8px;flex-wrap:wrap">'
 '<button class="btn btn-pri">Approve today’s work</button>'
 '<button class="btn btn-sec">Something is wrong</button></div></div>',

 '<div class="side2"><div class="grow">' +
 panel('What went in today, by area', ''.join([
   areacard('Tower A · corridors, floors 1–7', '74',
     'Replacing 36 W tubes with 12 W LED battens', thumbs(4, '4 photos from the team')),
   '<div style="height:11px"></div>',
   areacard('Tower B · corridors, floors 1–6', '62',
     'Replacing 36 W tubes with 12 W LED battens', thumbs(3, '3 photos from the team')),
   '<div style="height:11px"></div>',
   areacard('Basement · bay 2', '32',
     'Replacing twin 36 W tubes with 18 W LED battens', thumbs(3, '3 photos from the team')),
 ]) + '<span class="ts" style="display:block;margin-top:11px">Three teams worked three towers today. '
   'You are approving <b>the day</b>, not three separate lists — how the work was split up between '
   'technicians is our business, not something you should have to approve around.</span>') +
 '</div><div class="grow" style="max-width:330px">' +
 panel('How far along we are',
   rows2([('Today', '<b class="mono">168</b> fitted'),
          ('So far', '<b class="mono">612</b> of 1,200'),
          ('Day', '<span class="mono">4 of 9</span>'),
          ('Expected to finish', '<span class="mono">Mon 31 August</span>')]) +
   '<div style="margin-top:11px;height:9px;border-radius:var(--r-pill);background:var(--neu-bg);'
   'overflow:hidden"><div style="width:51%;height:100%;background:var(--accent)"></div></div>'
   '<span class="ts" style="display:block;margin-top:6px">51% fitted</span>') +
 panel('Why the deadline',
   '<p style="font-size:13px;color:var(--text-muted)">Approving confirms what we say we fitted '
   'matches what is actually on your walls, while it is still easy to check. Thursday’s work cannot '
   'start until Wednesday’s is approved — so if the committee is away, tell us and we will work '
   'around it.</p>') +
 panel('Ask instead',
   '<button class="btn btn-sec">Ask a question</button>'
   '<span class="ts" style="display:block;margin-top:8px"><b>Asking a question does not approve '
   'the day.</b> If the deadline matters to you, approve first and ask afterwards — approving is '
   'not final and we can correct anything.</span>') +
 '</div></div>',
])

phone_body = ''.join([
 '<div style="background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:var(--r-md);'
 'padding:11px"><b style="font-size:13.5px">Approve by 06:00 tomorrow</b>'
 '<p style="font-size:12.5px;color:var(--text-muted);margin-top:3px">The crew cannot start '
 'Thursday until you do.</p></div>',
 '<div style="text-align:center;padding:6px 0"><div class="mono" style="font-size:40px;'
 'font-weight:660;letter-spacing:-.03em">168</div>'
 '<span class="ts">fittings today · Wed 26 August</span></div>',
 rows2([('Tower A · corridors', '<b class="mono">74</b>'),
        ('Tower B · corridors', '<b class="mono">62</b>'),
        ('Basement · bay 2', '<b class="mono">32</b>')]),
 thumbs(4, '10 photos from today'),
 '<button class="btn btn-pri" style="width:100%">Approve today’s work</button>'
 '<button class="btn btn-sec" style="width:100%">Something is wrong</button>',
])

D.add('SCR-062', 'Approving the day’s installation',
 'CON-21 makes this the highest-stakes routine screen on the surface: not approved <b>at least three '
 'hours before the next day starts</b> and the next day cannot begin — skippable once per project '
 'only. A committee that does not check email in the evening halts a crew the following morning. '
 'Two design consequences follow. <b>Approving is one tap with no confirmation</b>, because it is '
 'the overwhelmingly common case with a hard deadline behind it. <b>Disputing demands a photo and a '
 'location</b>, because a dispute stops work and has to be actionable by someone standing in the '
 'building tomorrow. And three technicians’ three area-scoped batches are merged into one day '
 '(CON-44) — the partition is how the work got done, not something an RWA should approve around.',
 pshell(NAV_INSTALL, 'Installation', 'Today’s installation',
   'Prestige Ferns, Whitefield · Wednesday 26 August 2026 · day 4 of 9',
   '<button class="btn btn-sec">Ask a question</button>',
   b, who='S. Kulkarni · Committee', badge='Needs you tonight') +
 '<div style="display:flex;gap:16px;align-items:flex-start;margin-top:16px;flex-wrap:wrap">' +
 phoneframe('Today’s installation', phone_body) +
 '<div style="flex:1;min-width:260px"><span class="lbl">On a phone, in the evening</span>'
 '<p style="font-size:13.5px;color:var(--text-muted);margin-top:6px;max-width:52ch">This is how '
 'most approvals will actually arrive — from a push or an email, on a phone, after dinner. The '
 'deadline is the first thing on the screen and the approve button is reachable with a thumb '
 'without scrolling past the photos. The photos are there to be checked, but not required to be.</p></div></div>',
 states(
  ('Loading', SK),
  ('Empty — first use', '<span class="ts">The first night, the deadline is explained once, in full, '
    'before the counts.</span>' + ban('info', 'i', 'Each evening we will send you what was fitted '
    'that day. Approving it lets the crew start the next morning.')),
  ('Awaiting', chip('info', '11 h 22 m left') + '<span class="ts">The ordinary state: the day’s work '
    'and a countdown.</span>'),
  ('<b>Deadline near</b>', ban('warn', 'warn', '<b>Under three hours left.</b> If this is not '
    'approved by 06:00 the crew cannot start.') +
    '<span class="ts">Our own team is alerted at the same moment — a silent miss costs a crew day, '
    'so it must never depend on the society noticing alone.</span>'),
  ('<b>Missed</b>', ban('bad', 'x', '<b>Thursday’s work is on hold until this is approved.</b> '
    'Call Rakesh on 98xxx xxxxx and we will sort it out quickly.') +
    '<span class="ts">The once-per-project skip exists, and is named as our decision to make, not '
    'presented as a button the society can press.</span>'),
  ('Disputed', chip('warn', 'You told us the Tower B count looks wrong') +
    '<span class="ts">What was disputed, the photo they sent, and what happens next.</span>'),
  ('Error — network', chip('bad', 'Could not send your approval') +
    '<span class="ts">The deadline is unaffected and the screen says so.</span>'),
  ('Success', ban('ok', 'tick', '<b>Approved — thank you.</b> The crew starts at 09:00 tomorrow.'))))

# ================================================================ SCR-100
CHART = [('Mar', 108, 'mut'), ('Apr', 112, 'mut'), ('May', 115, 'mut'), ('Jun', 119, 'mut'),
         ('Jul', 117, 'mut'), ('Aug', 113, 'mut'), ('Sep', 110, 'mut'), ('Oct', 106, 'mut'),
         ('Nov', 109, 'mut'), ('Dec', 114, 'mut'), ('Jan', 116, 'mut'), ('Feb', 113, '')]

b = ''.join([
 '<div class="hero"><span class="lbl">Since you started, eighteen months ago</span>'
 '<span class="hv">₹20,14,340</span>'
 '<p style="font-size:14px;color:var(--text-muted)">3,77,500 units of electricity your building '
 'did not use — and about 301 tonnes of CO₂ it did not cause.</p>'
 '<span class="hk">' + I['tick'] + 'Every month verified against your own meters</span></div>',

 '<div class="bigrow">' +
 big('February 2028', '₹1,12,921', 'your share of what was saved') +
 big('Your bill', '₹96,487', 'due 15 March 2028') +
 big('Needs you', '1 thing', 'a question you asked is still open') +
 big('Contract runs to', 'Aug 2033', '5 years 6 months left') +
 '</div>',

 cols(''.join([
   panel('Month by month, what you kept',
     bars(CHART, 125) +
     '<span class="ts" style="display:block;margin-top:9px">Thousands of rupees. The last twelve '
     'months. February is the most recent finalised month.</span>',
     '<div style="display:flex;gap:6px"><button class="btn btn-sec sm">Show as a table</button>'
     '<button class="btn btn-sec sm">Download</button></div>'),
   panel('Your services',
     '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:11px">'
     '<div class="drow"><div class="dtop"><div><b style="font-size:14px">Common-area lighting</b>'
     '<p style="font-size:12.5px;color:var(--text-muted);margin-top:2px">1,200 lights · 4 areas</p></div>'
     + chip('ok', 'Running', 'tri') + '</div>'
     '<span class="ts">Live since September 2026</span></div>'
     '<div class="drow"><div class="dtop"><div><b style="font-size:14px">Water pumps</b>'
     '<p style="font-size:12.5px;color:var(--text-muted);margin-top:2px">Survey booked 4 March</p></div>'
     + chip('info', 'Being looked at') + '</div>'
     '<span class="ts">We will send you the numbers before you decide anything</span></div></div>'
     '<span class="ts" style="display:block;margin-top:10px">Everything we do for you sits on this '
     'one page — you should never need a second login or a second portal.</span>'),
  ]),
  ''.join([
   panel('Needs you',
     '<div class="drow"><div class="dtop"><div><b style="font-size:14px">Your question about the '
     'lift lobby</b><p style="font-size:12.5px;color:var(--text-muted);margin-top:2px">Asked 3 March '
     '· we replied 4 March</p></div>' + chip('warn', 'Open') + '</div>'
     '<button class="btn btn-sec sm" style="align-self:flex-start">Read the reply</button></div>'),
   panel('Your agreement', rows2([
     ('You keep', '<b>58%</b> of what is saved'),
     ('We take', '42%'),
     ('Guaranteed saving', '<span class="ts">four areas, four figures</span>'),
     ('Term ends', 'August 2033'),
     ('Maintenance', 'Included')]) +
     '<button class="btn btn-sec sm" style="margin-top:10px">Read your agreement</button>'),
   panel('If something is not right',
     '<p style="font-size:13.5px"><b>Rakesh Nair</b><br>'
     '<span class="mut">98xxx xxxxx · rakesh@firsthing.earth</span></p>'
     '<span class="ts" style="display:block;margin-top:8px">A person and a number, not a contact '
     'form. Most committees will call.</span>'),
  ]), '1.5fr 1fr'),
])

phone_body = ''.join([
 '<div style="background:var(--accent-subtle);border:1px solid var(--accent-line);'
 'border-radius:var(--r-md);padding:14px"><span class="lbl">Saved in 18 months</span>'
 '<div class="mono" style="font-size:28px;font-weight:660;letter-spacing:-.025em;'
 'color:var(--accent);line-height:1.1">₹20,14,340</div>'
 '<span class="ts">3,77,500 units</span></div>',
 rows2([('February 2028', '<b class="mono">₹1,12,921</b>'),
        ('Your bill', '<b class="mono">₹96,487</b>'),
        ('Due', '15 March 2028')]),
 '<button class="btn btn-pri" style="width:100%">See February’s report</button>',
 '<span class="ts">Opened from the monthly email, which already carried these figures — the portal '
 'is where you come to check, not where you find out.</span>',
])

D.add('SCR-100', 'The portal home',
 'Four questions, one screen: <i>are we saving what we were promised, what do we owe and by when, '
 'is anything wrong right now, and what did we actually agree to?</i> Maximal visibility is the '
 'stated principle (CAP-14) — cumulative savings, bill, open items and contract summary together, '
 'deliberately not a stripped-down current-month view, because a portal that shows only this month '
 'invites the phone call the portal exists to prevent. It is the one screen on this surface where '
 'the lime is spent, and it is spent once, on the number an AGM actually asks about.',
 pshell(NAV_LIVE, 'Home', 'Prestige Ferns', 'Whitefield, Bengaluru · with FirsThing since August 2026',
   '<button class="btn btn-sec">Ask us something</button>', b) +
 '<div style="display:flex;gap:16px;align-items:flex-start;margin-top:16px;flex-wrap:wrap">' +
 phoneframe('Prestige Ferns', phone_body) +
 '<div style="flex:1;min-width:260px"><span class="lbl">Mobile-first, unlike the rest of SUR-01</span>'
 '<p style="font-size:13.5px;color:var(--text-muted);margin-top:6px;max-width:52ch">A committee '
 'member reaches this from an email, on a phone, once a month. The cumulative figure and this '
 'month’s bill are above the fold on a 375px screen; everything else is a scroll away. This is the '
 'only SUR-01 screen designed narrow-first — the back office is designed for a laptop, and pretending '
 'otherwise would compromise both.</p></div></div>',
 states(
  ('Loading', SK),
  ('Empty — first use', ban('info', 'cal', '<b>Your lights went in on 20 August.</b> Your first '
    'savings report lands in early October — we need a full month of readings first.') +
    '<span class="ts">Month one is the only time the model needs explaining, so it is explained '
    'once, here, properly.</span>'),
  ('Empty — filtered', '<span class="ts">Not applicable on this screen.</span>'),
  ('Partial / stale', ban('info', 'i', 'We are checking last month’s readings for the basement car '
    'park before we finalise it. Nothing for you to do — we will email you when it is done.')),
  ('Nothing outstanding — the good state',
    ban('ok', 'tick', '<b>Nothing needs you right now.</b> Your February report is ready and your '
      'bill is not due until 15 March.') +
    '<span class="ts">Empty is the intended steady state on this panel and it says so plainly, '
    'rather than showing a bare dash.</span>'),
  ('Error — network', chip('bad', 'Could not load') +
    '<button class="btn btn-sec sm" style="align-self:flex-start">Try again</button>'),
  ('Error — permission', '<span class="ts">A login not linked to a society gets the shared '
    'access-denied screen (SCR-221), not a broken home page.</span>'),
  ('Success', chip('ok', 'The four answers, above the fold', 'tri'))))

# ================================================================ SCR-261
area = tbl(['Where', 'Lights', 'We guaranteed', 'It actually saved', 'How we billed it',
            'You kept', 'Our fee'],
 [['<span class="nm">Corridor &amp; staircase</span>', '<span class="mono">620</span>',
   '<span class="mono">66.0%</span>', '<span class="mono">67.1%</span>',
   'At the guaranteed rate', '<span class="mono"><b>₹61,044</b></span>', '<span class="mono">₹44,204</span>'],
  ['<span class="nm">Basement car park</span>', '<span class="mono">340</span>',
   '<span class="mono">68.0%</span>', '<span class="mono">69.4%</span>',
   'At the guaranteed rate', '<span class="mono"><b>₹38,099</b></span>', '<span class="mono">₹27,589</span>'],
  (['<span class="nm">Lift lobby</span>', '<span class="mono">180</span>',
   '<span class="mono">68.0%</span>', '<span class="mono" style="color:var(--warn-fg)"><b>58.9%</b></span>',
   '<b>On what it actually saved</b>', '<span class="mono"><b>₹11,003</b></span>',
   '<span class="mono">₹7,967</span>'], 'risk r-warn'),
  ['<span class="nm">Podium &amp; landscape</span>', '<span class="mono">60</span>',
   '<span class="mono">60.0%</span>', '<span class="mono">61.5%</span>',
   'At the guaranteed rate', '<span class="mono"><b>₹2,775</b></span>', '<span class="mono">₹4,784</span>'.replace('4,784', '2,009')]],
 foot=['<b>February 2028</b>', '<span class="mono">1,200</span>', '', '<span class="mono">65.7%</span>',
       '', '<span class="mono"><b>₹1,12,921</b></span>', '<span class="mono">₹81,769</span>'],
 align=[1, 2, 3, 5, 6], wrapn=[4])

readings = tbl(['Day', 'Lift lobby used', 'It would have used', 'Saved', 'Within range?'],
 [['1 Feb', '<span class="mono">41.2</span>', '<span class="mono">100.4</span>',
   '<span class="mono">59.0%</span>', chip('warn', 'below', 'dot')],
  ['2 Feb', '<span class="mono">40.8</span>', '<span class="mono">100.4</span>',
   '<span class="mono">59.4%</span>', chip('warn', 'below', 'dot')],
  ['3 Feb', '<span class="mono">39.6</span>', '<span class="mono">100.4</span>',
   '<span class="mono">60.6%</span>', chip('warn', 'below', 'dot')],
  ['4 Feb', '<span class="mono">44.1</span>', '<span class="mono">100.4</span>',
   '<span class="mono">56.1%</span>', chip('warn', 'below', 'dot')],
  ['<span class="ts">…</span>', '<span class="ts">24 more days</span>', '', '', '']],
 align=[1, 2, 3])

b = ''.join([
 '<div class="bigrow">' +
 big('What you saved in February', '₹1,12,921', '21,162 units of electricity') +
 big('What you paid us', '₹81,769', 'plus GST — invoiced at ₹96,487') +
 '</div>',

 ban('warn', 'i', '<b>Three of your four areas were billed at the guaranteed rate this month. The '
   'lift lobby was not.</b> Its lights saved 58.9% against a guarantee of 68%, and that is the second '
   'month running it has come in below the agreed range — so we billed it on what it actually saved '
   'rather than on the guarantee. Our fee for that area is <b>₹1,229 lower</b> than it would '
   'otherwise have been. That is why this month’s total is different.'),

 panel('Area by area', area +
   '<span class="ts">Each area is measured and judged on its own — a good month in the car park '
   'does not cover a poor one in the lobby, in either direction. The 65.7% is just those four added '
   'together; it is not a figure in your agreement.</span>',
   chip('ok', 'Final', 'tri')),

 panel('Show me the readings',
     ban('info', 'i', 'The lift lobby, day by day. This is the actual meter data your bill was '
       'calculated from — every other area is here too.') + readings +
     '<span class="ts" style="display:block;margin-top:9px">Measured against the guarantee agreed '
     'on <b>1 September 2026</b> and unchanged since. If we ever change a guarantee, this line names '
     'which version your bill used and when it changed.</span>',
     '<button class="btn btn-sec sm">Show every area</button>'),

 cols(panel('How we worked this out',
     '<p style="font-size:13.5px;color:var(--text-muted)">We meter one circuit of each kind of light '
     'and read it every day. For each kind, we work out what those lights would have used before we '
     'changed them, subtract what they actually used, and scale that across the rest of the lights '
     'of the same kind. You keep 58% of the value of the difference; we are paid 42%. Grid outages '
     'and anything you change yourselves are left out of both sides.</p>'),
  ''.join([
   panel('This month’s paperwork',
     '<div style="display:flex;flex-direction:column;gap:9px">'
     '<button class="btn btn-sec">Download this report</button>'
     '<button class="btn btn-sec">See the invoice</button>'
     '<button class="btn btn-sec">Ask a question</button>'
     '<button class="btn btn-sec">This doesn’t look right</button></div>'),
   panel('Where it went', rows2([
     ('Corridor &amp; staircase', '<span class="mono">₹61,044</span>'),
     ('Basement car park', '<span class="mono">₹38,099</span>'),
     ('Lift lobby', '<span class="mono">₹11,003</span>'),
     ('Podium &amp; landscape', '<span class="mono">₹2,775</span>'),
     ('<b>You kept</b>', '<b class="mono">₹1,12,921</b>')])),
  ]), '1.6fr 1fr'),
])

D.add('SCR-261', 'The monthly savings report',
 'JTBD-06 in one screen: convince a committee the number is real. <b>This screen is why INV-02 '
 'exists</b> — a number they cannot audit is a number they will dispute, so every figure traces to '
 'the readings and the guarantee version that produced it, in language that works for someone who '
 'has never seen a kWh export. The mixed-basis month is the hard case, exactly as it is for its ops '
 'counterpart SCR-091: when one area flips to measured billing and three do not, the total moves for '
 'a reason no single number explains, so the per-area table and its plain-language banner are the '
 'explanation, not supporting detail. Their share leads; our fee is stated plainly on the same '
 'screen, because hiding it would be the fastest way to lose the trust the screen exists to build.',
 pshell(NAV_LIVE, 'Savings', 'February 2028',
   'Prestige Ferns, Whitefield · finalised 6 March 2028',
   '<button class="btn btn-sec">Download</button>'
   '<button class="btn btn-sec">This doesn’t look right</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use', '<span class="ts">The first report explains the model above the figures, '
    'once.</span>' + ban('info', 'i', 'This is your first month. Here is how we work out what you saved.')),
  ('Empty — filtered', '<span class="ts">“No reports between June and August 2027.” Names the range '
    'it filtered on.</span>'),
  ('Partial / stale', ban('info', 'i', '<b>Not final yet.</b> We are checking the basement car '
    'park’s readings for the 14th and 15th. Nothing for you to do.')),
  ('<b>Disputing</b>', '<div class="modal"><h3>Tell us what looks wrong</h3>'
    '<p style="font-size:13px;color:var(--text-muted)">We will look at it and come back to you '
    'within two working days.</p>' +
    ban('warn', 'warn', '<b>Raising this does not pause the payment due date.</b> If you need more '
      'time to pay while we look into it, ask us and we can extend it.') +
    '<div style="display:flex;gap:8px"><button class="btn btn-pri">Raise it</button>'
    '<button class="btn btn-sec">Cancel</button></div></div>' +
    '<span class="ts">CON-41 stated honestly and up front. A society that disputes believing the '
    'clock has stopped, and then gets a suspension warning, has been misled by omission.</span>'),
  ('No authority to dispute', ban('info', 'lock', 'Only an office-bearer can raise a formal dispute. '
    'R. Menon and S. Iyer can — or ask us a question, which anyone can do.')),
  ('Error — network', chip('bad', 'Could not load') + '<button class="btn btn-sec sm" '
    'style="align-self:flex-start">Try again</button>'),
  ('Success', chip('ok', 'Final · the figure, the breakdown, and the readings behind it', 'tri'))))

# ================================================================ SCR-260
inv = tbl(['Month', 'Amount', 'Due', 'Status', ''],
 [(['<b>February 2028</b>', '<span class="mono"><b>₹96,487</b></span>', '15 March 2028',
    chip('warn', 'Due in 11 days'), '<button class="btn btn-sec sm">Open</button>'], 'risk r-warn'),
  ['January 2028', '<span class="mono">₹98,412</span>', '15 February 2028',
   chip('ok', 'Paid 12 February', 'tri'), '<button class="btn btn-sec sm">Open</button>'],
  ['December 2027', '<span class="mono">₹97,006</span>', '15 January 2028',
   chip('ok', 'Paid 14 January', 'tri'), '<button class="btn btn-sec sm">Open</button>'],
  ['November 2027 <span class="chip neu"><span class="dot"></span>v2</span>',
   '<span class="mono">₹99,140</span>', '15 December 2027',
   chip('ok', 'Paid 16 December', 'tri'), '<button class="btn btn-sec sm">Open</button>'],
  ['October 2027', '<span class="mono">₹96,220</span>', '15 November 2027',
   chip('ok', 'Paid 11 November', 'tri'), '<button class="btn btn-sec sm">Open</button>']],
 align=[1], wrap=[0])

b = ''.join([
 '<div class="bigrow">' +
 big('Outstanding', '₹96,487', 'one invoice, due 15 March 2028') +
 big('Paid in the last year', '₹11,64,300', '12 invoices, all on time') +
 '</div>',

 panel('Your invoices', inv, '<div style="display:flex;gap:6px">'
   '<button class="btn btn-sec sm">2028</button><button class="btn btn-sec sm">All</button></div>'),

 cols(panel('February 2028 · what the charge is for',
     tbl(['Where', 'You saved', 'Our fee'],
      [['Corridor &amp; staircase', '<span class="mono">₹1,05,248</span>', '<span class="mono">₹44,204</span>'],
       ['Basement car park', '<span class="mono">₹65,688</span>', '<span class="mono">₹27,589</span>'],
       ['Lift lobby <span class="ts">— billed on what it actually saved</span>',
        '<span class="mono">₹18,970</span>', '<span class="mono">₹7,967</span>'],
       ['Podium &amp; landscape', '<span class="mono">₹4,784</span>', '<span class="mono">₹2,009</span>'],
       ['<span class="mut">GST at 18%</span>', '', '<span class="mono">₹14,718</span>']],
      foot=['<b>Total</b>', '<span class="mono">₹1,94,690</span>', '<span class="mono"><b>₹96,487</b></span>'],
      align=[1, 2], wrap=[0]) +
     '<span class="ts">The same four areas, in the same words, as your savings report for the same '
     'month. The two documents always link to each other.</span>' +
     '<div style="display:flex;gap:8px;margin-top:11px;flex-wrap:wrap">'
     '<button class="btn btn-sec">Download</button>'
     '<button class="btn btn-sec">See February’s savings report</button>'
     '<button class="btn btn-sec">This doesn’t look right</button></div>'),
  ''.join([
   panel('Invoices are never edited',
     ban('info', 'lock', 'If something is wrong we issue a <b>corrected version</b> and both stay '
       'on your record. Your November invoice was corrected on 3 December — both versions are here.') +
     '<span class="ts">It reads like an inconvenience from our side and a protection from yours: '
     'your own billing history cannot be quietly rewritten after the fact.</span>'),
   panel('Payments', rows2([
     ('Last payment', '<span class="mono">₹98,412</span>'),
     ('Received', '12 February 2028'),
     ('Reference', '<span class="mono ts">NEFT/PF/0212</span>')]) +
     '<span class="ts" style="display:block;margin-top:9px">Payments show up here once we have '
     'matched them, usually within a day of you sending them.</span>'),
  ]), '1.55fr 1fr'),
])

D.add('SCR-260', 'Invoices',
 'What we owe, what we have paid, and what each charge was for. <b>Invoices are immutable (INV-03) '
 'and this screen says so</b> — a correction produces a v2 and both stay on the record, which is a '
 'feature from the society’s side rather than an inconvenience: their own history cannot be quietly '
 'rewritten. The per-area charge breakdown uses the same words as the savings report for the same '
 'month, and the two documents are always one tap from each other, because the first question about '
 'any invoice is “what is this for” and the answer lives in the other document.',
 pshell(NAV_LIVE, 'Invoices', 'Your invoices',
   'Prestige Ferns, Whitefield · ₹96,487 outstanding',
   '<button class="btn btn-sec">Download all</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use', ban('info', 'cal', 'Your first invoice comes after your first full month — '
    'early October.')),
  ('Empty — filtered', '<span class="ts">“No invoices in 2026.” Names the filter and offers to '
    'clear it.</span>' + '<button class="btn btn-sec sm" style="align-self:flex-start">Show all years</button>'),
  ('Nothing outstanding', ban('ok', 'tick', '<b>Nothing outstanding.</b> Your next invoice is due '
    'in early April.') + '<span class="ts">Zero is stated, never hidden — a blank space reads as a '
    'page that failed to load.</span>'),
  ('Partial / stale', '<span class="ts">A freshness note rather than a stale figure: “Payments are '
    'updated when we reconcile them, usually within a day.”</span>' +
    chip('info', 'Payments updated 4 hours ago')),
  ('Overdue', ban('bad', 'warn', 'Your February invoice was due on 15 March. Please pay it, or call '
    'us if there is a problem — we would much rather know.')),
  ('Error — network', chip('bad', 'Could not load') + '<button class="btn btn-sec sm" '
    'style="align-self:flex-start">Try again</button>'),
  ('Error — permission', '<span class="ts">Wrong society → SCR-221.</span>')))

n, size = D.build('portal.html', 'Society Portal')
print('screens: %d  bytes: %d' % (n, size))
