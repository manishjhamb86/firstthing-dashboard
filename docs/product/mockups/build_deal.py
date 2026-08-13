# -*- coding: utf-8 -*-
from _base import I, CK, CU, SK, make, states, Deck

NAV=[('grid','Ops home','',''),
 ('__g','Pipeline','',''),
 ('funnel','Pipeline','SCR-003','15'),
 ('pen','New lead','SCR-001',''),
 ('doc','Proposals','SCR-002',''),
 ('__g','Deal','',''),
 ('clip','Surveys','SCR-014','3'),
 ('zap','Commissioning','SCR-025','2'),
 ('chart','Demo reports','SCR-030',''),
 ('tick','KYC','SCR-040','4'),
 ('inv','Offers','SCR-050',''),
 ('__g','Contract','',''),
 ('cal','Agreements','SCR-052','1'),
 ('lock','Contracts','SCR-053',''),
 ('__g','Delivery','',''),
 ('hard','Installation','SCR-060',''),
 ('warn','Blockers','SCR-063','2')]
sh = make(NAV)

def chip(t,txt,sp='dot'):
    return '<span class="chip %s"><span class="%s"></span>%s</span>'%(t,sp,txt)
def ban(t,ic,html):
    return '<div class="ban %s">%s<div>%s</div></div>'%(t,I[ic],html)
def tbl(heads,rows,foot=None,align=None,wrap=None):
    align = align or []; wrap = wrap or []
    def cc(i):
        c=[]
        if i in align: c.append('ta-r')
        if i in wrap: c.append('wrap')
        return ' class="%s"'%' '.join(c) if c else ''
    th=''.join('<th%s>%s</th>'%(cc(i),h) for i,h in enumerate(heads))
    body=[]
    for r in rows:
        cls=''
        if isinstance(r,tuple): r,cls=r
        tds=''.join('<td%s>%s</td>'%(cc(i),c) for i,c in enumerate(r))
        body.append('<tr%s>%s</tr>'%(' class="%s"'%cls if cls else '',tds))
    ft=''
    if foot:
        ft='<tfoot><tr class="tfoot">%s</tr></tfoot>'%''.join(
            '<td%s>%s</td>'%(' class="ta-r"' if i in align else '',c) for i,c in enumerate(foot))
    return '<div class="tw"><table class="t"><thead><tr>%s</tr></thead><tbody>%s</tbody>%s</table></div>'%(th,''.join(body),ft)
def kpis(items):
    return '<div class="kpis">%s</div>'%''.join(
      '<div class="card"><span class="lbl">%s</span><span class="v">%s</span><span class="ts">%s</span></div>'%i for i in items)
def panel(title, inner, right=''):
    hd='<div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3>%s</h3>%s</div>'%(title,right)
    return '<div class="panel">%s%s</div>'%(hd,inner)
def grid(*panels, **kw):
    m = kw.get('m',240)
    return ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(%dpx,1fr));'
            'gap:11px;align-items:start">%s</div>')%(m,''.join(panels))

def cols(a,b,ratio='1.6fr 1fr'):
    # each side must be ONE grid child, or grid auto-placement interleaves the two columns
    w = lambda x: '<div style="display:flex;flex-direction:column;gap:11px;min-width:0">%s</div>'%x
    return ('<div class="cols2" style="display:grid;grid-template-columns:%s;gap:11px;align-items:start">'
            '%s%s</div>')%(ratio,w(a),w(b))
def field(label,val,note='',w=''):
    n='<span class="ts">%s</span>'%note if note else ''
    return '<div class="field"%s><label>%s</label><div class="inp">%s</div>%s</div>'%(
        ' style="%s"'%w if w else '',label,val,n)
def rows2(pairs):
    out=[]
    for k,v in pairs:
        out.append('<div style="display:flex;justify-content:space-between;gap:14px;padding:5px 0;'
                   'border-bottom:1px solid var(--border-subtle)"><span class="mut" style="font-size:12.5px">%s</span>'
                   '<span style="font-size:12.5px;text-align:right">%s</span></div>'%(k,v))
    return '<div>%s</div>'%''.join(out)

D = Deck('Prototype 2 of 6 · SUR-01 back office',
  'Deal loop',
  'Twelve screens, flows 01–08 — lead to installation. Run once per society per service line. '
  'Where the monthly loop is judged on throughput, this one is judged on not letting a bad deal through: '
  'every mistake here is inherited by the contract and paid for monthly for its whole term. '
  'The deck walks a single real-shaped deal — Prestige Ferns, Whitefield, 1,240 flats — from the '
  'lead form in March to a live installation blocker today.')

# ---------------------------------------------------------------- SCR-001
b = ''.join([
 ban('bad','warn','<b>640 flats is below the 1,000-flat minimum.</b> 1,000 flats is the minimum for the '
     'economics to work. This one has 640. You can save the lead, but it needs a management override to '
     'go further.<div style="margin-top:8px;display:flex;gap:7px"><button class="btn btn-sec sm">Request size override</button>'
     '<button class="btn btn-ghost sm">Why this limit?</button></div>'),
 cols(
   panel('Society & deal', ''.join([
     '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px">',
     field('Society','Zenith Meadows Residency','Not in the directory — will be created on save'),
     field('Service line','Lighting','Pipeline is keyed (society, service line) — CON-24'),
     field('City','Sarjapur, Bengaluru'),
     field('Flat count','640','<span style="color:var(--bad-fg)">Below the NG-06 minimum</span>'),
     '</div>',
     '<div style="height:1px;background:var(--border-subtle);margin:2px 0"></div>',
     '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px">',
     field('Contact name','R. Venkatesh'),
     field('Phone','98450 22107'),
     field('Email','secretary@zenithmeadows.in'),
     '</div>',
     '<span class="ts">At least one channel is required — the proposal has to reach someone.</span>',
     '<div style="height:1px;background:var(--border-subtle);margin:2px 0"></div>',
     field('Owner','Sunita Rao (you)','Logging on behalf of someone else creates the lead as pending-approval'),
   ])),
   panel('What happens on save', ''.join([
     rows2([('Stage','<span class="chip neu"><span class="dot"></span>lead</span>'),
            ('Advancement','<span class="chip bad"><span class="dot"></span>blocked — NG-06</span>'),
            ('Duplicate check','<span class="chip ok"><span class="tri"></span>clear</span>'),
            ('Record','New society + pipeline')]),
     '<p class="ts" style="margin-top:4px">The block is on advancement, not on capture. Losing the record of '
     'a small society that might merge or expand later would be worse than holding it.</p>',
   ])), '1.7fr 1fr'),
])
D.add('SCR-001','Lead form','Creates a pipeline record with the two checks that stop a deal that should never '
 'start. Both gates fire <b>live</b>, as soon as the field they depend on resolves — not on submit, when '
 'the user has already committed.',
 sh('SCR-001','Pipeline › New lead','New lead',
    '<button class="btn btn-ghost">Cancel</button><button class="btn btn-pri">Save lead</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use','<span class="ts">The form, with both gates dormant.</span>'+
    '<div class="field"><label>Society</label><div class="inp mut">Search or add…</div></div>'),
  ('Empty — filtered','<span class="ts">Not applicable — this is a create form.</span>'),
  ('Duplicate gate (CON-24)', ban('warn','warn','<b>Settlement Nexus already has an open lighting deal at '
    'Offer stage.</b><div class="ts" style="margin-top:3px;color:inherit;opacity:.85">Owner Arjun Mehta · '
    '41 days old</div><div style="margin-top:7px"><button class="btn btn-sec sm">Open that deal</button></div>')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Save failed</span>'
    '<span class="ts">Nothing was lost — the form keeps everything.</span><button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Read-only role → SCR-221.</span>'),
  ('Success','<span class="chip ok"><span class="tri"></span>Lead saved</span><span class="ts">→ SCR-003, '
    'new row highlighted.</span>')))

# ---------------------------------------------------------------- SCR-002
def comprow(nm,fl,city,pct,tag,anon=False):
    return ('<div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;'
      'padding-bottom:7px;border-bottom:1px solid var(--border-subtle)">'
      '<div style="min-width:0"><div class="%s" style="font-size:12.5px">%s</div>'
      '<div class="ts">%s flats · %s</div></div>'
      '<div style="text-align:right;flex:none"><div class="mono" style="font-size:13.5px;font-weight:620">%s</div>'
      '<div style="margin-top:3px">%s</div></div></div>')%('mut' if anon else 'nm',nm,fl,city,pct,tag)
comps = '<div style="display:flex;flex-direction:column;gap:8px">'+''.join([
  comprow('ASF Insignia','1,680','Gurugram','71.0%',chip('ok','consented','tri')),
  comprow('Brigade Cornerstone','2,240','Whitefield','68.2%',chip('ok','consented','tri')),
  comprow('A 1,510-flat society in Bengaluru','1,510','Bengaluru','66.4%',chip('neu','anonymised'),True),
  comprow('A 1,240-flat society in Bengaluru','1,240','Bengaluru','70.1%',chip('neu','anonymised'),True),
])+'</div>'
b = ''.join([
 cols(
  panel('Proposal', ''.join([
    '<div class="field"><label>Indicative savings range</label>'
    '<div style="display:flex;gap:7px;flex-wrap:wrap">'
    '<span class="fc">58–66%</span><span class="fc on">62–70%</span><span class="fc">66–74%</span>'
    '<span class="fc" style="opacity:.45">Type a number</span></div>'
    '<span class="ts">Picked from what comparable societies actually achieved — not typed. '
    'The proposal prints the basis: <i>“Based on measured results at four comparable societies.”</i></span></div>',
    '<div style="height:1px;background:var(--border-subtle)"></div>',
    '<div class="field"><label>Narrative</label>'
    '<div style="border:1px solid var(--field-border);border-radius:var(--r-sm);background:var(--surface)">'
    '<div style="display:flex;gap:2px;padding:5px 7px;border-bottom:1px solid var(--border-subtle);color:var(--text-subtle);font-size:12px">'
    '<span style="padding:2px 6px;font-weight:700">B</span><span style="padding:2px 6px;font-style:italic">I</span>'
    '<span style="padding:2px 6px">•</span><span style="padding:2px 6px">1.</span><span style="padding:2px 6px">“</span></div>'
    '<div style="padding:10px 11px;font-size:13px;display:flex;flex-direction:column;gap:7px">'
    '<b>What we do</b><span class="mut">FirsThing installs and owns metered LED lighting across your common '
    'areas at our cost. You pay nothing upfront and nothing for the hardware — we are paid a share of the '
    'electricity you stop buying, measured against a benchmark we establish together before anything is billed.</span>'
    '<b>What Prestige Ferns can expect</b><span class="mut">Societies of comparable size in Bengaluru have '
    'measured savings of 66–71% on common-area lighting. We are quoting 62–70% here because your podium '
    'and landscape circuits run longer hours than…</span></div></div></div>',
    '<div style="height:1px;background:var(--border-subtle)"></div>',
    '<div><span class="lbl">Commercial outline</span>'+rows2([
      ('Revenue share','58 / 42 · society / FirsThing'),
      ('Upfront cost','₹0 — hardware installed and owned by FirsThing'),
      ('Term','7 years'),
      ('AMC','Included for the full term')])+
    '<p class="ts" style="margin-top:5px">Indicative only. The binding version is the offer (SCR-050), '
    'built after commissioning measures the real numbers.</p></div>',
  ])),
  ''.join([
   panel('Comparables', comps + '<span class="ts">Live query on similar flat count and city. Two of these '
      'four consented to be named as references; the rest appear anonymised.</span>'),
      panel('Share', ''.join([
     rows2([('K. Ramamurthy · Secretary','<span class="mono ts">ramamurthy@…</span> '+CK),
            ('S. Iyer · Treasurer','<span class="mono ts">iyer.s@…</span> '+CK),
            ('M. Bhaskar · Manager','<span class="mono ts">mgr@prestigeferns…</span> '+CU)]),
     '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-pri sm">Share by email</button>'
     '<button class="btn btn-sec sm">Download PDF</button></div>',
     '<span class="ts">WhatsApp and in-person delivery stay manual at launch — download the PDF and record '
     'the share afterwards.</span>'])),
  ]), '1.5fr 1fr'),
])
D.add('SCR-002','Proposal editor','The first thing a committee reads — and at this point no live demo exists, '
 'so any savings figure is <b>a claim, not evidence</b>. The screen lets sales be persuasive without letting them '
 'fabricate, by making comparables the only source of an indicative figure.',
 sh('SCR-002','Pipeline › Prestige Ferns › Proposal','Proposal · Prestige Ferns',
    '<span class="chip neu"><span class="dot"></span>draft · v2</span><span class="ts">Autosaved 12:04</span>'
    '<button class="btn btn-sec">Preview</button><button class="btn btn-pri">Share</button>', b),
 states(
  ('Loading', SK),
  ('Empty — first use','<span class="ts">Template with the sections outlined and comparables loaded.</span>'),
  ('Empty — no comparables', ban('info','i','No comparable societies yet. The proposal will quote the '
    'contracted 60–80% range instead.')),
  ('Partial — shared then edited', ban('warn','warn','Shared on 4 Aug. Edits since then have not been sent.'
    '<div style="margin-top:6px"><button class="btn btn-sec sm">Re-share</button></div>')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Save failed</span><span class="ts">Draft kept locally.</span>'),
  ('Error — permission','<span class="ts">Read-only, with a note naming the owner: <b>Arjun Mehta</b>.</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Request access</button>'),
  ('Success — shared','<span class="chip ok"><span class="tri"></span>Shared with 2 recipients</span>'
    '<span class="ts">Timeline entry written → SCR-180.</span>')))

# ---------------------------------------------------------------- SCR-003
def dcard(name,flats,meta,health,extra=''):
    tone={'healthy':'ok','slowing':'warn','stalled':'bad'}[health]
    acc={'healthy':'var(--ok-fg)','slowing':'var(--warn-fg)','stalled':'var(--bad-fg)'}[health]
    return ('<div style="background:var(--surface);border:1px solid var(--border);border-left:3px solid %s;'
      'border-radius:var(--r-sm);padding:8px 10px;display:flex;flex-direction:column;gap:4px;box-shadow:var(--e1)">'
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">'
      '<span class="nm" style="font-size:12.5px">%s</span><span class="ts mono">%s</span></div>'
      '<span class="ts">%s</span>%s'
      '<div style="display:flex;gap:5px;align-items:center;margin-top:2px">%s'
      '<button class="btn btn-ghost sm" style="margin-left:auto;padding:2px 6px">+ follow-up</button></div></div>')%(
      acc,name,flats,meta,extra,chip(tone,health))
COLS=[('Lead','3',[dcard('Zenith Meadows','640','Sunita Rao · 6d','stalled',
        '<span class="chip bad" style="align-self:flex-start"><span class="dot"></span>size override needed</span>'),
      dcard('Aditya Mega City','1,880','Arjun Mehta · 3d','healthy'),
      dcard('Sobha Dream Acres','2,100','Arjun Mehta · 1d','healthy',
        '<span class="chip info" style="align-self:flex-start"><span class="dot"></span>owner unconfirmed</span>')]),
 ('Proposal','4',[dcard('Purva Riviera','1,320','Sunita Rao · 41d','stalled',
        '<span class="ts" style="color:var(--bad-fg)">5 follow-ups, 41 days at Proposal. Nothing has moved since 2 Jul.</span>'),
      dcard('Settlement Nexus','1,420','Arjun Mehta · 22d','slowing','<span class="ts">3 follow-ups, no advancement</span>'),
      dcard('Godrej Woodsman','1,150','Sunita Rao · 9d','healthy'),
      dcard('Adarsh Palm Retreat','990','Arjun Mehta · 4d','healthy')]),
 ('Demo','2',[dcard('ASF Insignia','1,680','Priya Nair · 12d','healthy'),
      dcard('Salarpuria Greenage','1,240','Priya Nair · 26d','slowing','<span class="ts">3 follow-ups</span>')]),
 ('Commissioning','2',[dcard('Mantri Espana','1,510','Priya Nair · 18d','healthy','<span class="ts">4 of 4 benchmarked</span>'),
      dcard('Settlement Vega','1,340','Priya Nair · 47d','stalled','<span class="ts" style="color:var(--bad-fg)">Baseline restarted 3×</span>')]),
 ('Offer','2',[dcard('Brigade Cornerstone','2,240','Arjun Mehta · 7d','healthy','<span class="ts">v2 sent 6 Aug</span>'),
      dcard('Century Renata','1,090','Sunita Rao · 24d','slowing')]),
 ('Agreement','1',[dcard('Shriram Chirping Woods','1,260','Sunita Rao · 11d','healthy','<span class="ts">With notary</span>')]),
 ('Installation','1',['<div style="background:var(--accent-subtle);border:1px solid var(--accent-line);'
      'border-left:3px solid var(--accent);border-radius:var(--r-sm);padding:8px 10px;display:flex;'
      'flex-direction:column;gap:4px">'
      '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline">'
      '<span class="nm" style="font-size:12.5px;color:var(--accent)">Prestige Ferns</span><span class="ts mono">1,240</span></div>'
      '<span class="ts">Priya Nair · day 4 of 7</span>'
      '<span class="chip bad" style="align-self:flex-start"><span class="dot"></span>2 blockers</span></div>'])]
board='<div style="display:grid;grid-template-columns:repeat(7,minmax(178px,1fr));gap:9px;overflow-x:auto;padding-bottom:4px">'
for name,n,cards in COLS:
    board+=('<div style="display:flex;flex-direction:column;gap:7px;min-width:178px">'
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px">'
      '<span class="lbl">%s</span><span class="ts mono">%s</span></div>%s</div>')%(name,n,''.join(cards))
board+='</div>'
b=''.join([
 kpis([('Open deals','15','across 4 owners'),
       ('Weighted value','₹2.81 Cr','annual, at stage probability'),
       ('Need attention','6','3 stalled · 3 slowing'),
       ('Median age','19d','in current stage')]),
 '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">'
 '<div class="seg"><button aria-pressed="true">Board</button><button aria-pressed="false">Table</button></div>'
 '<div class="fil"><span class="fc on">Open deals</span><span class="fc">All owners</span>'
 '<span class="fc">Lighting</span><span class="fc">Any health</span><span class="fc">Any age</span></div>'
 '<span class="ts" style="margin-left:auto">Health is computed from the follow-up counter and days in stage — CON-23</span></div>',
 board,
 ban('info','i','<b>Health is computed, not set.</b> <span class="mono">healthy</span> while a deal is moving, '
   '<span class="mono">slowing</span> at 3+ follow-ups in one stage with no advancement, '
   '<span class="mono">stalled</span> at 5+ or past twice the median for that stage. The follow-up counter is '
   'the input — which only works if follow-ups get logged, so logging one is a single click on the card, '
   'never a form.'),
])
D.add('SCR-003','Pipeline board','Every open deal, its stage, and — the reason this is more than a list — '
 'which ones are quietly dying. FEAT-031 (lead health) was cited by no screen until a coverage check caught it.',
 sh('SCR-003','Pipeline','Pipeline',
    '<button class="btn btn-sec">Export</button><button class="btn btn-pri">New lead</button>', b),
 states(
  ('Loading','<span class="ts">Skeleton board — column headers and card outlines.</span>'+SK),
  ('Empty — first use','<div class="empty"><b>No deals yet.</b><span class="ts">Log your first lead to start '
    'the pipeline.</span><button class="btn btn-pri sm">New lead</button></div>'),
  ('Empty — filtered','<div class="empty"><span class="ts">No deals match <b>Health: stalled</b> + '
    '<b>Owner: Priya Nair</b>.</span><button class="btn btn-sec sm">Clear filters</button></div>'),
  ('Partial / stale','<span class="ts">Not applicable — single source, no partial state.</span>'),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Could not refresh</span>'
    '<span class="ts">Last loaded 14:20 — the board keeps showing it.</span>'),
  ('Error — permission','<span class="ts">Society-scoped user → SCR-221.</span>'),
  ('Gate blocks an advance', ban('bad','x','Cannot advance to Agreement — <b>KYC has 2 outstanding items.</b>'))))

# ---------------------------------------------------------------- SCR-014
inv = tbl(['Area','Light type','Count','Counted by','When','Photos','Provenance'],
 [['Tower A · corridors L1–L16','Corridor & staircase','<span class="mono">380</span>','Ravi Kulkarni','8 Apr 09:12','4',chip('ok','single count','tri')],
  ['Tower B · corridors','Corridor & staircase','<span class="mono">148</span>','Anita Desai','8 Apr 10:40','3',chip('ok','single count','tri')],
  (['Tower C · corridors','Corridor & staircase','<span class="mono">92</span>','Ravi K. + Anita D.','8 Apr 11:05','5',
    chip('warn','reconciled from 2 counts')],'risk r-warn'),
  ['Basement A','Basement parking','<span class="mono">180</span>','Anita Desai','8 Apr 12:20','6',chip('ok','single count','tri')],
  ['Basement B','Basement parking','<span class="mono">160</span>','Anita Desai','8 Apr 12:55','4',chip('ok','single count','tri')],
  ['Lift lobbies · all towers','Lift lobby','<span class="mono">180</span>','Ravi Kulkarni','8 Apr 14:10','8',chip('ok','single count','tri')],
  ['Podium & landscape','Podium & landscape','<span class="mono">60</span>','Ravi Kulkarni','8 Apr 15:30','3',chip('ok','single count','tri')]],
 foot=['<b>Total represented light count</b>','','<span class="mono">1,200</span>','','','<span class="mono">33</span>',''],
 align=[2,5])

def crit(ok,txt):
    return '<div style="display:flex;gap:6px;align-items:center;font-size:12px;color:%s">%s<span>%s</span></div>'%(
      'var(--ok-fg)' if ok else 'var(--bad-fg)',
      '<span style="width:13px;height:13px;flex:none">%s</span>'%(I['tick'] if ok else I['x']),txt)
def circuit(lt,cir,cnt,crits,extra,badge,typ):
    return ('<div style="border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);'
      'padding:11px 12px;display:flex;flex-direction:column;gap:8px;box-shadow:var(--e1)">'
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">'
      '<div><span class="nm">%s</span><div class="ts">Circuit: <span class="mono">%s</span> · represents '
      '<span class="mono">%s</span> lights</div></div>%s</div>'
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(196px,1fr));gap:4px 12px">%s</div>'
      '%s'
      '<div style="display:flex;gap:7px;align-items:flex-start;padding-top:7px;border-top:1px solid var(--border-subtle)">'
      '%s<div style="font-size:12px"><b>Is this circuit typical of the lights it represents?</b>'
      '<div class="ts" style="margin-top:2px">%s</div></div></div></div>')%(
      lt,cir,cnt,badge,''.join(crits),extra,CK,typ)
circuits=''.join([
 circuit('Corridor &amp; staircase','TowerA/DB-3/L3-corr','620',
   [crit(1,'62 lights on circuit (≥50)'),crit(1,'No shared appliances'),crit(1,'LAN 24 m'),
    crit(1,'Fixtures at 10 ft (≤15)'),crit(1,'Not on a driveway or ramp')],'',
   chip('ok','eligible','tri'),
   'Ravi: “L3 is a mid-block corridor on the same timer and fitting spec as every other corridor level.”'),
 circuit('Basement parking','BsmtB/DB-1/bay-3','340',
   [crit(1,'58 lights on circuit (≥50)'),crit(1,'No shared appliances'),crit(1,'LAN 31 m'),
    crit(1,'Fixtures at 9 ft (≤15)'),crit(1,'Bay 3 — not the ramp')],'',chip('ok','eligible','tri'),
   'Ravi: “Bay 3 runs the same 24h profile as A and B. Ramp fittings are excluded deliberately.”'),
 circuit('Lift lobby','TowerB/DB-2/lobby','180',
   [crit(0,'41 lights on circuit — below 50'),crit(1,'No shared appliances'),crit(1,'LAN 18 m'),
    crit(1,'Fixtures at 8 ft (≤15)'),crit(1,'Not on a driveway or ramp')],'',
   chip('warn','&lt;50-light exception granted'),
   'Anita: “No lobby circuit anywhere on site reaches 50. Exception granted by Priya Nair, 1 Jul — '
   'lobby fittings are identical across all three towers.”'),
 circuit('Podium &amp; landscape','Podium/DB-4/land','60',
   [crit(1,'52 lights on circuit (≥50)'),crit(1,'No shared appliances'),crit(1,'LAN 38 m — near the limit'),
    crit(1,'Fixtures at 12 ft (≤15)'),crit(1,'Not on a driveway or ramp')],'',chip('ok','eligible','tri'),
   'Ravi: “Longest burn hours on site. Typical of landscape lighting, not of the towers — which is exactly '
   'why it gets its own circuit.”'),
])
b=''.join([
 ban('warn','users','<b>Team survey — one contested area was resolved in the field.</b> '
   '<span class="mono">Tower C · corridors</span>: Ravi Kulkarni counted 88, Anita Desai counted 92. '
   'Resolved to <b>92</b> by joint recount on site, 8 Apr 11:05, recorded by Ravi Kulkarni. '
   'No areas were left uncovered. <div class="ts" style="margin-top:4px;color:inherit;opacity:.85">'
   'That judgement is now part of the count this screen is signing off, so it is stated rather than absorbed.</div>'),
 panel('Lighting inventory by area', inv +
   '<span class="ts">This is the number that decides billing for the term. A miscount here propagates into '
   '<span class="mono">representedLightCount</span> and biases every invoice — no downstream check catches it.</span>'),
 cols(panel('Circuit selection · one per light type',
     '<div style="display:flex;flex-direction:column;gap:9px">'+circuits+'</div>'),
  ''.join([
   panel('Society profile', rows2([
     ('Coordinates','<span class="mono ts">12.9698, 77.7500</span>'),
     ('Committee','7 members, posts recorded'),
     ('Secretary','K. Ramamurthy'),
     ('Treasurer','S. Iyer'),
     ('RWA members','1,118 of 1,240 flats'),
     ('Next election','<b>14 Mar 2027</b>')]) +
     '<span class="ts">Election date matters — a committee changing mid-negotiation is a real risk.</span>'),
      panel('Pump audit', rows2([
     ('Borewell pump 1','7.5 HP · photo ✓'),
     ('Borewell pump 2','7.5 HP · photo ✓'),
     ('STP transfer pump','5 HP · photo ✓'),
     ('Booster set','3 × 3 HP · photo ✓')]) +
     '<span class="ts">Captured for a future water service line — not part of this lighting deal.</span>'),
      panel('Completeness', ''.join([
     rows2([('Areas captured','7 of 7'),('Photos','33'),('Committee list','captured'),
            ('Pump audit','captured'),('Circuits confirmed','4 of 4')]),
     '<div class="mtr"><i style="width:100%"></i></div>',
     '<div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:4px">'
     '<button class="btn btn-sec sm">Query a count</button><button class="btn btn-sec sm">Request re-visit</button></div>',
   ])),
  ]),'1.65fr 1fr'),
 ban('info','lock','<b>Confirming locks the circuit set.</b> “Locking 1,200 lights across 4 types. These counts '
   'set the billing basis for the whole term and are not routinely revisited.”'),
])
D.add('SCR-014','Survey review &amp; circuit confirmation','<b>The highest-leverage review in the product.</b> '
 'Nothing later catches an error confirmed here — a lighting miscount propagates into '
 '<span class="mono">representedLightCount</span> and biases billing for the whole term. Note what the screen '
 'refuses to hide: who counted each area, and how a disagreement was settled.',
 sh('SCR-014','Surveys › Prestige Ferns','Survey review · Prestige Ferns',
    '<span class="chip info"><span class="dot"></span>submitted 8 Apr</span>'
    '<button class="btn btn-sec">Query</button><button class="btn btn-pri">Confirm survey</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<span class="ts">Not reachable without a survey.</span>'),
  ('Empty — partial survey','<span class="ts">Sections present, gaps named per section:</span>'+
    ban('warn','warn','Committee list not captured.')),
  ('Partial / stale', ban('info','wifi','The surveyor has unsynced changes. Polling every 60s.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Load failed</span>'
   '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Not ops → SCR-221.</span>'),
  ('No eligible circuit', ban('bad','x','<b>No eligible circuit for Podium &amp; landscape.</b> Exclude the '
    'light type from the deal, or grant a &lt;50-light exception. Both need a reason. Neither may be silent.'))))

# ---------------------------------------------------------------- SCR-025
def track(steps, done):
    out=[]
    for i,s in enumerate(steps):
        st = 'done' if i<done else ('now' if i==done else 'todo')
        bg = {'done':'var(--ok-bg)','now':'var(--accent-subtle)','todo':'var(--surface-sunken)'}[st]
        fg = {'done':'var(--ok-fg)','now':'var(--accent)','todo':'var(--text-subtle)'}[st]
        bd = {'done':'var(--ok-line)','now':'var(--accent-line)','todo':'var(--border)'}[st]
        mk = '<span style="width:11px;height:11px;display:block">%s</span>'%I['tick'] if st=='done' else (
             '<span style="width:6px;height:6px;border-radius:50%;background:currentColor"></span>')
        out.append('<div style="display:flex;align-items:center;gap:5px;padding:4px 9px;border-radius:var(--r-pill);'
          'background:%s;color:%s;border:1px solid %s;font-size:11.5px;font-weight:600;white-space:nowrap">%s%s</div>'%(
          bg,fg,bd,mk,s))
    return ('<div style="display:flex;gap:5px;flex-wrap:wrap;align-items:center">%s</div>'%
      '<span style="color:var(--text-subtle)">›</span>'.join(out))
STEPS=['Meter','Load check','Gate pass','5-day baseline','Swap','5-day post','Benchmark']
def cir(name,cnt,done,badge,detail,extra=''):
    return ('<div style="border:1px solid var(--border);border-radius:var(--r-md);background:var(--surface);'
      'box-shadow:var(--e1);padding:11px 12px;display:flex;flex-direction:column;gap:9px">'
      '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">'
      '<div><span class="nm">%s</span> <span class="ts">· represents <span class="mono">%s</span> lights</span></div>%s</div>'
      '%s<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:5px 14px">%s</div>%s</div>')%(
      name,cnt,badge,track(STEPS,done),detail,extra)
def dd(k,v,tone=''):
    c=' style="color:%s"'%tone if tone else ''
    return '<div style="display:flex;justify-content:space-between;gap:8px;font-size:12.5px;border-bottom:1px solid var(--border-subtle);padding:3px 0"><span class="mut">%s</span><span%s>%s</span></div>'%(k,c,v)
b=''.join([
 '<div style="display:flex;gap:11px;flex-wrap:wrap;align-items:center">'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Deal readiness</span>'
 '<span class="v">3 of 4</span><span class="ts">circuits benchmarked</span></div>'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Blocking circuit</span>'
 '<span class="v" style="font-size:15px;font-family:var(--ui)">Podium &amp; landscape</span>'
 '<span class="ts">day 3 of 5 · restarted twice</span></div>'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Days in commissioning</span>'
 '<span class="v">39</span><span class="ts">since 14 Apr</span></div>'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Projected blended</span>'
 '<span class="v">69.1%</span><span class="ts">on 3 of 4 measured</span></div></div>',
 ban('warn','i','<b>One circuit stalling is not the deal stalling.</b> Since CON-11, commissioning runs '
   'independently per circuit — each with its own 5-day baseline and its own anomaly-restart clock. '
   'The deal cannot price until all four have a benchmark, and the screen states both facts at once rather '
   'than collapsing them into one status.'),
 '<div style="display:flex;flex-direction:column;gap:9px">',
 cir('Corridor &amp; staircase','620',7,chip('ok','68.4% · benchmarked','tri'),
   dd('Load check','theoretical 13.6 kW vs measured 13.1 kW · −3.7%','var(--ok-fg)')+
   dd('Baseline','5 of 5 days · 18–22 Apr')+dd('Post-swap','5 of 5 days · 24–28 Apr')+
   dd('Gate passes','install ✓ · swap ✓')+dd('Benchmark','68.4% · within 60–80%','var(--ok-fg)')+
   dd('Restarts','none')),
 cir('Basement parking','340',7,chip('ok','71.2% · benchmarked','tri'),
   dd('Load check','theoretical 7.9 kW vs measured 8.6 kW · +8.9%','var(--warn-fg)')+
   dd('Baseline','5 of 5 days · 21–25 Apr')+dd('Post-swap','5 of 5 days · 27 Apr–1 May')+
   dd('Gate passes','install ✓ · swap ✓')+dd('Benchmark','71.2% · within 60–80%','var(--ok-fg)')+
   dd('Restarts','none')),
 cir('Lift lobby','180',7,chip('ok','68.0% · benchmarked','tri'),
   dd('Load check','theoretical 4.1 kW vs measured 4.6 kW · +12.2%','var(--bad-fg)')+
   dd('Override','PER-01 override by Priya Nair, 26 Apr','var(--warn-fg)')+
   dd('Baseline','5 of 5 days · 27 Apr–1 May')+dd('Post-swap','5 of 5 days · 3–7 May')+
   dd('Benchmark','68.0% · within 60–80%','var(--ok-fg)')+dd('Restarts','none'),
   ban('warn','warn','Load check failed at +12.2%, outside CON-17’s ±10%. Overridden by Priya Nair on 26 Apr — '
     '“Lobby DB also feeds two signage boxes that could not be isolated; measured delta accounted for.” '
     'The override is on the record, not folded into the result.')),
 cir('Podium &amp; landscape','60',3,chip('warn','day 3 of 5 · restarted twice'),
   dd('Load check','theoretical 1.4 kW vs measured 1.4 kW · +1.1%','var(--ok-fg)')+
   dd('Baseline','<b>day 3 of 5</b> · from 11 May')+dd('Post-swap','not started')+
   dd('Gate passes','install ✓ · swap pending')+dd('Benchmark','—')+
   dd('Restarts','<b>2</b> · 3 May, 10 May','var(--bad-fg)'),
   '<div style="border:1px solid var(--border-subtle);border-radius:var(--r-sm);background:var(--surface-sunken);padding:9px 10px">'
   '<span class="lbl">Restart history</span>'
   '<div style="font-size:12.5px;margin-top:5px;display:flex;flex-direction:column;gap:3px">'
   '<div><span class="mono ts">3 May</span> — connectivity gap, 14h. Count restarted from the midnight after the fix.</div>'
   '<div><span class="mono ts">10 May</span> — irrigation timer switched onto the circuit by the gardener. '
   'Removed 10 May, count restarted 11 May.</div></div>'
   '<p class="ts" style="margin-top:6px">A circuit on its third attempt is a different situation from one on '
   'day 3 of its first. Two restarts in eight days is the signal that the circuit itself is the problem — '
   'which is why the count never appears without its history.</p>'
   '<div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap">'
   '<button class="btn btn-sec sm">Investigate anomaly</button>'
   '<button class="btn btn-sec sm">Exclude this circuit</button></div></div>'),
 '</div>',
 ban('bad','x','<b>Proceed to demo report is blocked.</b> Podium &amp; landscape has no benchmark yet. '
   'The button names what is outstanding rather than greying out silently.'),
])
D.add('SCR-025','Deal commissioning status','The fan-out <i>is</i> the screen. Four circuits, four independent '
 '5-day clocks, four independent restart histories — and one deal-level readiness number that must not '
 'let a single stalled circuit read as a stalled deal, or vice versa.',
 sh('SCR-025','Commissioning › Prestige Ferns','Commissioning · Prestige Ferns',
    '<span class="chip info"><span class="dot"></span>polling · 5 min</span>'
    '<button class="btn btn-sec">Schedule visit</button>'
    '<button class="btn btn-pri" disabled>Proceed to demo report</button>', b),
 states(
  ('Loading','<span class="ts">Skeleton trackers, one per circuit.</span>'+SK),
  ('Empty — first use','<span class="ts">All circuits at step 1, awaiting the install visit.</span>'+
    track(STEPS,0)),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Partial / stale','<span class="ts">CMP-17 freshness pill per circuit:</span>'+
    chip('ok','readings 6 min ago','tri')+chip('warn','readings 3 h ago')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Load failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Out-of-range benchmark', ban('bad','warn','Lift lobby measured <b>84%</b>, above the 60–80% range. '
    'Accept it explicitly or exclude the circuit. It will not be averaged away.')),
  ('Success — all benchmarked', ban('ok','tick','All 4 circuits benchmarked. Ready for the demo report.'))))

# ---------------------------------------------------------------- SCR-030
extrap = tbl(['Light type','Measured %','Days','Restarts','Lights','Annual baseline kWh','Projected saved kWh'],
 [['<span class="nm">Corridor &amp; staircase</span>','<span class="mono">68.4%</span>','5 + 5','—','<span class="mono">620</span>','<span class="mono">208,000</span>','<span class="mono">142,272</span>'],
  ['<span class="nm">Basement parking</span>','<span class="mono">71.2%</span>','5 + 5','—','<span class="mono">340</span>','<span class="mono">126,000</span>','<span class="mono">89,712</span>'],
  ['<span class="nm">Lift lobby</span>','<span class="mono">68.0%</span>','5 + 5','—','<span class="mono">180</span>','<span class="mono">42,000</span>','<span class="mono">28,560</span>'],
  ['<span class="nm">Podium &amp; landscape</span>','<span class="mono">62.8%</span>','5 + 5','<span style="color:var(--warn-fg)">2</span>','<span class="mono">60</span>','<span class="mono">10,400</span>','<span class="mono">6,531</span>']],
 foot=['<b>Blended</b>','<span class="mono">69.1%</span>','','','<span class="mono">1,200</span>','<span class="mono">386,400</span>','<span class="mono">267,075</span>'],
 align=[1,2,3,4,5,6])
b=''.join([
 ban('info','lock','<b>Measured figures and the extrapolation are not editable.</b> Narrative, emphasis and '
   'ordering are. A material change means re-running commissioning, not retyping a number — an edit that '
   'contradicted the measured data would undermine INV-02, and this is the first document the society will '
   'later hold FirsThing to.'),
 panel('Extrapolation · measured % × that light type’s own count',
   extrap+'<span class="ts">Each circuit extrapolates only across the lights of its own type (CON-11), '
   'then the four are summed. Blended 69.1% is an output of that sum, never an input to it.</span>'),
 '<div class="panel" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(205px,1fr));'
 'gap:16px;align-items:end">'
 '<div style="display:flex;flex-direction:column;gap:2px">'
 '<span class="lbl">Projected annual saving</span>'
 '<span class="mono" style="font-size:30px;font-weight:650;letter-spacing:-.022em;line-height:1.05">₹24,57,090</span>'
 '<span class="ts">267,075 kWh · 69.1% of common-area lighting</span></div>'
 '<div style="display:flex;flex-direction:column;gap:2px">'
 '<span class="lbl">Society’s share · 58%</span>'
 '<span class="mono" style="font-size:21px;font-weight:640">₹14,25,112</span>'
 '<span class="ts">₹1,18,759 per month</span></div>'
 '<div style="display:flex;flex-direction:column;gap:2px">'
 '<span class="lbl">FirsThing’s share · 42%</span>'
 '<span class="mono" style="font-size:21px;font-weight:640">₹10,31,978</span>'
 '<span class="ts">₹85,998 per month</span></div>'
 '<div style="display:flex;flex-direction:column;gap:2px">'
 '<span class="lbl">CO₂ avoided</span>'
 '<span class="mono" style="font-size:21px;font-weight:640">213 t</span>'
 '<span class="ts">per year</span></div></div>',
 cols(panel('Assumptions', tbl(['Input','Value','Source'],
     [['Tariff','<span class="mono">₹9.20 / kWh</span>','BESCOM HT-2a slab, Jul 2026 bill'],
      ['Burn hours · corridor','<span class="mono">11.5 h/day</span>','Measured over the 5-day baseline'],
      ['Burn hours · basement','<span class="mono">24 h/day</span>','Measured — always-on'],
      ['Burn hours · lobby','<span class="mono">14 h/day</span>','Measured'],
      ['Burn hours · podium','<span class="mono">12 h/day</span>','Measured'],
      ['Light counts','<span class="mono">1,200</span>','Survey confirmed 1 Jul (SCR-014)'],
      ['Revenue share','<span class="mono">58 / 42</span>','Society / FirsThing — indicative; the binding version is the offer']], wrap=[2])+
     '<span class="ts">Every input named, with where it came from. A committee that can audit the '
     'assumptions is a committee that can believe the headline.</span>'),
  ''.join([
      panel('Society-facing preview', ''.join([
     '<div class="roomy" style="border:1px solid var(--border);border-radius:var(--r-md);'
     'background:var(--surface-sunken);padding:14px;display:flex;flex-direction:column;gap:9px">'
     '<span class="lbl">Prestige Ferns · demo report</span>'
     '<div style="font-size:16px;font-weight:620;letter-spacing:-.01em">You could save about '
     '<span class="mono">₹1,18,000</span> a month on common-area lighting.</div>'
     '<p style="font-size:13px;color:var(--text-muted)">We measured it. Over ten days in April and May we '
     'metered four of your circuits before and after fitting LEDs — one for each type of light you have — '
     'and measured a 69.1% reduction. That is not an estimate from a catalogue; it is your building.</p>'
     '<div style="display:flex;gap:7px"><button class="btn btn-pri sm">See the measurements</button>'
     '<button class="btn btn-sec sm">Ask a question</button></div></div>',
     '<span class="ts">What SCR-031 shows. Roomier type, no jargon, and the method offered rather than hidden.</span>',
   ])),
      panel('Share', rows2([('K. Ramamurthy · Secretary',CK),('S. Iyer · Treasurer',CK),
     ('M. Bhaskar · Manager',CU),('Publish to prospect portal',CK)])+
     '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-pri sm">Share</button>'
     '<button class="btn btn-sec sm">Download PDF</button><button class="btn btn-sec sm">Regenerate</button></div>'),
  ]),'1.15fr 1fr'),
])
D.add('SCR-030','Demo report editor','Where the extrapolation becomes a promise. This is the first document '
 'stating a number the society will hold FirsThing to for seven years — so the screen makes the method '
 'visible rather than presenting the headline alone.',
 sh('SCR-030','Demo reports › Prestige Ferns','Demo report · Prestige Ferns',
    '<span class="chip neu"><span class="dot"></span>draft</span>'
    '<button class="btn btn-sec">View as society</button><button class="btn btn-pri">Share</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<div class="empty"><span class="ts">Generated automatically once every circuit is '
    'benchmarked. <b>1 outstanding: Podium &amp; landscape.</b></span>'
    '<button class="btn btn-sec sm">→ Commissioning</button></div>'),
  ('Empty — a circuit out of range', ban('bad','x','<b>Refuses to generate.</b> Lift lobby measured 84%, '
    'outside the 60–80% range. Accept it or exclude the circuit before generating.')),
  ('Partial / stale', ban('warn','warn','A benchmark changed on 9 Aug. Regenerate before sharing.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Save failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Not ops → SCR-221.</span>'),
  ('Success — shared','<span class="chip ok"><span class="tri"></span>Shared</span>'
    '<span class="ts">Timeline entry written; the society can see it in their portal.</span>')))

# ---------------------------------------------------------------- SCR-040
def kycrow(name,why,state,tone,chan,doc,note=''):
    return ([('<div><span class="nm">%s</span><div class="ts">%s</div></div>'%(name,why)),
             chip(tone,state,'tri' if tone=='ok' else 'dot'),
             chan,
             doc,
             note or '<span class="ts">—</span>'],
            'risk r-bad' if tone=='bad' else '')
kyc = tbl(['Item','State','Channel','Document','Note'],
 [kycrow('GST certificate','Registration proof for invoicing','verified','ok','Portal',
    '<span class="mono ts">gst_27AABC…pdf</span>','<span class="ts">Verified 4 Jun by Priya Nair</span>'),
  kycrow('Recent electricity bill','Establishes the tariff slab and baseline','rejected','bad','WhatsApp',
    '<span class="mono ts">bill_feb25.jpg</span>',
    '<span style="color:var(--bad-fg);font-size:12.5px">The electricity bill is from Feb 2025. We need one '
    'from the last three months.</span>'),
  kycrow('RWA registration certificate','Confirms who can legally sign','verified','ok','Email',
    '<span class="mono ts">rwa_reg_2019.pdf</span>','<span class="ts">Verified 6 Jun by Priya Nair</span>'),
  kycrow('Board resolution authorising K. Ramamurthy','Custom item — added 7 Jun','received','info','In person',
    '<span class="mono ts">board_res_jun26.pdf</span>',
    '<span class="ts">Added by Priya Nair: “Their bye-laws require a resolution per contract.”</span>')], wrap=[4])
b=''.join([
 '<div style="display:flex;gap:11px;flex-wrap:wrap;align-items:center">'
 '<div class="card" style="flex:1;min-width:200px"><span class="lbl">Progress</span><span class="v">2 of 4</span>'
 '<span class="ts">verified · 1 rejected, 1 awaiting review</span>'
 '<div class="mtr" style="margin-top:5px"><i style="width:50%"></i></div></div>'
 '<div class="card" style="flex:1;min-width:200px"><span class="lbl">Days at KYC</span><span class="v">11</span>'
 '<span class="ts">since 2 Jun</span></div>'
 '<div class="card" style="flex:2;min-width:240px"><span class="lbl">Gate</span>'
 '<span class="v" style="font-size:15px;font-family:var(--ui);color:var(--bad-fg)">Offer blocked</span>'
 '<span class="ts">The offer cannot be sent until every item is verified.</span></div></div>',
 panel('Checklist', kyc, '<div style="display:flex;gap:7px"><button class="btn btn-sec sm">Add custom item</button>'
   '<button class="btn btn-sec sm">Chase all outstanding</button></div>'),
 cols(
  panel('Upload on behalf of the society', ''.join([
    '<div class="drop">Drop a file, or <u>browse</u><div class="ts" style="margin-top:4px">'
    'PDF, JPG or PNG · up to 20 MB</div></div>',
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px">',
    field('Checklist item','Recent electricity bill'),
    field('Received via','WhatsApp','How it actually reached us — recorded per item'),
    '</div>',
    '<div style="display:flex;gap:7px"><button class="btn btn-pri sm">Mark received</button></div>',
    ban('info','i','<b>Backend entry is a primary action here, not a fallback.</b> Many societies will never '
      'use the portal — that path is mandatory to keep regardless of prospect accounts, so it sits on the '
      'screen rather than in a menu.'),
  ])),
  panel('Rejecting well', ''.join([
    '<div class="field"><label>Reason the society will see</label>'
    '<div class="inp" style="height:auto;min-height:58px;white-space:normal">The electricity bill is from '
    'Feb 2025. We need one from the last three months.</div></div>',
    '<span class="ts">A reason is required on reject, and it has to reach the society — otherwise they '
    'resend the same file and both sides lose a week. Never “invalid document”.</span>',
    '<div style="display:flex;gap:7px"><button class="btn btn-danger sm">Reject &amp; notify</button></div>',
  ])),'1.35fr 1fr'),
])
D.add('SCR-040','KYC checklist &amp; verification','Collects and verifies the documents that gate agreement '
 'execution. Two things the spec insisted on and the screen carries: both intake paths are first-class, and '
 'the fixed checklist has an escape hatch — because the alternative is ops tracking it in a spreadsheet.',
 sh('SCR-040','KYC › Prestige Ferns','KYC · Prestige Ferns',
    '<span class="chip info"><span class="dot"></span>polling · 60s</span>'
    '<button class="btn btn-pri" disabled>Build offer</button>', b),
 states(
  ('Loading','<span class="ts">Skeleton checklist.</span>'+SK),
  ('Empty — first use','<span class="ts">All items outstanding, each stating what it is and why it is '
    'needed — not just its name.</span>'),
  ('Empty — filtered','<span class="ts">Not applicable — the checklist is never filtered.</span>'),
  ('Partial / stale', ban('info','up','New upload received 2 minutes ago.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Load failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Not ops → SCR-221.</span>'),
  ('Success — all verified', ban('ok','tick','KYC complete. The offer can now be executed.'))))

# ---------------------------------------------------------------- SCR-050
bench = tbl(['Circuit','Light type','Represented','Measured %','Offered %','Δ','Tolerance band'],
 [['<span class="mono ts">TowerA/DB-3/L3-corr</span>','Corridor &amp; staircase','<span class="mono">620</span>',
   '<span class="mono">68.4%</span>','<span class="mono">66.0%</span>',
   '<span class="mono" style="color:var(--ok-fg)">−2.4</span>','<span class="mono">±10%</span>'],
  ['<span class="mono ts">BsmtB/DB-1/bay-3</span>','Basement parking','<span class="mono">340</span>',
   '<span class="mono">71.2%</span>','<span class="mono">68.0%</span>',
   '<span class="mono" style="color:var(--ok-fg)">−3.2</span>','<span class="mono">±10%</span>'],
  (['<span class="mono ts">TowerB/DB-2/lobby</span>','Lift lobby','<span class="mono">180</span>',
   '<span class="mono">68.0%</span>','<span class="mono"><b>72.0%</b></span>',
   '<span class="mono" style="color:var(--bad-fg)">+4.0</span>','<span class="mono">±12%</span>'],'risk r-bad'),
  ['<span class="mono ts">Podium/DB-4/land</span>','Podium &amp; landscape','<span class="mono">60</span>',
   '<span class="mono">62.8%</span>','<span class="mono">60.0%</span>',
   '<span class="mono" style="color:var(--ok-fg)">−2.8</span>','<span class="mono">±15%</span>']],
 foot=['<b>Blended</b>','','<span class="mono">1,200</span>','<span class="mono">69.1%</span>',
   '<span class="mono">67.1%</span>','','<span class="ts">per circuit, never blended</span>'],
 align=[2,3,4,5,6])
b=''.join([
 ban('bad','warn','<b>You’re offering 72% on Lift lobby but it measured 68%.</b> That becomes the benchmark '
   'FirsThing is held to every month, on 180 lights, for seven years. Offering <i>below</i> measured is a '
   'commercial concession and passes silently; offering above is flagged every time.'),
 panel('Per-circuit benchmark table', bench +
   '<span class="ts">This table and SCR-090’s monthly compliance table are the same shape by requirement. '
   'An offer carrying one blended benchmark instead of the per-circuit set would be unenforceable against '
   'the per-circuit check the system actually runs — the contract could not be enforced by the thing '
   'enforcing it. The blended figure in the footer is displayed, never stored as a term.</span>',
   '<span class="chip neu"><span class="dot"></span>editable · draft v3</span>'),
 cols(''.join([
   panel('Commercial terms', '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px">'+
     field('Revenue share · society','58%')+field('Revenue share · FirsThing','42%')+
     field('Term','7 years')+field('Unit rate basis','Billed tariff at the time of the reading')+
     field('AMC','Included, full term')+field('Payment terms','Net 30 from invoice date')+'</div>'),
      panel('CON-01b exclusions · what is not FirsThing’s fault',
     '<div style="display:flex;flex-direction:column;gap:5px;font-size:12.5px">'+
     ''.join('<div style="display:flex;gap:7px;align-items:flex-start">%s<span>%s</span></div>'%(CK,t) for t in [
       'Grid outages and scheduled load-shedding',
       'Society-initiated changes to burn hours or occupancy',
       'Fittings damaged or removed by the society or its contractors',
       'Additions to the lighting load not notified to FirsThing',
       'Force majeure'])+
     '<div style="display:flex;gap:7px;align-items:flex-start;opacity:.6">%s<span>Meter or gateway '
     'failure attributable to FirsThing hardware <span class="ts">— deliberately unchecked; that one '
     '<i>is</i> ours</span></span></div></div>'%CU),
  ]),
  ''.join([
   panel('Projected value', rows2([
     ('At offered percentages','<span class="mono">₹23,86,848</span> / yr'),
     ('Society · 58%','<b class="mono">₹13,84,372</b> / yr'),
     ('','<span class="ts mono">₹1,15,364 / month</span>'),
     ('FirsThing · 42%','<span class="mono">₹10,02,476</span> / yr'),
     ('','<span class="ts mono">₹83,540 / month</span>'),
     ('Over the 7-year term','<span class="mono">₹96,90,604</span>')])),
      panel('Version diff · v3 vs v2', ''.join([
     '<div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px">',
     '<div style="display:flex;gap:8px"><span class="chip warn"><span class="dot"></span>changed</span>'
     '<span>Society’s share <span class="mono">60%</span> → <span class="mono">58%</span></span></div>',
     '<div style="display:flex;gap:8px"><span class="chip warn"><span class="dot"></span>changed</span>'
     '<span>Lift lobby offered <span class="mono">74%</span> → <span class="mono">72%</span></span></div>',
     '<div style="display:flex;gap:8px"><span class="chip neu"><span class="dot"></span>unchanged</span>'
     '<span>Term, AMC, exclusions, tolerance bands</span></div>',
     '</div>',
     '<span class="ts">Prior versions are retained. Which version was signed matters later — a dispute '
     'three years in resolves against a specific one.</span>',
     '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-sec sm">Compare versions</button>'
     '<button class="btn btn-sec sm">Record counter</button></div>',
   ])),
  ]),'1.55fr 1fr'),
])
D.add('SCR-050','Offer builder','Builds the commercial offer carrying the <b>per-circuit benchmark table</b> '
 'that the monthly compliance check will run against for the next seven years. The offered percentage may '
 'differ from the measured one — and the screen shows both, side by side, with the delta.',
 sh('SCR-050','Offers › Prestige Ferns','Offer · Prestige Ferns',
    '<span class="chip neu"><span class="dot"></span>v3 · draft</span>'
    '<button class="btn btn-sec">Withdraw</button><button class="btn btn-pri">Send offer</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<span class="ts">Table pre-filled from the measured benchmarks; terms at defaults.</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Partial / stale', ban('warn','warn','Lift lobby’s benchmark changed after this draft. Review before sending.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Save failed</span>'
    '<span class="ts">Draft kept.</span>'),
  ('Error — permission','<span class="ts">Not sales → read-only.</span>'),
  ('Blocked — KYC incomplete', ban('bad','x','Cannot send. <b>2 KYC items outstanding:</b> recent electricity '
    'bill, board resolution.'))))

# ---------------------------------------------------------------- SCR-052
def hand(when,what,frm,to,where,doc=''):
    return ('<div style="display:flex;gap:10px;align-items:flex-start">'
      '<div style="width:78px;flex:none;text-align:right;padding-top:1px">'
      '<div class="mono ts">%s</div></div>'
      '<div style="width:9px;flex:none;display:flex;flex-direction:column;align-items:center;padding-top:5px">'
      '<span style="width:7px;height:7px;border-radius:50%%;background:var(--accent);flex:none"></span>'
      '<span style="width:1px;flex:1;background:var(--border);min-height:26px"></span></div>'
      '<div style="padding-bottom:13px;font-size:12.5px"><b>%s</b>'
      '<div class="mut" style="margin-top:2px">%s <span style="color:var(--text-subtle)">→</span> %s</div>'
      '<div class="ts" style="margin-top:2px;display:flex;gap:5px;align-items:center">'
      '<span style="width:12px;height:12px;display:inline-block">%s</span>%s%s</div></div></div>')%(
      when,what,frm,to,I['pin'],where,doc)
log = ''.join([
 hand('4 Jul 11:20','Printed and couriered','Sunita Rao · FirsThing','Vikram S. · BlueDart',
      'FirsThing Bengaluru office',' · <span class="mono">AWB 4712 9930 118</span>'),
 hand('6 Jul 15:05','Delivered to the society','Vikram S. · BlueDart','K. Ramamurthy · Secretary',
      'maintenance office'),
 hand('15 Jul 10:40','Signed copy collected','K. Ramamurthy · Secretary','Sunita Rao · FirsThing','main gate'),
 hand('21 Jul 12:15','Taken for notarisation','Sunita Rao · FirsThing','Adv. P. Nagaraj','Mayo Hall notary'),
 hand('22 Jul 16:30','Notarised original received','Adv. P. Nagaraj','Sunita Rao · FirsThing',
      'FirsThing Bengaluru office'),
])
b=''.join([
 ban('info','i','<b>Deliberately a log, not a workflow.</b> The signed paper is the legal instrument; the '
   'system holds a scan, not the original. Modelling notarisation as a state machine would misrepresent what '
   'is actually happening — what ops needs is to know where the document physically is and who last had it.'),
 '<div style="display:flex;gap:11px;flex-wrap:wrap;align-items:center">'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Agreement stage</span>'
 '<span class="v" style="font-size:15px;font-family:var(--ui);color:var(--ok-fg)">Executed</span>'
 '<span class="ts">notarised 22 Jul 2026</span></div>'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Accepted → executed</span>'
 '<span class="v">18 days</span><span class="ts">4 Jul → 22 Jul</span></div>'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Handoffs logged</span>'
 '<span class="v">5</span><span class="ts">no gaps</span></div>'
 '<div class="card" style="flex:1;min-width:190px"><span class="lbl">Documents</span>'
 '<span class="v">3</span><span class="ts">draft · signed · notarised</span></div></div>',
 cols(
  panel('Handoff log', '<div style="padding-top:3px">'+log+'</div>',
   '<button class="btn btn-sec sm">Log handoff</button>'),
  ''.join([
   panel('Log the next handoff', ''.join([
     '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px">',
     field('Handed over by','Sunita Rao (you)'),
     field('Received by','—'),
     field('Their contact','—'),
     field('When','22 Jul 2026, 16:30'),
     '</div>',
     '<div class="field"><label>Where</label>'
     '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:5px">'
     '<span class="fc">maintenance office</span><span class="fc">main gate</span>'
     '<span class="fc">clubhouse</span><span class="fc">FirsThing office</span></div>'
     '<div class="inp mut">or type a place…</div>'
     '<span class="ts">Real places, because that is what people say on the phone when the document goes '
     'missing.</span></div>',
   ])),
      panel('Documents', rows2([
     ('<span class="mono ts">agreement_v3_unsigned.pdf</span>',chip('neu','draft')),
     ('<span class="mono ts">agreement_signed_15jul.pdf</span>',chip('info','signed scan')),
     ('<span class="mono ts">agreement_notarised_22jul.pdf</span>',chip('ok','notarised','tri'))])),
      panel('Execution', rows2([('Executed on','22 Jul 2026'),('Notary','Adv. P. Nagaraj · Mayo Hall'),
     ('Witnesses','S. Iyer · M. Bhaskar'),('Offer version made binding','<b>v3</b>')])+
     ban('warn','warn','Recording execution creates the active contract from offer <b>v3</b> and releases '
       'installation. The modal restates every term being made binding.')+
     '<button class="btn btn-pri sm" style="align-self:flex-start">Record execution</button>'),
  ]),'1.15fr 1fr'),
])
D.add('SCR-052','Agreement tracker &amp; physical handoff log','Tracks a paper document through the physical '
 'world. Built to work at 360px, because it gets updated from a phone in a car park — which is also why '
 'it is flagged as a candidate for offline capture even though it is currently blocked offline.',
 sh('SCR-052','Agreements › Prestige Ferns','Agreement · Prestige Ferns',
    '<span class="chip ok"><span class="tri"></span>executed</span>'
    '<button class="btn btn-sec">Flag lost document</button><button class="btn btn-pri">Record execution</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<div class="empty"><span class="ts">The offer is accepted. Print it, then log each '
    'handoff so nobody loses track of the paper.</span><button class="btn btn-pri sm">Log handoff</button></div>'),
  ('Empty — filtered','<span class="ts">Not applicable — an append-only log is never filtered.</span>'),
  ('Partial / stale', ban('warn','warn','No handoff logged since 28 Jul. <b>Where is the document?</b>')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Save failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Not sales → read-only.</span>'),
  ('Blocked — no notarised scan', ban('bad','x','Cannot record execution. The notarised scan is not attached.'))))

# ---------------------------------------------------------------- SCR-053
cbench = tbl(['Circuit','Light type','Represented','Benchmark %','Band','Effective from'],
 [['<span class="mono ts">TowerA/DB-3/L3-corr</span>','Corridor &amp; staircase','<span class="mono">620</span>',
   '<span class="mono">66.0%</span>','<span class="mono">±10%</span>','22 Jul 2026'],
  ['<span class="mono ts">BsmtB/DB-1/bay-3</span>','Basement parking','<span class="mono">340</span>',
   '<span class="mono">68.0%</span>','<span class="mono">±10%</span>','22 Jul 2026'],
  ['<span class="mono ts">TowerB/DB-2/lobby</span>','Lift lobby','<span class="mono">180</span>',
   '<span class="mono">72.0%</span>','<span class="mono">±12%</span>','22 Jul 2026'],
  ['<span class="mono ts">Podium/DB-4/land</span>','Podium &amp; landscape','<span class="mono">60</span>',
   '<span class="mono">60.0%</span>','<span class="mono">±15%</span>','22 Jul 2026']],
 foot=['','<b>Represented light count</b>','<span class="mono">1,200</span>','','',''],
 align=[2,3,4])
b=''.join([
 '<div style="display:flex;gap:11px;flex-wrap:wrap;align-items:center;justify-content:space-between">'
 '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap">'
 '<span class="chip ok"><span class="tri"></span>active</span>'
 '<span class="mono ts">FT/C/2026/0184</span>'
 '<span class="ts">22 Jul 2026 → 21 Jul 2033 · 7 years</span></div>'
 '<div style="display:flex;gap:7px;align-items:center">'
 '<span class="lbl">As of</span><div class="inp" style="width:auto;padding:5px 9px">13 Aug 2026</div>'
 '<span class="ts">today</span></div></div>',
 ban('info','i','<b>An amendment is awaiting signature.</b> AMD-01, raised 11 Aug from a count discrepancy in '
   'Basement B, would raise the represented count from 1,200 to 1,260. The terms below are the current '
   '<i>binding</i> ones — the amendment has not taken effect and does not appear in them.'),
 ban('warn','cal','<b>Billing has not started.</b> Under CON-22 it begins the day after the completion '
   'certificate is signed. Installation is on day 4 of 7; no certificate exists yet. The contract is active '
   'and the meter is not running.'),
 panel('Per-circuit benchmark table', cbench+
   '<span class="ts">Read-only. This is the table every monthly compliance check, invoice line and '
   'billing dispute resolves against.</span>'),
 panel('Amendment history', tbl(['Ref','Raised','What changes','Instrument','Status'],
     [(['<span class="mono">AMD-01</span>','11 Aug 2026','Represented count 1,200 → 1,260 (Basement B)',
       '<span class="ts">unsigned</span>',chip('warn','awaiting signature')],'risk r-warn')], wrap=[2])+
     '<span class="ts">Every change is an amendment with its own signed instrument. A contract that could be '
   'edited in place could not be the thing a billing dispute is settled against.</span>',
   '<button class="btn btn-sec sm">Raise amendment</button>'),
 grid(
   panel('Commercial terms', rows2([
     ('Revenue share','58 society / 42 FirsThing'),('Unit rate','Billed tariff at the reading date'),
     ('Payment terms','Net 30'),('Term','7 years'),('AMC','Included, full term'),
     ('Renewal','By mutual written agreement')])),
      panel('Hardware FirsThing owns on site', rows2([
     ('LED fittings','1,200 (1,260 after AMD-01)'),('Sub-meters','4'),('Gateway','1 · LAN'),
     ('Contactor panels','4')])+
     '<span class="ts">Matters at term end — this list is what gets removed or bought out.</span>'),
      panel('Linked records', rows2([
     ('Invoices','0 <span class="ts">— billing not started</span>'),
     ('Savings reports','0'),('Deviations','0'),('Documents','notarised agreement + 1 draft amendment')])),
   m=250),
 '<div class="panel" style="flex-direction:row;flex-wrap:wrap;gap:9px;align-items:center">'
 '<button class="btn btn-sec sm">Download</button>'
 '<button class="btn btn-sec sm">Raise amendment</button>'
 '<button class="btn btn-ghost sm" style="color:var(--bad-fg)">Terminate</button>'
 '<span class="ts" style="margin-left:auto">There is no edit action on this screen, at any permission level.</span></div>',
])
D.add('SCR-053','Contract record','The authoritative statement of what was agreed — <b>read-only by design</b>. '
 'Every change is an amendment with its own record, and the as-of date selector renders the contract as it '
 'stood on any past day, because that is what a dispute actually asks.',
 sh('SCR-053','Contracts › Prestige Ferns','Contract · Prestige Ferns',
    '<button class="btn btn-sec">Download</button><button class="btn btn-sec">Raise amendment</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<span class="ts">Not reachable without a contract.</span>'),
  ('Empty — as-of before execution','<div class="empty"><span class="ts">This contract didn’t exist on '
    '<b>1 Jan 2026</b>.</span><button class="btn btn-sec sm">Reset to today</button></div>'),
  ('Partial / stale', ban('info','i','An amendment is awaiting signature. Terms below are the current '
    'binding ones.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Load failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Wrong society → SCR-221.</span>'),
  ('Success','<span class="ts">Not applicable — the screen is read-only. There is no success state because '
    'there is no mutation.</span>')))

# ---------------------------------------------------------------- SCR-060
def batch(day,date,areas,cnt,inst,onl,state):
    tone={'done':'ok','now':'info','plan':'neu','block':'bad'}[state]
    lbl={'done':'complete','now':'in progress','plan':'planned','block':'not assignable'}[state]
    acc={'done':'','now':'risk r-ok','plan':'','block':'risk r-bad'}[state]
    return ([('<b>Day %s</b>'%day),date,areas,'<span class="mono">%s</span>'%cnt,inst,onl,chip(tone,lbl,'tri' if tone=='ok' else 'dot')],acc)
plan = tbl(['','Date','Areas','Lights','Installer','Onlooker (PER-06)','Status'],
 [batch(1,'Mon 10 Aug','Tower A corridors L1–L8','240','Mahesh N.','K. Ramamurthy','done'),
  batch(2,'Tue 11 Aug','Tower A L9–L16 + staircases','210','Mahesh N.','K. Ramamurthy','done'),
  batch(3,'Wed 12 Aug','Tower B &amp; C corridors','170','Mahesh N.','S. Iyer','done'),
  batch(4,'Thu 13 Aug','Basement A','180','Faisal K.','S. Iyer','now'),
  batch(5,'Fri 14 Aug','Basement B <span class="ts">(revised 160 → 220)</span>','220','Faisal K.','S. Iyer','plan'),
  batch(6,'Sat 15 Aug','Lift lobbies · all towers','180','Faisal K.','K. Ramamurthy','plan'),
  batch(7,'Mon 17 Aug','Podium &amp; landscape','60','<span style="color:var(--bad-fg)">unassigned</span>',
        '<span style="color:var(--bad-fg)">none</span>','block')],
 foot=['','','<b>Planned total</b>','<span class="mono">1,260</span>','','',''],
 align=[3])
b=''.join([
 '<div style="display:flex;gap:11px;flex-wrap:wrap;align-items:center">'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Plan version</span>'
 '<span class="v" style="font-size:15px;font-family:var(--ui)">v2 · draft</span>'
 '<span class="ts">replanned 11 Aug after a blocker</span></div>'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Lights planned</span>'
 '<span class="v">1,260</span><span class="ts">contract says 1,200</span></div>'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Days</span>'
 '<span class="v">7</span><span class="ts">3 complete · 1 running</span></div>'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Publish</span>'
 '<span class="v" style="font-size:15px;font-family:var(--ui);color:var(--bad-fg)">Blocked · 2 reasons</span>'
 '<span class="ts">named below, not greyed out</span></div></div>',
 ban('bad','x','<b>This plan cannot be published yet, for two separate reasons.</b>'
   '<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px">'
   '<div><b>1 · Counts do not reconcile.</b> The plan covers 1,260 lights. The contract’s represented count '
   'is still 1,200 — amendment AMD-01 is awaiting signature. A mismatch is either a survey error or an '
   'undocumented scope change, and both need resolving before installation rather than being discovered on site.</div>'
   '<div><b>2 · Day 7 has no onlooker.</b> Batch review gates the next day’s start under CON-21, so a day '
   'with nobody assigned to review it is a day that cannot complete.</div></div>'),
 panel('Day-by-day batches', plan,
   '<div style="display:flex;gap:7px"><button class="btn btn-sec sm">Calendar view</button>'
   '<button class="btn btn-sec sm">Add batch</button></div>'),
 cols(
  panel('Stock requirement by batch', tbl(['Batch','18W batten','12W downlight','9W bulkhead','Status'],
   [['Day 4 · Basement A','—','—','<span class="mono">180</span>',chip('ok','issued','tri')],
    ['Day 5 · Basement B','—','—','<span class="mono">220</span>',chip('warn','60 short')],
    ['Day 6 · Lift lobbies','—','<span class="mono">180</span>','—',chip('ok','in stock','tri')],
    ['Day 7 · Podium','<span class="mono">60</span>','—','—',chip('ok','in stock','tri')]],align=[1,2,3])),
  panel('Coverage check', ''.join([
    rows2([('Surveyed &amp; contracted','<span class="mono">1,200</span>'),
           ('Found on site','<span class="mono">1,260</span>'),
           ('Planned across 7 batches','<span class="mono">1,260</span>'),
           ('Unreconciled','<b class="mono" style="color:var(--bad-fg)">+60</b>')]),
    '<div class="mtr"><i style="width:95.2%;background:var(--warn-fg)"></i></div>',
    '<span class="ts">The plan reconciles to what is on site, not to the contract — and the gap between '
    'the two is exactly the amendment.</span>',
    '<button class="btn btn-sec sm" style="align-self:flex-start">→ AMD-01</button>',
  ])),'1.7fr 1fr'),
])
D.add('SCR-060','Installation plan','Schedules the whole installation across days and areas. Two things it '
 'refuses to let through: a plan whose light count does not reconcile to the survey, and a day with nobody '
 'named to review the batch.',
 sh('SCR-060','Installation › Prestige Ferns','Installation plan · Prestige Ferns',
    '<span class="chip neu"><span class="dot"></span>v2 · draft</span>'
    '<button class="btn btn-sec">Replan</button><button class="btn btn-pri" disabled>Publish plan</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<div class="empty"><b>Plan the installation.</b><span class="ts">1,200 lights across '
    '4 areas.</span><button class="btn btn-pri sm">Use suggested split by area</button></div>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Partial / stale', ban('warn','warn','The surveyed count changed. This plan covers 1,200 of 1,260 lights.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Save failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Not ops → SCR-221.</span>'),
  ('Success — published', ban('ok','tick','Plan published. Field notified; first batch scheduled for Mon 10 Aug.'))))

# ---------------------------------------------------------------- SCR-063
b=''.join([
 '<div style="display:flex;gap:11px;flex-wrap:wrap;align-items:center">'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Open blockers</span>'
 '<span class="v">2</span><span class="ts">1 contractual · 1 access</span></div>'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Days lost</span>'
 '<span class="v">0.5</span><span class="ts">of 7 planned</span></div>'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Plan status</span>'
 '<span class="v" style="font-size:15px;font-family:var(--ui)">Day 4 of 7</span>'
 '<span class="ts">v2 draft, publish blocked</span></div>'
 '<div class="card" style="flex:1;min-width:180px"><span class="lbl">Billing impact</span>'
 '<span class="v" style="color:var(--warn-fg)">+₹6,723</span><span class="ts">per month, if AMD-01 signs</span></div></div>',
 '<div class="fil"><span class="fc on">Open</span><span class="fc">Resolved</span>'
 '<span class="fc">All types</span><span class="fc">All areas</span></div>',
 # blocker 1 — count discrepancy
 '<div style="border:1px solid var(--bad-line);border-left:3px solid var(--bad-fg);border-radius:var(--r-md);'
 'background:var(--surface);box-shadow:var(--e1);padding:12px 13px;display:flex;flex-direction:column;gap:10px">'
 '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">'
 '<div><span class="chip bad"><span class="dot"></span>count discrepancy</span> '
 '<span class="nm" style="margin-left:5px">Basement B</span>'
 '<div class="ts" style="margin-top:3px">Raised by Faisal K. · 11 Aug 09:40 · 4 photos · '
 '“Two bays on the far side aren’t on the survey sheet at all.”</div></div>'
 '<span class="chip warn"><span class="dot"></span>open · amendment raised</span></div>',
 ban('warn','cash','<b>60 more lights than surveyed in Basement B.</b> This raises the represented count from '
   '1,200 to 1,260 and the monthly fee by about ₹6,700. It needs a contract amendment before it can take effect.'),
 tbl(['','Before','After','Change'],
  [['Represented light count','<span class="mono">1,200</span>','<span class="mono">1,260</span>','<span class="mono">+60</span>'],
   ['Basement parking · represented','<span class="mono">340</span>','<span class="mono">400</span>','<span class="mono">+60</span>'],
   ['Basement projected saving','<span class="mono">85,680 kWh</span>','<span class="mono">100,800 kWh</span>','<span class="mono">+15,120</span>'],
   ['Basement benchmark %','<span class="mono">68.0%</span>','<span class="mono">68.0%</span>',
    '<span class="ts">unchanged — the circuit is the same</span>'],
   ['Projected monthly fee','<span class="mono">₹1,15,364</span>','<span class="mono">₹1,22,088</span>',
    '<span class="mono" style="color:var(--warn-fg)">+₹6,723</span>'],
   ['Over the remaining term','<span class="mono">₹96,90,604</span>','<span class="mono">₹1,02,55,365</span>',
    '<span class="mono" style="color:var(--warn-fg)">+₹5,64,762</span>']],align=[1,2,3]),
 '<div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center">'
 '<button class="btn btn-pri sm">Raise amendment</button>'
 '<button class="btn btn-sec sm" disabled>Deterministic rescale</button>'
 '<button class="btn btn-sec sm">Escalate</button>'
 '<span class="ts">Rescale is unavailable — this contract does not carry the clause (FEAT-041).</span></div>',
 ban('info','lock','<b>Absent by design:</b> nobody edits <span class="mono">representedLightCount</span> '
   'directly — not ops, not the installer, not a lead. The two legitimate paths are an amendment or a '
   'contract-permitted deterministic rescale, and both write an audit row. There is no third control on '
   'this screen because there is no third control anywhere.'),
 '</div>',
 # blocker 2 — access denied
 '<div style="border:1px solid var(--border);border-left:3px solid var(--warn-fg);border-radius:var(--r-md);'
 'background:var(--surface);box-shadow:var(--e1);padding:12px 13px;display:flex;flex-direction:column;gap:9px">'
 '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">'
 '<div><span class="chip warn"><span class="dot"></span>access denied</span> '
 '<span class="nm" style="margin-left:5px">Lift lobby · Tower B</span>'
 '<div class="ts" style="margin-top:3px">Raised by Faisal K. · today 08:15 · 1 photo · '
 '“Lift is under AMC service until 16 Aug, lobby hoarded off.”</div></div>'
 '<span class="chip warn"><span class="dot"></span>open</span></div>'
 '<div class="ts">Effect on the plan: <b>day 6 (Sat 15 Aug) at risk.</b> Tower B lobby is 62 of that day’s 180.</div>'
 '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-pri sm">Resolve</button>'
 '<button class="btn btn-sec sm">Replan day 6</button><button class="btn btn-sec sm">Escalate</button></div></div>',
 # resolved
 '<div style="border:1px solid var(--border);border-left:3px solid var(--ok-fg);border-radius:var(--r-md);'
 'background:var(--surface);box-shadow:var(--e1);padding:12px 13px;display:flex;flex-direction:column;gap:7px;opacity:.82">'
 '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:baseline">'
 '<div><span class="chip neu"><span class="dot"></span>stock shortage</span> '
 '<span class="nm" style="margin-left:5px">Tower C corridors</span>'
 '<div class="ts" style="margin-top:3px">Raised by Mahesh N. · 12 Aug 14:10 · 18 × 18W batten short</div></div>'
 '<span class="chip ok"><span class="tri"></span>resolved</span></div>'
 '<div class="ts">Resolved 12 Aug 17:30 by Priya Nair — drawn from the Brigade Cornerstone buffer stock. '
 'Day 3 completed the same evening. 0.5 days lost.</div></div>',
])
D.add('SCR-063','Installation blockers &amp; scope changes','Handles what goes wrong on site — and routes a '
 'genuine scope change to a contract amendment rather than letting it become a silent edit. A count '
 'discrepancy always shows its money before it offers any action, so nobody treats it as a clerical correction.',
 sh('SCR-063','Installation › Prestige Ferns › Blockers','Blockers · Prestige Ferns',
    '<span class="chip info"><span class="dot"></span>polling · 120s</span>'
    '<button class="btn btn-sec">View plan</button><button class="btn btn-pri">Raise blocker</button>', b),
 states(
  ('Loading',SK),
  ('Empty — first use','<div class="empty"><b>No blockers.</b><span class="ts">Installation is running to '
    'plan — day 4 of 7.</span><button class="btn btn-sec sm">View plan</button></div>'),
  ('Empty — filtered','<div class="empty"><span class="ts">No blockers match <b>Resolved</b> + '
    '<b>Basement A</b>.</span><button class="btn btn-sec sm">Clear</button></div>'),
  ('Partial / stale', ban('info','wifi','An installer has unsynced updates from today.')),
  ('Error — network','<span class="chip bad"><span class="dot"></span>Load failed</span>'
    '<button class="btn btn-sec sm" style="align-self:flex-start">Retry</button>'),
  ('Error — permission','<span class="ts">Not ops → SCR-221.</span>'),
  ('Rescale available','<span class="ts">Where the contract carries the clause, a second path appears — '
    'showing the computed new benchmark before it is applied:</span>'+
    ban('info','i','Deterministic rescale: basement benchmark 68.0% on 400 lights. Applied and audited.'))))

n,size = D.build('deal.html','Deal Loop')
print('screens: %d  bytes: %d'%(n,size))
