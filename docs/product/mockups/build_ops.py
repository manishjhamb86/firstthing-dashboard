# -*- coding: utf-8 -*-
# SUR-01 back office — portfolio, registry & dispatch. Prototype 5 of 6.
from _base import I, CK, CU, SK, make, states, Deck

NAV = [('grid', 'Ops home', 'SCR-240', '9'),
 ('__g', 'Portfolio', '', ''),
 ('bldg', 'Societies', 'SCR-241', ''),
 ('chart', 'Circuit history', 'SCR-242', ''),
 ('zap', 'Circuit registry', 'SCR-251', ''),
 ('__g', 'Month', '', ''),
 ('up', 'Ingest', '', ''),
 ('warn', 'Exceptions', '', '7'),
 ('inv', 'Close board', '', '4'),
 ('__g', 'Dispatch', '', ''),
 ('cal', 'Visit scheduler', 'SCR-170', '4'),
 ('users', 'Team', '', '')]
sh = make(NAV)

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
    align = align or []; wrap = wrap or []; wrapn = wrapn or []
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
        body.append('<tr' + (' class="' + cls + '"' if cls else '') + '>' +
                    ''.join('<td' + cc(i) + '>' + c + '</td>' for i, c in enumerate(r)) + '</tr>')
    ft = ''
    if foot:
        ft = ('<tfoot><tr class="tfoot">' + ''.join(
            '<td' + (' class="ta-r"' if i in align else '') + '>' + c + '</td>'
            for i, c in enumerate(foot)) + '</tr></tfoot>')
    return ('<div class="tw"><table class="t"><thead><tr>' + th + '</tr></thead><tbody>'
            + ''.join(body) + '</tbody>' + ft + '</table></div>')
def grid(*panels, **kw):
    m = kw.get('m', 270)
    return ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(' + str(m) +
            'px,1fr));gap:11px;align-items:start">' + ''.join(panels) + '</div>')

def cols(a, b, ratio='1.6fr 1fr'):
    w = lambda x: '<div style="display:flex;flex-direction:column;gap:11px;min-width:0">' + x + '</div>'
    return ('<div class="cols2" style="display:grid;grid-template-columns:' + ratio +
            ';gap:11px;align-items:start">' + w(a) + w(b) + '</div>')
def kpis(items):
    return '<div class="kpis">' + ''.join(
      '<div class="card"><span class="lbl">' + a + '</span><span class="v">' + b +
      '</span><span class="ts">' + c + '</span></div>' for a, b, c in items) + '</div>'
def rows2(pairs):
    return '<div>' + ''.join(
      '<div style="display:flex;justify-content:space-between;gap:14px;padding:5px 0;'
      'border-bottom:1px solid var(--border-subtle)"><span class="mut" style="font-size:12.5px">' + k +
      '</span><span style="font-size:12.5px;text-align:right">' + v + '</span></div>'
      for k, v in pairs) + '</div>'
def field(label, val, note=''):
    n = '<span class="ts">' + note + '</span>' if note else ''
    return ('<div class="field"><label>' + label + '</label><div class="inp">' + val +
            '</div>' + n + '</div>')

OPS_CSS = '''
/* --- band queue: the ops-home priority model, rendered as its own component ------ */
.band{border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);overflow:hidden}
.band.b1{border-color:var(--bad-line)}
.bhd{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--surface-sunken);
     border-bottom:1px solid var(--border-subtle);flex-wrap:wrap}
.band.b1 .bhd{background:var(--bad-bg);--tone-fg:var(--bad-fg)}
.bnum{width:20px;height:20px;flex:none;border-radius:5px;background:var(--neu-bg);color:var(--neu-fg);
      display:grid;place-items:center;font-size:11px;font-weight:700;font-family:var(--mono)}
.band.b1 .bnum{background:var(--bad-fg);color:var(--bad-bg)}
.bttl{font-size:13px;font-weight:640}
.bct{margin-left:auto;font-size:11.5px;color:var(--text-subtle);font-family:var(--mono)}
.qrow{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1.05fr) minmax(0,1.75fr) 64px;gap:12px;
      padding:10px 12px;align-items:center;border-bottom:1px solid var(--border-subtle)}
.qrow:last-child{border-bottom:0}
.qrow:hover{background:var(--surface-hover)}
.qw{font-size:13px;font-weight:560;min-width:0}
.qsoc{font-size:12.5px;color:var(--text-muted);min-width:0}
.qwhy{font-size:12px;color:var(--text-subtle)}
.qage{font-size:11.5px;font-family:var(--mono);color:var(--text-subtle);text-align:right}
@media (max-width:860px){.qrow{grid-template-columns:1fr;gap:4px}.qage{text-align:left}}

/* --- week calendar -------------------------------------------------------------- */
.cal{border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--surface)}
.calr{display:grid;grid-template-columns:132px repeat(5,minmax(0,1fr));border-bottom:1px solid var(--border-subtle)}
.calr:last-child{border-bottom:0}
.calh{background:var(--surface-sunken);font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;
      font-weight:650;color:var(--text-subtle);padding:7px 9px}
.calh.today{color:var(--accent)}
.calp{padding:9px;font-size:12.5px;font-weight:560;border-right:1px solid var(--border-subtle);
      display:flex;flex-direction:column;gap:2px;background:var(--surface-sunken)}
.calp .ts{font-weight:400}
.calc{padding:6px;min-height:58px;border-right:1px solid var(--border-subtle);display:flex;
      flex-direction:column;gap:4px}
.calc:last-child{border-right:0}
.vis{border-radius:var(--r-sm);padding:4px 7px;font-size:11.5px;line-height:1.3;border:1px solid}
.vis.ok{background:var(--ok-bg);color:var(--ok-fg);border-color:var(--ok-line)}
.vis.warn{background:var(--warn-bg);color:var(--warn-fg);border-color:var(--warn-line)}
.vis.info{background:var(--info-bg);color:var(--info-fg);border-color:var(--info-line)}
.vis.neu{background:var(--neu-bg);color:var(--neu-fg);border-color:var(--neu-line)}
.vis b{display:block;font-weight:640}
@media (max-width:900px){.calr{grid-template-columns:1fr}.calp{border-right:0}
  .calc{border-right:0;border-bottom:1px solid var(--border-subtle)}}

/* --- tabs ----------------------------------------------------------------------- */
.tabr{display:flex;gap:2px;border-bottom:1px solid var(--border);overflow-x:auto}
.tabi{padding:8px 13px;font-size:13px;color:var(--text-muted);white-space:nowrap;cursor:pointer;
      border-bottom:2px solid transparent}
.tabi.on{color:var(--accent);border-bottom-color:var(--accent);font-weight:620}

/* --- chart ---------------------------------------------------------------------- */
/* The global `svg` size default (05a-theme-system.md 3.9) beats an SVG's own width/height
   presentation attributes -- those lose to any CSS rule. So a deliberately-sized SVG must be
   sized in CSS, not on the element. Found by the chart collapsing to 1.05em. */
.chartw{overflow-x:auto}
.chartw svg{width:700px;height:230px;flex:none}
.lg{display:flex;gap:13px;flex-wrap:wrap;margin-top:9px}
.lgi{display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-muted)}
.lgs{width:15px;height:3px;border-radius:2px;flex:none}
'''

# ---------------------------------------------------------------- SVG line chart
MONTHS = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug']
SERIES = [
 ('Corridor & staircase', '#16624A', 64.0, [65.1, 64.8, 63.9, 64.4, 65.2, 64.0, 63.5, 64.9, 65.5, 64.2, 63.8, 64.6]),
 ('Basement car park',   '#1F5477', 68.4, [69.0, 68.6, 68.1, 67.9, 68.8, 69.2, 68.4, 67.6, 68.2, 68.9, 69.1, 68.5]),
 ('Lift lobby',          '#9E3F2C', 66.0, [66.4, 65.8, 64.9, 63.2, 61.0, 59.4, 57.8, 56.9, 58.6, 60.1, 59.2, 57.4]),
 ('External & landscape','#7E5A08', 58.0, [58.9, 59.4, 57.6, 56.8, 58.2, 59.0, 58.5, 57.9, 58.8, 59.3, 58.1, 57.7]),
]
EVENTS = [(3, 'Meter replaced'), (7, 'Inspection'), (9, 'Rescale +48')]

def linechart():
    W, H, PL, PR, PT, PB = 700, 230, 38, 12, 14, 30
    lo, hi = 54.0, 72.0
    x = lambda i: PL + i * (W - PL - PR) / 11.0
    y = lambda v: PT + (hi - v) * (H - PT - PB) / (hi - lo)
    o = ['<svg viewBox="0 0 ' + str(W) + ' ' + str(H) + '" width="' + str(W) + '" height="' + str(H) +
         '" role="img" aria-label="Monthly measured saving per circuit against benchmark">']
    # gridlines + y labels
    for v in range(56, 73, 4):
        o.append('<line x1="' + str(PL) + '" y1="' + str(round(y(v), 1)) + '" x2="' + str(W - PR) +
                 '" y2="' + str(round(y(v), 1)) + '" stroke="var(--border-subtle)" stroke-width="1"/>')
        o.append('<text x="' + str(PL - 7) + '" y="' + str(round(y(v) + 3.5, 1)) +
                 '" text-anchor="end" font-size="9.5" fill="var(--text-subtle)" '
                 'font-family="var(--mono)">' + str(v) + '%</text>')
    # Shade the BREACH region — below the lift lobby's floor — not the whole tolerance band.
    # The band is 66% +/-12%, so shading it covers most of the plot and reads as "everything is
    # highlighted". The half that carries meaning is the half below the floor.
    o.append('<rect x="' + str(PL) + '" y="' + str(round(y(58.1), 1)) + '" width="' + str(W - PL - PR) +
             '" height="' + str(round((H - PB) - y(58.1), 1)) +
             '" fill="rgba(158,63,44,.09)"/>')
    o.append('<line x1="' + str(PL) + '" y1="' + str(round(y(58.1), 1)) + '" x2="' + str(W - PR) +
             '" y2="' + str(round(y(58.1), 1)) + '" stroke="#9E3F2C" stroke-width="1" '
             'stroke-dasharray="3 3" opacity=".55"/>')
    # events
    for i, name in EVENTS:
        o.append('<line x1="' + str(round(x(i), 1)) + '" y1="' + str(PT) + '" x2="' + str(round(x(i), 1)) +
                 '" y2="' + str(H - PB) + '" stroke="var(--text-subtle)" stroke-width="1" '
                 'stroke-dasharray="2 4" opacity=".6"/>')
        o.append('<text x="' + str(round(x(i) + 3, 1)) + '" y="' + str(PT + 9) +
                 '" font-size="9" fill="var(--text-subtle)">' + name + '</text>')
    # series
    for name, col, bench, vals in SERIES:
        pts = ' '.join(str(round(x(i), 1)) + ',' + str(round(y(v), 1)) for i, v in enumerate(vals))
        o.append('<polyline points="' + pts + '" fill="none" stroke="' + col +
                 '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>')
        for i, v in enumerate(vals):
            bad = (name == 'Lift lobby' and v < 58.1)
            o.append('<circle cx="' + str(round(x(i), 1)) + '" cy="' + str(round(y(v), 1)) +
                     '" r="' + ('3.4' if bad else '2.1') + '" fill="' +
                     (col if not bad else '#9E3F2C') + '"/>')
    # x labels
    for i, m in enumerate(MONTHS):
        o.append('<text x="' + str(round(x(i), 1)) + '" y="' + str(H - 11) + '" text-anchor="middle" '
                 'font-size="9.5" fill="var(--text-subtle)">' + m + '</text>')
    o.append('</svg>')
    lg = ''.join('<span class="lgi"><span class="lgs" style="background:' + c + '"></span>' + n +
                 ' <span class="ts">· ' + str(b) + '%</span></span>' for n, c, b, _ in SERIES)
    return ('<div class="chartw">' + ''.join(o) + '</div><div class="lg">' + lg +
            '<span class="lgi"><span class="lgs" style="background:#9E3F2C;opacity:.35"></span>'
            'Below the lift lobby’s floor · 58.1%</span></div>')

D = Deck('Prototype 5 of 6 · SUR-01 back office',
  'Portfolio, registry & dispatch',
  'Six screens the flows never reach. Phase 4 classified CAP-08 as a view rather than a journey, '
  'and it is still six real screens — including the one PER-01 opens first every morning and the '
  'most dangerous editable screen in the product. The deck is set on Thursday 13 August 2026, four '
  'days into the seventeen-day window for closing July, which is when this half of the back office '
  'is under the most pressure.',
  css=OPS_CSS)

# ================================================================ SCR-240
def qrow(what, soc, why, age):
    return ('<div class="qrow"><div class="qw">' + what + '</div>'
            '<div class="qsoc">' + soc + '</div>'
            '<div class="qwhy">' + why + '</div>'
            '<div class="qage">' + age + '</div></div>')

def band(n, title, note, rows, tone='', open_=True):
    cls = 'band' + (' ' + tone if tone else '')
    hd = ('<div class="bhd"><span class="bnum">' + str(n) + '</span>'
          '<span class="bttl">' + title + '</span>'
          '<span class="ts">' + note + '</span>'
          '<span class="bct">' + str(len(rows)) + '</span></div>')
    return '<div class="' + cls + '">' + hd + ''.join(rows) + '</div>'

b = ''.join([
 kpis([('Closing', 'July 2026', '4 days left of 17'),
       ('Societies active', '38', '2 onboarding, 1 suspended'),
       ('Months released', '32 of 38', '6 still to release'),
       ('Overdue invoices', '5', '₹4,82,300 outstanding')]),

 ban('bad', 'warn', '<b>Two crews are standing still right now.</b> Band 1 is never collapsed, '
   'never paginated, and never snoozeable — if it is routinely long that is an operational fact '
   'someone needs to see, not a queue to absorb.'),

 band(1, 'Idle crew today', 'people are standing still — cost is a wasted day that cannot be recovered', [
   qrow('Yesterday’s batch not approved',
        'Prestige Ferns · Whitefield',
        'Crew due on site 09:00 · CON-21 cutoff missed at 06:00', '2 h 41 m'),
   qrow('Technician blocked on a gate pass',
        'Settlement Vega · Sarjapur',
        'A. Kulkarni waiting at the gate · provisional release available', '18 m'),
 ], tone='b1'),

 band(2, 'Window at risk', 'missing the window delays every society’s invoice, not one', [
   qrow('6 societies unreleased', 'Portfolio', '4 days left, ~1.5 days of work remaining', '—'),
   qrow('3 invoices waiting on the accountant', 'Release queue', 'PER-08 has not opened the queue today', '1 d 4 h'),
   qrow('July ingest incomplete', 'ASF Insignia · Gurugram', '19 of 31 days validated — below CON-12’s 20-day floor', '6 d'),
 ]),

 band(3, 'Decision expiring', '4 open deviations · the cost is a wrong billing basis that is hard to unwind', [
   qrow('Deviation review must conclude before close', 'Brigade Cornerstone · Whitefield',
        'Lift lobby, second consecutive breach — CON-01c evaluates on release', '3 d'),
   qrow('Streak evaluating against an unknown cause', 'Settlement Nexus · Bellandur',
        'Corridor circuit down 12% with no inspection on record', '5 d'),
 ]),

 band(4, 'Clock running', 'real deadlines, but days rather than hours', [
   qrow('Arrears day 22 of 30', 'Settlement Nexus · Bellandur', 'Suspension is automatic at day 30 (CON-13)', '22 d'),
   qrow('2 provisional gate passes awaiting review', 'Field', 'Released on the 30-minute rule (CON-40)', '4 h'),
   qrow('Extension request', 'Prestige Ferns · Whitefield', 'Asked for 15 more days on the July invoice', '1 d'),
 ]),

 band(5, 'Queued work', 'no hard deadline — ages into band 4 if ignored', [
   qrow('3 surveys awaiting review', 'Various', 'Oldest 4 days', '4 d'),
   qrow('4 KYC items to verify', 'Various', 'One rejected twice — worth a call', '2 d'),
   qrow('6 open tickets', 'Support', 'None breaching first-response', '—'),
 ]),
])

D.add('SCR-240', 'Ops home — the priority queue',
 'Arguably the most-used screen in the product, and the only one with no flow behind it. Its whole '
 'difficulty is that every capability wants to put something on it, and <b>a queue that lists '
 'everything ranks nothing</b>. So the ordering is derived rather than invented: five bands, '
 'ordered by what has a deadline and what that deadline costs — idle crew now, then the close '
 'window, then a decision that expires, then a clock in days, then unbounded work. The <i>why</i> '
 'is a column, not a tooltip: an item whose reason is not stated is an item that gets skipped.',
 sh('SCR-240', 'Ops home', 'Thursday 13 August 2026',
    chip('warn', 'July close · 4 days left') +
    '<button class="btn btn-sec">My work</button>'
    '<button class="btn btn-pri">Work the top item</button>', b),
 states(
  ('Loading', '<span class="ts">Skeleton bands, in band order — the shape of the day appears before '
    'its contents.</span>' + SK),
  ('Empty — first use', ban('info', 'i', '“Nothing needs you yet. Work appears here as societies '
    'come on.”')),
  ('Empty — filtered', '<span class="ts">Names the filter that excluded everything.</span>'),
  ('<b>Empty — all clear</b>', ban('ok', 'tick', '<b>Nothing is blocked and nothing is at risk.</b>') +
    '<span class="ts">A real and good state, stated plainly. A blank screen here reads as a page '
    'that failed to load, which is the opposite of reassuring.</span>'),
  ('Partial / stale', ban('warn', 'i', '<b>Band 4 is incomplete</b> — the arrears service did not '
    'respond. Naming which band is short beats silently showing fewer items.')),
  ('Band 1 persistent', '<span class="ts">A recurring band-1 count is shown as a trend, because '
    '“we start every day with six idle crews” is a fact somebody needs to see.</span>' +
    chip('bad', 'band 1 averaging 4.2/day over 30 days')),
  ('Snooze refused', ban('bad', 'x', '<b>Band 1 cannot be snoozed.</b> A crew is idle now — snoozing '
    'it hides a cost that is already being paid.')),
  ('Claim conflict', chip('warn', 'Already claimed by R. Nair, 3 minutes ago') +
    '<span class="ts">Names who, rather than failing silently.</span>'),
  ('Error — network', chip('bad', 'Could not load') +
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission', '<span class="ts">Non-ops → SCR-221.</span>'),
  ('Success', '<span class="ts">Item leaves the queue with a brief confirmation, and the band count '
    'decrements in place rather than the list reflowing.</span>')))

# ================================================================ SCR-241
def health(tone, label, why):
    return ('<span class="chip ' + tone + '" title="' + why + '"><span class="dot"></span>' +
            label + '</span>')

soc = tbl(['Society', 'City', 'Flats', 'Lines', 'July', 'Outstanding', 'Health', ''],
 [(['<span class="nm">Brigade Cornerstone</span>', 'Whitefield', '<span class="mono">980</span>',
   'Lighting', chip('warn', 'in review'), '<span class="mono">—</span>',
   health('warn', 'attention · 2', 'Open deviation; second consecutive breach on lift lobby'),
   '<button class="btn btn-sec sm">Open</button>'], 'risk r-warn'),
  (['<span class="nm">Settlement Nexus</span>', 'Bellandur', '<span class="mono">1,420</span>',
   'Lighting · Pumps', chip('ok', 'released', 'tri'), '<span class="mono">₹2,14,900</span>',
   health('bad', 'at risk · 3', 'Arrears day 22 of 30; unexplained streak; suspension pending'),
   '<button class="btn btn-sec sm">Open</button>'], 'risk r-bad'),
  ['<span class="nm">ASF Insignia</span>', 'Gurugram', '<span class="mono">760</span>',
   'Lighting', chip('bad', 'blocked'), '<span class="mono">—</span>',
   health('bad', 'at risk · 1', '19 of 31 days validated — below CON-12 floor'),
   '<button class="btn btn-sec sm">Open</button>'],
  ['<span class="nm">Settlement Vega</span>', 'Sarjapur', '<span class="mono">640</span>',
   'Lighting', chip('info', 'installing'), '<span class="mono">—</span>',
   health('info', 'onboarding', 'Installation day 4 of 9'),
   '<button class="btn btn-sec sm">Open</button>'],
  ['<span class="nm">Prestige Ferns</span>', 'Whitefield', '<span class="mono">1,240</span>',
   'Lighting', chip('info', 'installing'), '<span class="mono">—</span>',
   health('warn', 'attention · 1', 'Batch approval missed its cutoff'),
   '<button class="btn btn-sec sm">Open</button>'],
  ['<span class="nm">Mantri Serenity</span>', 'Bannerghatta', '<span class="mono">1,080</span>',
   'Lighting', chip('ok', 'released', 'tri'), '<span class="mono">—</span>',
   health('ok', 'healthy', 'Nothing outstanding', ),
   '<button class="btn btn-sec sm">Open</button>'],
  ['<span class="nm">Sobha Dewflower</span>', 'Jakkur', '<span class="mono">520</span>',
   'Lighting', chip('ok', 'released', 'tri'), '<span class="mono">₹96,487</span>',
   health('ok', 'healthy', 'Invoice due, not overdue'),
   '<button class="btn btn-sec sm">Open</button>']],
 foot=['<b>38 societies</b>', '', '<span class="mono">34,180</span>', '',
       '<span class="mono">32 released</span>', '<span class="mono">₹4,82,300</span>', '', ''],
 align=[2, 5])

b = ''.join([
 '<div class="bar" style="box-shadow:none">' +
 chip('neu', 'All 38') + chip('info', 'Prospect · 6') + chip('info', 'Onboarding · 2') +
 chip('ok', 'Active · 38') + chip('bad', 'Suspended · 1') + chip('neu', 'Ended · 3') +
 '<span style="margin-left:auto;display:flex;gap:7px">'
 '<span class="inp" style="width:190px;color:var(--text-subtle)">Search a society…</span>'
 '<button class="btn btn-sec sm">Export CSV</button></span></div>',

 panel('Portfolio', soc,
   '<div style="display:flex;gap:6px">' + chip('warn', 'Health: attention · 2') +
   chip('bad', 'at risk · 2') + '</div>'),

 cols(panel('Health is a composite, and it must decompose',
     ban('info', 'i', 'A chip that says <b>attention</b> and cannot be expanded is worse than no '
       'chip at all. Tapping one states the contributing facts, because an operator acts on the '
       'fact, never on the summary.') +
     tbl(['Society', 'What is actually wrong', 'Goes to'],
      [['Settlement Nexus', 'Arrears day 22 of 30 — suspension automatic at 30', 'SCR-120'],
       ['Settlement Nexus', 'Corridor down 12%, no inspection on record', 'SCR-110'],
       ['Settlement Nexus', 'July released, invoice unpaid 22 days', 'SCR-260'],
       ['Brigade Cornerstone', 'Lift lobby, second consecutive breach', 'SCR-092'],
       ['Brigade Cornerstone', 'Deviation review open since 10 August', 'SCR-110']], wrap=[1])),
  ''.join([
   panel('Bulk notify',
     '<span class="ts">FEAT-093. The modal lists every recipient before sending — a templated '
     'message to 38 committees is not something to send from a count.</span>' +
     '<div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">'
     '<button class="btn btn-sec sm">Select all filtered</button>'
     '<button class="btn btn-pri sm">Notify 7 societies</button></div>'),
   panel('Portfolio totals', rows2([
     ('Flats under contract', '<b class="mono">34,180</b>'),
     ('Monthly billed value', '<span class="mono">₹28,40,600</span>'),
     ('Outstanding', '<span class="mono">₹4,82,300</span>'),
     ('Oldest unpaid', '<span class="mono">22 days</span>')])),
  ]), '1.7fr 1fr'),
])

D.add('SCR-241', 'Portfolio society list',
 'Every society, its state, and what is wrong with it, in one scannable list. The load-bearing '
 'design decision is the <b>health composite</b>: a single chip summarising overdue invoices, open '
 'deviations, missed approvals and unresolved tickets is only useful if it can be taken apart '
 'again, because the operator acts on the underlying fact and never on the summary. A chip that '
 'says “attention” and cannot be expanded sends someone hunting across four screens to find out '
 'why.',
 sh('SCR-241', 'Portfolio › Societies', 'Societies',
    '<button class="btn btn-sec">Export</button>'
    '<button class="btn btn-pri">Add society</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use', ban('neu', 'i', '<b>No societies yet.</b> Add your first one to get '
    'started.') + '<button class="btn btn-pri sm" style="align-self:flex-start">Add society</button>'),
  ('Empty — filtered', '<span class="ts">“No suspended societies in Gurugram.” Names both facets '
    'it filtered on.</span>' + '<button class="btn btn-sec sm" style="align-self:flex-start">Clear filters</button>'),
  ('<b>Partial / stale</b>', chip('warn', 'Health as of 06:00 — inputs not refreshed') +
    '<span class="ts">The health column is labelled with its as-of time rather than shown as '
    'current. A stale risk score presented as live is how someone misses an arrears deadline.</span>'),
  ('Error — network', chip('bad', 'Could not load') +
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission', '<span class="ts">Non-ops → SCR-221.</span>'),
  ('Bulk notify — partial failure', ban('warn', 'warn', 'Sent to 5 of 7. <b>Two bounced</b> — '
    'Settlement Vega and Sobha Dewflower. Reported per society, never as an aggregate.')),
  ('Success', chip('ok', '38 societies · totals in the footer', 'tri'))))

# ================================================================ SCR-242
hist = tbl(['Month', 'Corridor', 'Basement', 'Lift lobby', 'External', 'Basis', 'Fee'],
 [['Mar 2026', '<span class="mono">63.5%</span>', '<span class="mono">68.4%</span>',
   '<span class="mono" style="color:var(--bad-fg)">57.8%</span>', '<span class="mono">58.5%</span>',
   'All fixed', '<span class="mono">₹1,02,400</span>'],
  (['Apr 2026', '<span class="mono">64.9%</span>', '<span class="mono">67.6%</span>',
   '<span class="mono" style="color:var(--bad-fg)"><b>56.9%</b></span>', '<span class="mono">57.9%</span>',
   'All fixed <span class="ts">— 2nd breach</span>', '<span class="mono">₹1,01,900</span>'], 'risk r-bad'),
  (['May 2026', '<span class="mono">65.5%</span>', '<span class="mono">68.2%</span>',
   '<span class="mono">58.6%</span>', '<span class="mono">58.8%</span>',
   '<b>Lift lobby → measured</b>', '<span class="mono">₹98,100</span>'], 'risk r-warn'),
  ['Jun 2026', '<span class="mono">64.2%</span>', '<span class="mono">68.9%</span>',
   '<span class="mono">60.1%</span>', '<span class="mono">59.3%</span>',
   'Lift lobby measured', '<span class="mono">₹99,700</span>'],
  ['Jul 2026', '<span class="mono">63.8%</span>', '<span class="mono">69.1%</span>',
   '<span class="mono">59.2%</span>', '<span class="mono">58.1%</span>',
   'Lift lobby measured', '<span class="mono">₹99,200</span>'],
  (['Aug 2026', '<span class="mono ts">provisional</span>', '<span class="mono ts">provisional</span>',
   '<span class="mono ts">57.4%</span>', '<span class="mono ts">provisional</span>',
   '<span class="ts">month open</span>', '<span class="mono ts">—</span>'], '')],
 align=[1, 2, 3, 4, 6], wrapn=[5])

b = ''.join([
 '<div class="bar" style="box-shadow:none">'
 '<span class="lbl">Circuits</span>' + CK + '<span style="font-size:12.5px">Corridor</span>' +
 CK + '<span style="font-size:12.5px">Basement</span>' +
 CK + '<span style="font-size:12.5px">Lift lobby</span>' +
 CK + '<span style="font-size:12.5px">External</span>'
 '<span style="margin-left:auto;display:flex;gap:7px">'
 '<button class="btn btn-sec sm">Show as table</button>'
 '<button class="btn btn-sec sm">Export</button></span></div>',

 panel('Measured saving against benchmark · September 2025 – August 2026',
   linechart() +
   '<span class="ts" style="display:block;margin-top:10px">Comparing siblings is the main use of '
   'this screen, so the circuits overlay rather than sitting in four charts. The shaded region is '
   'everything below the <b>lift lobby’s own</b> tolerance floor — bands are per circuit (CON-01a) '
   'and are never drawn as one, so only the circuit in question gets its floor drawn.</span>',
   chip('neu', 'Brigade Cornerstone · 17 months')),

 ban('warn', 'i', '<b>The lift lobby has not always been like this.</b> It ran at benchmark for its '
   'first four months and has declined steadily since — which is the shape of failing fittings, not '
   'of a measurement problem. The two breaches in March and April are the end of that slope, not '
   'the event. <b>This is the question the screen exists to answer</b>, and no single month’s review '
   'can answer it.'),

 panel('Month by month', hist +
     '<span class="ts">The open month is shown dashed and labelled provisional rather than '
     'omitted — an operator comparing trend needs to see where the series stops.</span>'),

 grid(*[
   panel('Events on the axis',
     rows2([('Dec 2025', 'Meter replaced — faulty CT'),
            ('Apr 2026', 'Inspection · 14 fittings out'),
            ('Jun 2026', 'Rescale +48 lights (INV-07)')]) +
     '<span class="ts" style="display:block;margin-top:9px">A step change explained by an event is '
     'not a mystery. Marking them on the axis is what stops someone opening a deviation review for '
     'a meter swap.</span>'),
   panel('Circuit facts', rows2([
     ('Light type', 'Lift lobby'),
     ('Metered / represented', '<span class="mono">48 / 210</span>'),
     ('Fitting', '<span class="mono">7 W LED downlight</span>'),
     ('Benchmark', '<span class="mono">66.0% ±12%</span>'),
     ('Floor', '<span class="mono">58.1%</span>'),
     ('Basis since May 2026', '<b>actual-metered</b>'),
     ('Benchmark versions', '<span class="mono">2</span>')]) +
     '<button class="btn btn-sec sm" style="margin-top:10px">Open in the registry</button>'),
  ]),
])

D.add('SCR-242', 'Society → circuit drill-down',
 'Distinct from SCR-110’s deviation review, and it has to stay distinct. That screen investigates '
 '<i>one month’s</i> deviation and ends in a decision. This one is exploratory, spans the whole '
 'term, and ends in nothing — it is where someone goes to ask <b>“has this circuit always been like '
 'this?”</b> Collapsing the two would either make the review screen unfocused or make this one '
 'falsely decisive. Here the answer is no: the lift lobby was fine for four months and has degraded '
 'steadily since, which points at fittings rather than measurement — a conclusion no single month '
 'can support.',
 sh('SCR-242', 'Portfolio › Brigade Cornerstone › Circuits', 'Circuit history',
    '<button class="btn btn-sec">Show as table</button>'
    '<button class="btn btn-sec">Export</button>', b),
 states(
  ('Loading', '<span class="ts">Skeleton chart <b>with its axes drawn</b> — the axes are known '
    'before the data is, and drawing them stops the panel resizing on load.</span>' + SK),
  ('Empty — first use', ban('info', 'i', '“Brigade Cornerstone hasn’t been billed yet.” No released '
    'months means no series.')),
  ('Empty — filtered', '<span class="ts">No circuit selected → a prompt to pick one, not a blank '
    'chart.</span>'),
  ('Partial / stale', chip('info', 'August provisional — month still open') +
    '<span class="ts">Drawn dashed on the chart and labelled in the table.</span>'),
  ('Basis change on the axis', chip('warn', 'Lift lobby → actual-metered, May 2026') +
    '<span class="ts">A basis change is marked on the axis, because the fee series steps there for '
    'a reason that is not a performance change.</span>'),
  ('Show as table', '<span class="ts">The system’s chart rule: every chart has a table. This is the '
    'accessibility path, not a secondary view.</span>'),
  ('Error — network', chip('bad', 'Could not load') + '<button class="btn btn-sec sm" '
    'style="align-self:flex-start">Retry</button>'),
  ('Error — permission', '<span class="ts">Non-ops → SCR-221.</span>'),
  ('Narrow viewport', '<span class="ts">Below 768px the page says the chart needs a wider screen '
    'and offers the table, rather than rendering an unreadable chart.</span>')))

# ================================================================ SCR-250
people = tbl(['Name', 'Authority', 'Email', 'Last seen', ''],
 [['<span class="nm">K. Ramamurthy</span>', chip('neu', 'committee'), 'k.ram@…', '4 days ago',
   '<button class="btn btn-sec sm">Edit</button>'],
  ['<span class="nm">S. Iyer</span>', chip('neu', 'committee'), 's.iyer@…', '2 months ago',
   '<button class="btn btn-sec sm">Edit</button>'],
  ['<span class="nm">M. Bhaskar</span>', chip('neu', 'manager'), 'mgr@…', 'yesterday',
   '<button class="btn btn-sec sm">Edit</button>']],
 wrapn=[2])

b = ''.join([
 ban('bad', 'warn', '<b>This society has no office-bearer.</b> Nobody can accept an offer, sign a '
   'completion certificate, accept an amendment or raise a dispute until one is designated. The '
   'previous holder’s term ended on 30 June and the committee turned over without a handover. '
   '<b>This banner appears on every tab, not only on People</b> — a society silently unable to '
   'accept anything is exactly the failure CON-45 rule 3 exists to prevent.'),

 '<div class="tabr">'
 '<span class="tabi">Overview</span><span class="tabi">Circuits</span>'
 '<span class="tabi">Billing</span><span class="tabi">Documents</span>'
 '<span class="tabi on">People</span><span class="tabi">Activity</span></div>',

 cols(''.join([
   panel('Portal accounts', people,
     '<button class="btn btn-pri sm">Add account</button>'),
   panel('Re-designate an office-bearer',
     ban('info', 'lock', 'This exists because committees turn over. It is an <b>ops escape hatch</b> '
       '(CON-45 rule 3), it is audited, and the modal says so — designating someone here grants the '
       'authority to commit this society contractually.') +
     '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;'
     'margin-top:11px">' +
     field('Grant office-bearer to', 'K. Ramamurthy ▾') +
     field('Effective', '13 August 2026') +
     field('Reason', 'Committee turnover, no handover') + '</div>'
     '<div style="display:flex;gap:8px;margin-top:11px">'
     '<button class="btn btn-pri">Designate</button>'
     '<button class="btn btn-sec">Cancel</button></div>'),
  ]),
  ''.join([
   panel('Brigade Cornerstone', rows2([
     ('City', 'Whitefield, Bengaluru'),
     ('Flats', '<span class="mono">980</span>'),
     ('Lifecycle', chip('ok', 'active', 'tri')),
     ('Live since', 'March 2025'),
     ('Term ends', 'March 2032'),
     ('Next election', '<b>due — overdue by 44 days</b>')])),
   panel('Service lines',
     '<div style="display:flex;flex-direction:column;gap:8px">'
     '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">'
     '<span style="font-size:13px">Common-area lighting</span>' + chip('ok', 'active', 'tri') + '</div>'
     '<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">'
     '<span style="font-size:13px">Water pumps</span>' + chip('info', 'survey booked') + '</div></div>'
     '<span class="ts" style="display:block;margin-top:9px">One society, several independent '
     'pipelines (CON-24). The pump line being at survey does not hold up the lighting line’s '
     'monthly close.</span>'),
   panel('Danger zone',
     '<div style="display:flex;flex-direction:column;gap:8px">'
     '<button class="btn btn-sec">Suspend servicing</button>'
     '<button class="btn btn-sec">End contract</button></div>'
     '<span class="ts" style="display:block;margin-top:9px">There is deliberately <b>no manual '
     'suspend-for-arrears</b> here — arrears suspension is automatic at day 30 (CON-13). A manual '
     'control beside an automatic rule is how the two drift apart.</span>'),
  ]), '1.6fr 1fr'),
])

D.add('SCR-250', 'Society record',
 'Everything about one society in one place, across a lifecycle that runs from a lead with a name '
 'and a city to an eighteen-month customer with four service lines — so sections appear as they '
 'become real rather than sitting empty from day one. Shown here in its most consequential state: '
 '<b>a society with no office-bearer</b>. The committee turned over with no handover, so there is '
 'nobody who can accept an offer, sign a certificate or raise a dispute. The People tab is where '
 'ops re-designates one, and the condition is announced on every tab rather than left for someone '
 'to notice as an empty list.',
 sh('SCR-241', 'Portfolio › Brigade Cornerstone', 'Brigade Cornerstone',
    chip('bad', 'no office-bearer') +
    '<button class="btn btn-sec">Edit profile</button>'
    '<button class="btn btn-pri">Designate office-bearer</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use', '<span class="ts">A bare prospect: only Overview is populated, and the '
    'other tabs state what makes them appear rather than showing five empty tables.</span>'),
  ('Empty — filtered', '<span class="ts">Per-tab EmptyState (INV-06) — every tab owns its own.</span>'),
  ('<b>No office-bearer</b>', ban('bad', 'warn', 'The banner is on <b>every</b> tab. This blocks '
    'every binding act, so it cannot be something you only see if you happen to open People.')),
  ('Partial / stale — mid-onboarding', chip('info', 'Onboarding · KYC 2 of 3') +
    '<span class="ts">Progress against the pipeline, not a spinner.</span>'),
  ('Promote prospect → active', ban('info', 'i', 'Pulls the survey-captured data rather than '
    're-asking for it (FEAT-085). Missing prerequisites are <b>named</b>: “Needs a confirmed survey '
    'and a signed agreement.”')),
  ('Suspend', ban('warn', 'warn', 'The modal names what suspension actually halts: <b>field '
    'servicing stops; readings and billing continue.</b> Ambiguity here is how a society ends up '
    'unserviced and still billed with nobody having decided that.')),
  ('Error — network', chip('bad', 'Could not load') + '<button class="btn btn-sec sm" '
    'style="align-self:flex-start">Retry</button>'),
  ('Error — permission', '<span class="ts">Non-ops → SCR-221.</span>'),
  ('Success', '<span class="ts">Toast, and the audit row lands on the Activity tab immediately.</span>')))

# ================================================================ SCR-251
reg = tbl(['Light type', 'Panel location', 'Metered', '<b>Represented</b>', 'Wattage', 'Benchmark',
           'Band', 'Basis', 'Meter'],
 [['<span class="nm">Corridor &amp; staircase</span>', '<span class="mono ts">TwrA/DB-3/L3-corr</span>',
   '<span class="mono">62</span>', '<span class="mono"><b>720</b></span>', '<span class="mono">12 W</span>',
   '<span class="mono">64.0%</span>', '<span class="mono">±10%</span>', chip('ok', 'fixed', 'tri'),
   '<span class="mono ts">EM-4471</span>'],
  ['<span class="nm">Basement car park</span>', '<span class="mono ts">Bsmt/DB-1/bay-3</span>',
   '<span class="mono">54</span>', '<span class="mono"><b>420</b></span>', '<span class="mono">18 W</span>',
   '<span class="mono">68.4%</span>', '<span class="mono">±10%</span>', chip('ok', 'fixed', 'tri'),
   '<span class="mono ts">EM-4472</span>'],
  (['<span class="nm">Lift lobby</span>', '<span class="mono ts">TwrB/DB-2/lobby</span>',
   '<span class="mono">48</span>', '<span class="mono"><b>210</b></span>', '<span class="mono">7 W</span>',
   '<span class="mono">66.0%</span>', '<span class="mono">±12%</span>', chip('warn', 'actual-metered'),
   '<span class="mono ts">EM-4473</span>'], 'risk r-warn'),
  ['<span class="nm">External &amp; landscape</span>', '<span class="mono ts">Ext/DB-4/land</span>',
   '<span class="mono">51</span>', '<span class="mono"><b>70</b></span>', '<span class="mono">24 W</span>',
   '<span class="mono">58.0%</span>', '<span class="mono">±15%</span>', chip('ok', 'fixed', 'tri'),
   '<span class="mono ts">EM-4474</span>']],
 foot=['<b>4 circuits</b>', '', '<span class="mono">215</span>', '<span class="mono"><b>1,420</b></span>',
       '', '', '', '', ''],
 align=[2, 3, 4, 5, 6])

rescale = ('<div class="panel" style="border-color:var(--warn-line);background:var(--warn-bg);'
  '--tone-fg:var(--warn-fg)">'
  '<h3>Change light count · Basement car park</h3>'
  '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:11px;'
  'margin:10px 0">'
  '<div><span class="lbl">Represented now</span><div class="mono" style="font-size:20px;'
  'font-weight:650">420</div></div>'
  '<div><span class="lbl">After</span><div class="mono" style="font-size:20px;font-weight:650">468</div></div>'
  '<div><span class="lbl">Benchmark now</span><div class="mono" style="font-size:20px;'
  'font-weight:650">68.4%</div></div>'
  '<div><span class="lbl">After</span><div class="mono" style="font-size:20px;font-weight:650">68.4%</div></div>'
  '<div><span class="lbl">Effective</span><div class="mono" style="font-size:20px;'
  'font-weight:650">Sep 2026</div></div></div>'
  '<p style="font-size:13px">The percentage is unchanged — a rescale moves the <b>represented '
  'consumption</b>, not the rate. The fee rises by about <b>₹1,880 a month</b> from September. '
  'July is already released and is not touched (INV-03).</p>'
  '<div style="display:flex;gap:8px;margin-top:11px;flex-wrap:wrap">'
  '<button class="btn btn-pri">Commit the rescale</button>'
  '<button class="btn btn-sec">Cancel</button></div></div>')

b = ''.join([
 ban('bad', 'lock', '<b>This is the most dangerous editable screen in the product.</b> '
   '<code>representedLightCount</code> is the multiplier on every extrapolation (CON-11) — change '
   'it and every future bill for this society changes. INV-07 requires a light-count change to '
   'produce a <b>deterministic rescale that is shown before it is committed</b>, never a free edit, '
   'and this screen is where that rule either holds or is quietly bypassed.'),

 panel('Circuits · Brigade Cornerstone', reg,
   '<div style="display:flex;gap:6px"><button class="btn btn-sec sm">Add circuit</button>'
   '<button class="btn btn-pri sm">Change a light count</button></div>'),

 rescale,

 panel('Benchmark version history',
     tbl(['Version', 'Value', 'From', 'Why', 'Approved by'],
      [['<span class="mono">v2</span>', '<span class="mono">66.0%</span>', 'Jun 2026',
        'Management adjustment · CON-37 direction check passed', 'R. Nair (ops lead)'],
       ['<span class="mono">v1</span>', '<span class="mono">68.0%</span>', 'Mar 2025',
        'Commissioned from the 5-day baseline', 'Contract PF-2025-03']], wrapn=[3]) +
     '<span class="ts">Every value it has ever held, when, why, and who approved it. This is what '
     'a society is shown when they ask which benchmark their bill used (INV-02).</span>'),

 cols(''.join([
   panel('Light-count history',
     tbl(['When', 'Count', 'Trigger', 'Effect'],
      [['Jun 2026', '<span class="mono">162 → 210</span>', 'Installation scope change (SCR-063)',
        '<span class="mono">+₹1,640/mo</span>'],
       ['Mar 2025', '<span class="mono">162</span>', 'Survey confirmed', '—']], wrapn=[2]),
     ),
  ]),
  ''.join([
   panel('There is no third way to change a benchmark',
     '<p style="font-size:13px;color:var(--text-muted)">A benchmark moves by exactly two paths: a '
     '<b>deterministic rescale</b> from a light-count change (INV-07), or a <b>management decision</b> '
     'with CON-37’s direction-dependence enforced. There is deliberately no free-text benchmark '
     'field on this screen. A third control here would be the single easiest way to make a bill '
     'unauditable.</p>'),
   panel('Why this circuit was chosen',
     '<div style="display:flex;flex-direction:column;gap:5px;font-size:12.5px">' +
     ''.join('<div style="display:flex;gap:7px;align-items:flex-start">' + CK + '<span>' + t +
             '</span></div>' for t in
       ['54 lights on the circuit (≥50)', 'No shared appliances', 'LAN 26 m',
        'Fixtures at 9 ft', 'Not a driveway or ramp']) + '</div>'
     '<span class="ts" style="display:block;margin-top:9px">The CON-16 eligibility record from the '
     'survey, kept permanently. When someone asks in year four why <i>this</i> circuit represents '
     '420 lights, this is the answer.</span>'),
   panel('Meter history', rows2([
     ('EM-4472', 'Installed Mar 2025'),
     ('EM-3319', 'Replaced Dec 2025 · faulty CT'),
     ('Last reading', '<span class="mono">13 Aug, 06:02</span>')])),
  ]), '1.55fr 1fr'),
])

D.add('SCR-251', 'Circuit registry & configuration',
 'The definitive record of what each circuit is, what it represents, and what its benchmark has '
 'been over time — and the screen where INV-07 either holds or is quietly bypassed. Every '
 'destructive path is shaped by one idea: <b>show the consequence before committing it.</b> A '
 'light-count change opens a deterministic rescale that states the old and new count, the old and '
 'new benchmark, the rupee effect and the month it takes effect, and it refuses outright for a '
 'month already released. There is no free-text benchmark field anywhere on this screen, '
 'deliberately — a third way to change a benchmark would be the easiest possible way to make a '
 'bill unauditable.',
 sh('SCR-251', 'Portfolio › Brigade Cornerstone › Registry', 'Circuit registry',
    chip('neu', '4 circuits · 1,420 represented') +
    '<button class="btn btn-pri">Change a light count</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use', ban('info', 'i', '“Circuits are created when the survey is confirmed.” '
    'Links to SCR-014 rather than offering an add button that would create an unsourced circuit.')),
  ('Empty — filtered', '<span class="ts">Names the filter.</span>'),
  ('Partial / stale', chip('info', '1 circuit not yet benchmarked') +
    '<span class="ts">That row shows its commissioning progress instead of an empty benchmark cell '
    '— an empty cell reads as a missing value rather than as work in flight.</span>'),
  ('<b>Rescale blocked</b>', ban('bad', 'lock', '<b>July 2026 is released and cannot be changed</b> '
    '(INV-03). The rescale can take effect from September. If July is genuinely wrong it needs a '
    'correction and a v2 invoice, not an edit.')),
  ('Retire a circuit', ban('warn', 'warn', 'The modal names the billing effect: <b>this removes 210 '
    'represented lights and reduces the monthly fee by about ₹7,900 from September.</b> Blocked '
    'mid-month unless the month is reopened.')),
  ('Add a circuit', ban('info', 'i', 'A mid-term addition routes to a contract amendment (FLOW-17) '
    'rather than taking effect. <b>Never a silent scope increase</b> — the represented count is a '
    'contract term.')),
  ('Error — permission', '<span class="ts">Not an ops lead → the whole screen is read-only and says '
    'why, rather than showing controls that fail on click.</span>' + chip('neu', 'read-only · ops lead required')),
  ('Success', chip('ok', 'Rescaled · 468 represented from September 2026', 'tri') +
    '<span class="ts">The toast restates the new benchmark and its effective month, because the '
    'thing an operator needs to verify is what they just committed.</span>')))

# ================================================================ SCR-170
def vis(tone, title, sub):
    return '<div class="vis ' + tone + '"><b>' + title + '</b>' + sub + '</div>'

cal = ('<div class="cal">'
 '<div class="calr"><div class="calh">Team</div>'
 '<div class="calh">Mon 10</div><div class="calh">Tue 11</div><div class="calh">Wed 12</div>'
 '<div class="calh today">Thu 13</div><div class="calh">Fri 14</div></div>'

 '<div class="calr"><div class="calp">A. Kulkarni<span class="ts">Installer</span></div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 1') + '</div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 2') + '</div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 3') + '</div>'
 '<div class="calc">' + vis('warn', 'Settlement Vega', 'Install day 4 · blocked at gate') + '</div>'
 '<div class="calc">' + vis('neu', 'Settlement Vega', 'Install day 5') + '</div></div>'

 '<div class="calr"><div class="calp">D. Prasad<span class="ts">Installer</span></div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 1') + '</div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 2') + '</div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 3') + '</div>'
 '<div class="calc">' + vis('ok', 'Settlement Vega', 'Install day 4') + '</div>'
 '<div class="calc">' + vis('neu', 'Settlement Vega', 'Install day 5') + '</div></div>'

 '<div class="calr"><div class="calp">S. Reddy<span class="ts">Surveyor</span></div>'
 '<div class="calc">' + vis('ok', 'Mantri Serenity', 'Survey') + '</div>'
 '<div class="calc"></div>'
 '<div class="calc">' + vis('info', 'Brigade Cornerstone', 'Deviation visit · unaccepted 2 d') + '</div>'
 '<div class="calc">' + vis('ok', 'Sobha Dewflower', 'Survey') + '</div>'
 '<div class="calc"></div></div>'

 '<div class="calr"><div class="calp">N. Fernandes<span class="ts">Surveyor</span></div>'
 '<div class="calc"></div>'
 '<div class="calc">' + vis('ok', 'Prestige Ferns', 'Meter install') + '</div>'
 '<div class="calc">' + vis('ok', 'Prestige Ferns', 'Meter install') + '</div>'
 '<div class="calc"></div>'
 '<div class="calc">' + vis('neu', 'Unassigned', 'Capacity') + '</div></div></div>')

b = ''.join([
 cal,

 panel('Needs scheduling',
     tbl(['Visit', 'Society', 'Why now', 'Team', ''],
      [(['<b>Deviation investigation</b>', 'Brigade Cornerstone', 'Must conclude before the July close · 3 days',
        '<span class="ts">1 needed</span>', '<button class="btn btn-pri sm">Schedule</button>'], 'risk r-bad'),
       (['<b>Deviation investigation</b>', 'Settlement Nexus', 'Unexplained streak · blocked on a cause',
        '<span class="ts">1 needed</span>', '<button class="btn btn-sec sm">Schedule</button>'], 'risk r-warn'),
       ['Survey', 'Godrej Woodsman', 'New deal · offer waiting on light counts',
        '<span class="ts">2 needed</span>', '<button class="btn btn-sec sm">Schedule</button>'],
       ['Meter replacement', 'ASF Insignia', 'Gateway offline 11 days',
        '<span class="ts">1 needed</span>', '<button class="btn btn-sec sm">Schedule</button>']],
      wrapn=[2]) +
     '<span class="ts">Deviation investigations sort first because they are time-bound by the next '
     'close (FLOW-11) — everything else can slip a day without costing a month.</span>'),

 panel('Reschedule requests',
     tbl(['Who', 'Visit', 'Reason', ''],
      [['S. Reddy', 'Brigade Cornerstone · Wed', 'Society asked to move it — AGM',
        '<div style="display:flex;gap:5px"><button class="btn btn-pri sm">Accept</button>'
        '<button class="btn btn-sec sm">Counter</button></div>']], wrapn=[2])),

 grid(*[
   panel('Schedule · Brigade Cornerstone',
     ban('info', 'i', 'A visit assigns a <b>team</b>, not a person (CON-44). This is also where the '
       'area partition the field surface works within is seeded.') +
     '<div style="display:grid;grid-template-columns:1fr;gap:10px;margin-top:11px">' +
     field('Visit type', 'Deviation investigation') +
     field('Date', 'Friday 14 August 2026') +
     field('Team', 'S. Reddy  +  add') +
     field('Areas to cover', 'Tower B lift lobby', 'Optional — the field can partition on the day') +
     '</div>' +
     '<div style="display:flex;gap:8px;margin-top:11px">'
     '<button class="btn btn-pri">Schedule and notify</button>'
     '<button class="btn btn-sec">Cancel</button></div>'),
   panel('Access details',
     rows2([('Gate contact', 'M. Bhaskar · 98xxx'),
            ('Timings', '09:00 – 18:00, no Sunday work'),
            ('Restrictions', 'Basement access needs 24 h notice'),
            ('Parking', 'Visitor bay 4')]) +
     '<span class="ts" style="display:block;margin-top:9px">Pulled straight into the field data '
     'pack (CON-28a), so a technician standing at a gate is not phoning the office for it.</span>'),
   panel('Suspension check',
     ban('warn', 'warn', '<b>Settlement Nexus is 22 days into arrears.</b> At day 30 suspension is '
       'automatic and field servicing halts. A visit scheduled for the 5th of next month would be '
       'blocked on the day — the scheduler catches that here rather than at the gate.')),
  ]),
])

D.add('SCR-170', 'Field visit scheduler',
 'Put the right people on the right site on the right day. It <b>assigns a team, not a person</b> '
 '(CON-44) — a survey of a 1,500-light society is two people and an installation day is three — and '
 'it is the origin of the area partition the field surface then works within. The suspension check '
 'is here for a specific reason: a suspended society halts field servicing, and the right place to '
 'catch that is when someone schedules the visit, not when a technician is standing at the gate.',
 sh('SCR-170', 'Dispatch › Visit scheduler', 'Week of 10 August 2026',
    chip('warn', '4 unassigned') +
    '<button class="btn btn-sec">Previous week</button>'
    '<button class="btn btn-pri">Schedule a visit</button>', b),
 states(
  ('Loading', '<span class="ts">Skeleton calendar with the day columns already drawn.</span>' + SK),
  ('Empty — first use', ban('ok', 'tick', '“No visits needed this week.”')),
  ('Empty — filtered', '<span class="ts">Names the filter.</span>'),
  ('Partial / stale', chip('warn', 'Brigade Cornerstone visit unaccepted for 2 days') +
    '<span class="ts">Marked on the calendar with how long it has been waiting — a visit nobody '
    'accepted is not a scheduled visit.</span>'),
  ('<b>Suspended society</b>', ban('bad', 'x', '<b>Settlement Nexus is suspended for '
    'non-payment, so field servicing is on hold.</b> Readings and billing continue. Clear the '
    'arrears or record an exception to schedule this.') +
    '<span class="ts">Blocked, and the block names what is still running — otherwise ops assumes '
    'suspension stopped the billing too.</span>'),
  ('Removing someone with unsynced work',
    ban('warn', 'warn', 'A. Kulkarni has unsynced captures from today. Removing them from the '
      'roster is <b>warned, not blocked</b>, and their work still syncs — losing a completed site '
      'visit to a roster edit would be far worse than an untidy roster.')),
  ('Reassign within 24 h', ban('warn', 'cal', 'A modal for moves inside 24 hours only. Both parties '
    'are notified; outside that window a drag is just a drag.')),
  ('Third access failure', ban('bad', 'warn', 'Third blocked visit at this society — <b>escalated '
    'automatically</b> (FEAT-096 AC-5). A pattern of wasted trips is a commercial problem, not a '
    'scheduling one.')),
  ('Error — network', chip('bad', 'Could not save') + '<button class="btn btn-sec sm" '
    'style="align-self:flex-start">Retry</button>'),
  ('Success', chip('ok', 'Scheduled · S. Reddy notified', 'tri') +
    '<span class="ts">It appears on their SCR-171 immediately, and they accept independently.</span>')))

n, size = D.build('ops.html', 'Portfolio & Dispatch')
print('screens: %d  bytes: %d' % (n, size))
