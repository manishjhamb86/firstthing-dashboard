# -*- coding: utf-8 -*-
from _base import I, CK, CU, SK, states, Deck

FIELD_CSS = """
.rail{display:flex;gap:15px;overflow-x:auto;padding:2px 2px 10px;align-items:flex-start}
.dev{flex:none;width:390px;display:flex;flex-direction:column;gap:7px;min-width:0}
.devcap{font-size:11px;text-transform:uppercase;letter-spacing:.07em;font-weight:650;color:var(--text-subtle)}
.phone{border:1px solid var(--border);border-radius:20px;overflow:hidden;background:var(--surface);
       box-shadow:var(--e2);display:flex;flex-direction:column}
.sync{display:flex;align-items:center;gap:7px;padding:8px 13px;font-size:12px;font-weight:600;
      background:var(--ok-bg);color:var(--ok-fg);border-bottom:1px solid var(--ok-line)}
.sync.warn{background:var(--warn-bg);color:var(--warn-fg);border-bottom-color:var(--warn-line)}
.sync.bad{background:var(--bad-bg);color:var(--bad-fg);border-bottom-color:var(--bad-line)}
.sync.neu{background:var(--neu-bg);color:var(--neu-fg);border-bottom-color:var(--neu-line)}
.sync svg{width:14px;height:14px;flex:none}
.sync .n{margin-left:auto;font-variant-numeric:tabular-nums;opacity:.9}
.phead{padding:11px 14px;border-bottom:1px solid var(--chrome-border);background:var(--chrome)}
.ptitle,.phead .ptitle{color:var(--chrome-text)}
.psub{color:var(--chrome-muted)}
.pidx{padding:8px 13px;border-bottom:1px solid var(--border);background:var(--surface);
      display:flex;gap:5px;overflow-x:auto}
.pidx .chip{flex:none}
.ptitle{font-size:16px;font-weight:640;letter-spacing:-.014em;color:var(--chrome-text)}
.psub{font-size:12.5px;color:var(--chrome-muted);margin-top:2px}
.pbody{padding:13px;display:flex;flex-direction:column;gap:11px;background:var(--surface-sunken)}
.pbar{padding:11px 13px;border-top:1px solid var(--border);background:var(--surface);
      display:flex;flex-direction:column;gap:7px}
.pbar .btn{width:100%;justify-content:center;padding:12px 14px;font-size:14px;min-height:48px}
.pbar .ts{text-align:center}
.crd{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);
     padding:11px 12px;display:flex;flex-direction:column;gap:7px;min-width:0}
.crd.acc{border-left:3px solid var(--accent)}
.crd.bad{border-left:3px solid var(--bad-fg)}
.crd.warn{border-left:3px solid var(--warn-fg)}
.crd.ok{border-left:3px solid var(--ok-fg)}
.ttl{font-size:14.5px;font-weight:620;letter-spacing:-.008em}
.kv{display:flex;justify-content:space-between;gap:10px;font-size:13px;padding:4px 0;
    border-bottom:1px solid var(--border-subtle)}
.kv:last-child{border-bottom:0}
.kv span:first-child{color:var(--text-muted)}
.big{font-family:var(--mono);font-size:32px;font-weight:650;letter-spacing:-.025em;
     font-variant-numeric:tabular-nums;line-height:1.05}
.fld{display:flex;flex-direction:column;gap:5px}
.fld label{font-size:12.5px;font-weight:620}
.fin{font-size:15px;padding:11px 12px;border-radius:var(--r-sm);border:1px solid var(--field-border);
     background:var(--surface);min-height:44px;display:flex;align-items:center;min-width:0}
.fin.ph{color:var(--text-subtle)}
.fin.big{font-size:22px;font-family:var(--mono);font-weight:640}
.seg2{display:flex;border:1px solid var(--field-border);border-radius:var(--r-sm);overflow:hidden}
.seg2 span{flex:1;text-align:center;padding:10px 6px;font-size:13px;font-weight:600;color:var(--text-muted)}
.seg2 span+span{border-left:1px solid var(--field-border)}
.seg2 span.on{background:var(--accent);color:var(--text-on-accent)}
.seg2 span.no{background:var(--neu-bg);color:var(--text)}
.thumb{width:52px;height:52px;border-radius:var(--r-sm);background:var(--neu-bg);border:1px solid var(--border);
       display:grid;place-items:center;color:var(--text-subtle);flex:none}
.thumb svg{width:18px;height:18px}
.mstrip{display:grid;grid-template-columns:repeat(7,1fr);gap:4px}
.mcell{aspect-ratio:1;border-radius:5px;display:grid;place-items:center;font-size:10px;font-weight:650;
       font-family:var(--mono);border:1px solid var(--border);background:var(--surface-sunken);color:var(--text-subtle)}
.mcell.on{background:var(--ok-bg);color:var(--ok-fg);border-color:var(--ok-line)}
.mcell.gap{background:var(--warn-bg);color:var(--warn-fg);border-color:var(--warn-line);border-style:dashed}
.sig{height:78px;border:1.5px dashed var(--field-border);border-radius:var(--r-sm);background:var(--surface);
     display:grid;place-items:center;color:var(--text-subtle);font-size:12.5px}
.sig.done{border-style:solid;background:var(--surface);place-items:center}
"""

def sync(state='ok', text='All synced', n=''):
    ic = {'ok':'tick','warn':'wifi','bad':'warn','neu':'wifi'}[state]
    cnt = '<span class="n">%s</span>'%n if n else ''
    return '<div class="sync %s">%s<span>%s</span>%s</div>'%(state,I[ic],text,cnt)

def phone(sy, title, sub, body, bar='', chip_=''):
    hd = ('<div class="phead"><div class="ptitle">%s</div>'
          '<div class="psub">%s</div></div>')%(title,sub)
    ix = '<div class="pidx">%s</div>'%chip_ if chip_ else ''
    bb = '<div class="pbar">%s</div>'%bar if bar else ''
    return '<div class="phone roomy">%s%s%s<div class="pbody">%s</div>%s</div>'%(sy,hd,ix,body,bb)

def rail(*devices):
    out=[]
    for cap, ph in devices:
        out.append('<div class="dev"><div class="devcap">%s</div>%s</div>'%(cap,ph))
    return '<div class="rail">%s</div>'%''.join(out)

def chip(t,txt,sp='dot'):
    return '<span class="chip %s"><span class="%s"></span>%s</span>'%(t,sp,txt)
def ban(t,ic,html):
    return '<div class="ban %s">%s<div>%s</div></div>'%(t,I[ic],html)
def crd(tone, inner):
    return '<div class="crd%s">%s</div>'%(' '+tone if tone else '', inner)
def kv(*pairs):
    return ''.join('<div class="kv"><span>%s</span><span>%s</span></div>'%p for p in pairs)
def fld(label, val, ph=False, big=False, note=''):
    c = 'fin' + (' ph' if ph else '') + (' big' if big else '')
    n = '<span class="ts">%s</span>'%note if note else ''
    return '<div class="fld"><label>%s</label><div class="%s">%s</div>%s</div>'%(label,c,val,n)
def slots(spec):
    # spec: list of (label, kind) kind in fill/anom/excl/empty
    out=[]
    for lab,k in spec:
        cls = {'fill':'slot fill','anom':'slot anom','excl':'slot excl','empty':'slot'}[k]
        out.append('<div class="%s">%s</div>'%(cls,lab))
    return '<div class="slots">%s</div>'%''.join(out)
def photos(n, label='photo'):
    t = ''.join('<div class="thumb">%s</div>'%I['cam'] for _ in range(min(n,4)))
    more = '<div class="thumb" style="font-size:12px;font-weight:650">+%d</div>'%(n-4) if n>4 else ''
    return '<div style="display:flex;gap:6px;flex-wrap:wrap">%s%s</div>'%(t,more)

D = Deck('Prototype 3 of 6 · SUR-02 field',
  'Field surface',
  'Twelve screens on a personal Android phone, in a basement, with no signal. This surface is '
  'local-first by construction: a save that reaches the device is a save, and the only distinction '
  'anyone sees is <i>saved</i> versus <i>synced</i>. It is also where the product’s most expensive '
  'number gets typed — the light count that sets the benchmark, that sets the fee, for seven years. '
  'Same society as the deal deck: Prestige Ferns, 1,200 lights, four circuits.',
  css=FIELD_CSS)

# ---------------------------------------------------------------- SCR-171
def visit(name, kind, when, addr, tone, extra='', team='', act=''):
    return crd(tone, ''.join([
      '<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
      '<div class="ttl">%s</div><div class="ts mono">%s</div></div>'%(name,when),
      '<div class="ts">%s · %s</div>'%(kind,addr), extra, team,
      '<div style="display:flex;gap:7px;flex-wrap:wrap">%s</div>'%act if act else '']))
A = ('<div style="display:flex;gap:6px;align-items:center;margin-top:1px">'
     '<span style="width:22px;height:22px;border-radius:50%;background:var(--accent);color:var(--text-on-accent);'
     'font-size:10px;font-weight:700;display:grid;place-items:center">RK</span>'
     '<span style="width:22px;height:22px;border-radius:50%;background:var(--neu-bg);color:var(--neu-fg);'
     'border:1px solid var(--neu-line);font-size:10px;font-weight:700;display:grid;place-items:center">AD</span>'
     '<span class="ts">You + Anita Desai · <span style="color:var(--warn-fg)">Anita hasn’t accepted yet</span></span></div>')
p1 = phone(sync('warn','Saved on this phone — not yet sent','3 pending'),
  'Ravi Kulkarni','Thursday 13 August · synced 09:14',
  ''.join([
   '<div class="lbl">Today</div>',
   visit('Prestige Ferns','Installation · Basement A','08:30','Whitefield · Day 4 of 7','acc',
     kv(('Gate contact','M. Bhaskar · 98450 11902'),('Access hours','7am–8pm, no entry after 8'),
        ('Notice','Same day'),('Pass / ID','Photo ID at gate'))+
     '<div class="ts">From: installation plan v2 (SCR-060)</div>',
     act='<button class="btn btn-pri sm" style="flex:1">Resume visit</button>'
         '<button class="btn btn-sec sm">Call gate</button><button class="btn btn-sec sm">Navigate</button>'),
   '<div class="lbl" style="margin-top:2px">Needs your response</div>',
   visit('Sobha Dream Acres','Survey','Tue 18 Aug, 10:00','Panathur · 2,100 flats','warn',
     ban('warn','warn','Waiting 26 hours. <b>Ops was notified you haven’t responded.</b>')+A,
     act='<button class="btn btn-pri sm" style="flex:1">Accept</button>'
         '<button class="btn btn-sec sm">Request reschedule</button>'),
   visit('Mantri Espana','Meter install · 2 circuits','Sat 15 Aug, 14:00','Sarjapur','',
     '<div class="ts">Waiting 4 hours · from deal MTE-lighting</div>',
     act='<button class="btn btn-pri sm" style="flex:1">Accept</button>'
         '<button class="btn btn-sec sm">Request reschedule</button>'),
  ]),
  '<button class="btn btn-pri">Resume Prestige Ferns</button>'
  '<span class="ts">Everything below is on this phone already — flight mode is fine.</span>')

p2 = phone(sync('bad','Queue stopped — 1 item rejected','3 pending'),
  'Ravi Kulkarni','Thursday 13 August · synced 09:14',
  ''.join([
   ban('bad','x','<b>“Tower C · corridors” was rejected 3 times.</b> Ops confirmed this survey at 11:02, '
     'so a late change can’t be merged.<div style="display:flex;gap:7px;margin-top:8px">'
     '<button class="btn btn-sec sm">View the record</button>'
     '<button class="btn btn-ghost sm">Discard this change</button></div>'),
   '<div class="lbl">Upcoming</div>',
   visit('Settlement Vega','Meter reinstall · lift lobby','Fri 14 Aug, 11:00','Hebbal','bad',
     '<div class="ts" style="color:var(--bad-fg)">Society suspended — do not service. Call Priya on 98xxx xxxxx.</div>'),
   visit('Brigade Cornerstone','Demo install · 2 circuits','Mon 17 Aug, 09:00','Whitefield',''),
   '<div class="lbl" style="margin-top:2px">Recently done</div>',
   crd('warn','<div style="display:flex;justify-content:space-between;gap:9px"><div><b style="font-size:13.5px">'
     'ASF Insignia</b><div class="ts">Inspection · Mon 11 Aug</div></div>'
     '<span class="chip warn"><span class="dot"></span>2 photos unsent</span></div>'),
   crd('','<div style="display:flex;justify-content:space-between;gap:9px"><div><b style="font-size:13.5px">'
     'Purva Riviera</b><div class="ts">Survey · Sat 9 Aug</div></div>'
     '<span class="chip ok"><span class="tri"></span>synced</span></div>'),
  ]),
  '<button class="btn btn-sec">Sync now</button>')

D.add('SCR-171','My visits','The field worker’s whole relationship with the product, and the screen most '
 'likely to be opened with no signal in a car park thirty seconds before walking into a building. It opens '
 'from cache, always usable. Note what it refuses to hide: the escalation that already happened, the '
 'suspension that would waste the trip, and the upload that never landed.',
 rail(('Today · needs response', p1), ('Queue blocked · upcoming · done', p2)),
 states(
  ('Loading','<span class="ts">Cached list renders immediately; only the freshness pill says “checking…”. '
   'A cold start with cache is never a spinner.</span>'),
  ('Empty — first use','<div class="empty"><b>Nothing is assigned to you yet.</b><span class="ts">Visits '
   'scheduled by the office appear here. Questions: Priya, 98xxx xxxxx.</span></div>'),
  ('Empty — nothing today','<span class="ts">Today reads “Nothing scheduled today”; Upcoming carries the '
   'next one with its date.</span>'),
  ('Partial / stale', ban('info','wifi','Showing what was on this phone at 09:14. New assignments may not be here.')),
  ('Error — network','<span class="ts">Silent. The cache stays and the freshness pill goes stale — never an '
   'error page over a usable list.</span>'),
  ('Error — permission','<span class="ts">A reassigned visit greys with “Reassigned to someone else” and '
   'disappears on the next refresh.</span>'),
  ('Reschedule inside 24h', ban('warn','warn','This visit is in less than 24 hours. Changing it now means the '
   'society has to be told, so ops has to do it. <b>Call Priya on 98xxx xxxxx.</b><div class="ts" '
   'style="margin-top:3px;color:inherit;opacity:.85">The button stays — an absent button reads as a bug and '
   'produces the phone call anyway.</div>'))))

# ---------------------------------------------------------------- SCR-010
SECTIONS = ['Profile','Lighting','Circuits','Pump room']
def idx(active):
    # the survey shell's section index: four sections of one container, not four screens
    out=[]
    for i,name in enumerate(SECTIONS):
        if i < active:   out.append(chip('ok',name,'tri'))
        elif i == active: out.append(chip('info',name))
        else:            out.append(chip('neu',name))
    return ''.join(out)
def member(nm, post, ch, primary=False):
    return crd('acc' if primary else '', ''.join([
      '<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
      '<div><b style="font-size:13.5px">%s</b><div class="ts">%s</div></div>%s</div>'%(
        nm,post,chip('ok','primary','tri') if primary else '<span class="ts">·</span>'),
      '<div class="ts mono">%s</div>'%ch,
      '<div class="ts">Offers, reports and invoices go to this person.</div>' if primary else '']))
p1 = phone(sync('ok','All synced'),'Prestige Ferns','Survey · Society profile · 8 Apr',
  ''.join([
   fld('Location','<span class="mono">12.96981, 77.75004</span>',note='Accuracy ±8 m · from device GPS'),
   '<div style="height:96px;border-radius:var(--r-md);border:1px solid var(--border);background:'
   'linear-gradient(135deg,var(--neu-bg),var(--surface-sunken));display:grid;place-items:center;color:var(--text-subtle)">'
   '<div style="text-align:center"><div style="width:22px;height:22px;margin:0 auto">%s</div>'
   '<div class="ts" style="margin-top:3px">Drag to correct the pin</div></div></div>'%I['pin'],
   fld('Address','Prestige Ferns Residency, Whitefield Main Rd, Bengaluru 560066'),
   '<div class="lbl" style="margin-top:3px">Committee · 7 members</div>',
   member('K. Ramamurthy','Secretary','98450 33711 · ramamurthy@prestigeferns.in',True),
   member('S. Iyer','Treasurer','98861 20455 · iyer.s@prestigeferns.in'),
   member('M. Bhaskar','Facility Manager','98450 11902'),
   crd('warn','<div style="display:flex;gap:7px;align-items:flex-start"><span style="width:15px;height:15px;'
     'flex:none;color:var(--warn-fg)">%s</span><div class="ts">98450 11902 is already on '
     '<b>Security In-charge</b>. A shared committee landline is normal — this is a note, not a block.</div></div>'%I['warn']),
   '<button class="btn btn-sec" style="width:100%%;justify-content:center;min-height:44px">+ Add member</button>',
  ]),
  '<button class="btn btn-pri">Complete section</button>', idx(0))

p2 = phone(sync('ok','All synced'),'Prestige Ferns','Survey · Access &amp; entry · 8 Apr',
  ''.join([
   ban('info','i','Captured once. <b>Every future visit to this society reads these details offline</b> — '
     'the meter installer in June and the inspector next year all see what you write here.'),
   fld('Gate contact','M. Bhaskar · 98450 11902'),
   fld('Access hours','7am–8pm, no entry after 8'),
   fld('Notice required','Same day'),
   fld('Parking','Visitor bay near Tower A, ask at gate'),
   fld('Pass / ID','Photo ID at gate; no vehicle pass needed'),
   '<div class="lbl" style="margin-top:3px">Governance</div>',
   crd('', kv(('RWA members','1,118 of 1,240 flats'),('Next election','<b>14 Mar 2027</b>'))+
     '<div class="ts">Ops reads the election date as negotiation risk — a committee changing mid-deal is real.</div>'),
   '<div class="lbl" style="margin-top:3px">Site photos</div>',
   photos(3),
   '<div class="ts">Entrance and gate, so the next visitor recognises the place.</div>',
  ]),
  '<button class="btn btn-pri">Complete section</button>', idx(0))

D.add('SCR-010','Survey: society profile &amp; access','The first structured record of a society that will '
 'ever exist — captured before there is a society row at all. Every later notification resolves through the '
 'contacts entered here, so a thin capture becomes an unreachable customer. The list asks for what a '
 '<i>recipient</i> needs, not what a committee has.',
 rail(('Location · committee', p1), ('Access · governance · photos', p2)),
 states(
  ('Loading','<span class="ts">Instant from the local draft. Nothing is fetched — this section never waits '
   'on a network.</span>'),
  ('Empty — first use','<span class="ts">Guided blocks with prompts, not a bare form. One empty member row '
   'is pre-added: “Who runs this society, and how do we get in?”</span>'),
  ('Empty — filtered','<span class="ts">Not applicable — a capture section is never filtered.</span>'),
  ('Partial / stale', ban('info','i','Ops changed the committee list at 11:40. Your version is shown.'
   '<div style="margin-top:6px;display:flex;gap:6px"><button class="btn btn-sec sm">Keep mine</button>'
   '<button class="btn btn-ghost sm">Take theirs</button></div>')),
  ('Error — network','<span class="ts">There is none. The section is local; the sync bar owns sync state, '
   'and no capture control can fail because of signal.</span>'),
  ('Error — device', ban('warn','pin','Location permission denied. Drop the pin by hand — the address is '
   'already filled from the lead.')),
  ('Flagged', ban('warn','warn','Committee list not captured — <i>“Secretary travelling, meeting on the 12th.”</i> '
   '<div class="ts" style="margin-top:3px;color:inherit;opacity:.85">A partial survey is common and normal, '
   'so it is a state, not an error.</div>'))))

# ---------------------------------------------------------------- SCR-011
def area(lbl, typ, n, method, claim, tone=''):
    mt = {'walked':chip('ok','walked and counted','tri'),
          'records':chip('info','from society records'),
          'est':chip('warn','estimated')}[method]
    return crd(tone, ''.join([
      '<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
      '<div><b style="font-size:14px">%s</b><div class="ts">%s</div></div>'
      '<div class="mono" style="font-size:20px;font-weight:650">%s</div></div>'%(lbl,typ,n),
      '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">%s%s</div>'%(mt,claim)]))
CL = lambda t: '<span class="ts">· %s</span>'%t
p1 = phone(sync('warn','Saved on this phone','6 pending'),'Prestige Ferns','Survey · Lighting inventory · 8 Apr',
  ''.join([
   '<div class="crd acc" style="position:sticky;top:0"><div class="lbl">Running total</div>'
   '<div class="big">1,108</div><div class="ts">across 6 counted areas · 4 light types</div>'
   '<div class="ts" style="color:var(--bad-fg)">Tower C is contested and is not in this number.</div></div>',
   area('Tower A · corridors L1–L16','Corridor &amp; staircase','380','walked',CL('you, 09:12')),
   area('Tower B · corridors','Corridor &amp; staircase','148','walked',CL('Anita Desai, 10:40')),
   area('Tower C · corridors','Corridor &amp; staircase','88 / 92','walked',
     '<span class="chip bad"><span class="dot"></span>contested</span>','bad'),
   crd('bad', ban('bad','users','<b>Two people counted Tower C.</b>'
     '<div style="margin-top:7px;display:flex;flex-direction:column;gap:5px">'
     '<div style="display:flex;justify-content:space-between;gap:9px"><span>Ravi Kulkarni · 11:05</span>'
     '<b class="mono">88</b></div>'
     '<div style="display:flex;justify-content:space-between;gap:9px"><span>Anita Desai · 11:05</span>'
     '<b class="mono">92</b></div></div>'
     '<div class="ts" style="margin-top:6px;color:inherit;opacity:.85">Neither was rejected and neither is '
     'summed. Pick one, or merge by hand with a reason.</div>'
     '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
     '<button class="btn btn-sec sm">Keep 88</button><button class="btn btn-sec sm">Keep 92</button>'
     '<button class="btn btn-ghost sm">Recount together</button></div>')),
   area('Basement A','Basement parking','180','walked',CL('Anita Desai, 12:20')),
   area('Basement B','Basement parking','160','walked',CL('Anita Desai, 12:55')),
  ]),
  '<button class="btn btn-pri" disabled>Complete section</button>'
  '<span class="ts">1 contested area must be resolved first.</span>', idx(1))

p2 = phone(sync('warn','Saved on this phone','6 pending'),'Prestige Ferns','Survey · Lighting inventory · 8 Apr',
  ''.join([
   area('Lift lobbies · all towers','Lift lobby','180','walked',CL('you, 14:10')),
   area('Podium &amp; landscape','Podium &amp; landscape','60','est',CL('you, 15:30'),'warn'),
   crd('warn','<div class="ts"><b>Estimate note:</b> “Landscape lights are spread over the whole podium '
     'and half were off. Counted 48, added 12 for the ones I could see unlit.”</div>'
     '<div class="ts">Ops sees this on review as a named weakness, not as another number in a column.</div>'),
   '<div class="lbl" style="margin-top:3px">Extrapolation base</div>',
   '<div class="ts" style="margin-top:-4px">One circuit will be metered per type.</div>',
   crd('', kv(('Corridor &amp; staircase <span class="ts">· 2 of 3 areas</span>','<b class="mono">528</b>'),
              ('Basement parking <span class="ts">· 2 areas</span>','<b class="mono">340</b>'),
              ('Lift lobby <span class="ts">· 1 area</span>','<b class="mono">180</b>'),
              ('Podium &amp; landscape <span class="ts">· 1 area</span>','<b class="mono">60</b>'),
              ('<b>Total</b>','<b class="mono">1,108</b>'))+
     '<div class="ts" style="color:var(--bad-fg)">Tower C · corridors is excluded — it is contested at '
     '88 or 92. Resolving it makes this 1,196 or 1,200.</div>'
     '<div class="ts">A roll-up that quietly picked one of the two would be the double-count this whole '
     'mechanism exists to prevent.</div>'),
   ban('warn','warn','<b>Podium &amp; landscape has 60 lights.</b> A type under 50 on its metered circuit '
     'needs an ops exception later. Worth another look now — you are still on site, and another walk is '
     'cheap today and expensive in June.'),
  ]),
  '<button class="btn btn-pri" disabled>Complete section</button>', idx(1))

D.add('SCR-011','Survey: lighting inventory by area','<b>The most expensive number in the product, typed on a '
 'phone in a car park.</b> It holds two axes at once — area is how you capture, light type is how you bill — '
 'and it records <i>how</i> each count was obtained, because that is the only thing a reviewer at a desk can '
 'actually assess.',
 rail(('Running total · a contested area', p1), ('Estimated row · extrapolation base', p2)),
 states(
  ('Loading','<span class="ts">Instant from local.</span>'),
  ('Empty — first use','<div class="empty"><b>Add each area that has common lighting.</b>'
   '<span class="ts">Count basement and stilt parking separately.</span></div>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Partial / stale','<span class="ts">Office edits during review surface on section open, named, with '
   'keep-mine / take-theirs. Never while a thumb is typing.</span>'),
  ('Error — network','<span class="ts">None — capture is local.</span>'),
  ('Error — validation','<span class="ts">“Zero lights? Remove the area instead — we only record areas that '
   'exist.” An absence and a zero read identically in a table and mean opposite things.</span>'),
  ('Complete modal', ban('info','warn','1,200 lights, 4 types. <b>These counts are the billing basis for the '
   'whole term.</b> Ops will check them, but nothing later in the system re-counts them.'))))

# ---------------------------------------------------------------- SCR-012
def crit(state, txt, detail=''):
    col = {'pass':'var(--ok-fg)','fail':'var(--bad-fg)','na':'var(--text-subtle)'}[state]
    ic  = {'pass':I['tick'],'fail':I['x'],'na':I['i']}[state]
    d = '<div class="ts" style="margin-left:21px">%s</div>'%detail if detail else ''
    return ('<div><div style="display:flex;gap:7px;align-items:flex-start;font-size:13px;color:%s">'
            '<span style="width:14px;height:14px;flex:none;margin-top:2px">%s</span><span>%s</span></div>%s</div>')%(col,ic,txt,d)
p1 = phone(sync('ok','All synced'),'Prestige Ferns','Survey · Circuit selection · 8 Apr',
  ''.join([
   '<div class="crd acc"><div class="lbl">Progress</div><div class="big" style="font-size:26px">3 of 4</div>'
   '<div class="ts">light types resolved · the work list is generated from your counts, not typed</div></div>',
   crd('ok','<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
     '<div><b style="font-size:14px">Corridor &amp; staircase</b>'
     '<div class="ts">Represents <b>620</b> lights</div></div>%s</div>'
     '<div class="ts mono">TowerA/DB-3/L3-corr · 62 lights · 36 W</div>'%chip('ok','eligible','tri')),
   crd('ok','<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
     '<div><b style="font-size:14px">Basement parking</b>'
     '<div class="ts">Represents <b>340</b> lights</div></div>%s</div>'
     '<div class="ts mono">BsmtB/DB-1/bay-3 · 58 lights · 55 W</div>'%chip('ok','eligible','tri')),
   crd('warn','<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
     '<div><b style="font-size:14px">Lift lobby</b>'
     '<div class="ts">Represents <b>180</b> lights</div></div>%s</div>'
     '<div class="ts mono">TowerB/DB-2/lobby · 41 lights · 40 W</div>'
     '<div class="ts">Waiting on ops approval — you can finish the survey.</div>'%chip('warn','exception requested')),
   crd('','<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
     '<div><b style="font-size:14px">Podium &amp; landscape</b>'
     '<div class="ts">Represents <b>60</b> lights</div></div>%s</div>'
     '<div class="ts">No circuit selected. Find the panel that feeds the podium and landscape lights.</div>'
     '<button class="btn btn-sec sm" style="width:100%%;justify-content:center;min-height:44px">Select circuit</button>'
     %chip('neu','not started')),
  ]),
  '<button class="btn btn-pri" disabled>Complete section</button>'
  '<span class="ts">Podium &amp; landscape still needs a circuit, an exception, or an unresolvable flag.</span>', idx(2))

p2 = phone(sync('ok','All synced'),'Lift lobby','Circuit · TowerB/DB-2/lobby',
  ''.join([
   crd('acc','<div class="ts">This circuit will represent</div><div class="big" style="font-size:26px">180 lights</div>'
     '<div class="ts">every lift lobby light in all three towers</div>'),
   fld('Panel / DB','Tower B, DB-2, lift lobby feeder'),
   fld('Where is it','Tower B ground floor, behind the lift machine cupboard'),
   '<div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">%s%s</div>'%(
     fld('Lights on circuit','41'), fld('Watts each','40')),
   '<div class="lbl" style="margin-top:3px">CON-16 · all five, individually</div>',
   crd('warn', ''.join([
     crit('fail','41 lights on circuit — below 50','Exception requested from ops. You cannot approve this yourself.'),
     crit('pass','Nothing else on the circuit','Checked the DB — lobby lights only'),
     crit('pass','LAN point 18 m away','Tested reachable from the panel'),
     crit('pass','Fixtures at 8 ft','Recessed lobby downlights'),
     crit('pass','Not on a driveway or ramp'),
   ])),
   '<div class="fld"><label>What makes this circuit representative of the other 180 lift lobby lights — '
   'same fixtures, same hours, same switching?</label>'
   '<div class="fin" style="height:auto;min-height:74px;align-items:flex-start;font-size:13.5px;white-space:normal">'
   'No lobby circuit anywhere on site reaches 50. Lobby fittings are identical across all three towers, same '
   'timer, same dusk-to-dawn switching. Tower B is the middle tower by traffic.</div>'
   '<span class="ts">Ops cannot check this from a desk. You are the only person who has seen both.</span></div>',
   '<div class="lbl" style="margin-top:3px">Photos · panel required</div>', photos(2),
  ]),
  '<button class="btn btn-pri">Save circuit</button>')

D.add('SCR-012','Survey: circuit selection per light type','Where the survey stops describing a building and '
 'becomes the <b>sampling design of a contract</b>. Four of CON-16’s five criteria have no exception path, so '
 'the screen does not offer one — and the fifth routes to ops, never to the person holding the phone.',
 rail(('The generated work list', p1), ('One circuit, criterion by criterion', p2)),
 states(
  ('Loading','<span class="ts">Instant; the work list comes from the lighting section.</span>'),
  ('Empty — first use','<span class="ts">One card per type, each naming the type and its light count — '
   'never a blank “add circuit” button.</span>'),
  ('Empty — no types', ban('info','i','Count the lighting first — that decides which circuits are needed.')),
  ('Partial / stale', ban('info','tick','Ops approved the exception for Lift lobby at 15:20.')),
  ('Error — hard fail', ban('bad','x','Fixtures over 15 feet can’t be serviced safely. This circuit can’t be '
   'used — pick another one for staircase lighting.<div class="ts" style="margin-top:3px;color:inherit;'
   'opacity:.85">The rejected candidate stays on the record. It is evidence the choice was deliberate.</div>')),
  ('Error — permission','<span class="ts">Read-only for anyone not on the visit team.</span>'),
  ('Unresolvable', ban('warn','warn','No eligible circuit for external lighting. Ops will either leave '
   'external lights out of this deal or approve an exception. Say what you found.'))))

# ---------------------------------------------------------------- SCR-013
def unit(name, state, detail='', ph=0):
    tone={'done':'ok','todo':'','bad':'bad'}[state]
    right={'done':chip('ok','recorded','tri'),'todo':chip('neu','not answered'),
           'bad':chip('bad','needs a photo')}[state]
    d='<div class="ts">%s</div>'%detail if detail else ''
    p='<div style="display:flex;gap:5px">%s</div>'%(''.join('<div class="thumb" style="width:34px;height:34px">%s</div>'%I['cam'] for _ in range(ph))) if ph else ''
    return crd(tone,'<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
      '<b style="font-size:13.5px">%s</b>%s</div>%s%s'%(name,right,d,p))
p1 = phone(sync('warn','Saved on this phone','18 pending · 14 photos'),'Prestige Ferns','Survey · Pump room · 8 Apr',
  ''.join([
   ban('info','i','<b>Start with the room.</b> How many pumps, how many towers, how many tanks — six answers. '
     'The equipment list builds itself from that, already named, so most of the work is confirming rather '
     'than typing.'),
   crd('ok','<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
     '<b style="font-size:13.5px">Room structure</b>%s</div>'%chip('ok','answered','tri')+
     kv(('Pumps','4 × 7.5 HP borewell'),('Feed pipe','63 mm'),('Common outflow','90 mm'),
        ('Towers','A, B, C'),('Tanks','2 per tower · 6 total'),('VFD arrangement','Per pump'))),
   '<div class="crd acc"><div class="lbl">Progress</div><div class="big" style="font-size:26px">14 of 22</div>'
   '<div class="ts">units recorded · the denominator is known, not guessed</div>'
   '<div class="mtr" style="margin-top:6px"><i style="width:63.6%"></i></div></div>',
   '<div class="lbl" style="margin-top:3px">Float switch · per tank</div>',
   unit('Tower A, Tank 1','done','Grundfos LC-241 · working',1),
   unit('Tower A, Tank 2','done','Same as Tower A, Tank 1 · working',1),
   unit('Tower B, Tank 1','done','Grundfos LC-241 · working with faults',1),
   unit('Tower B, Tank 2','bad','Grundfos LC-241 · working — <b>photo missing</b>'),
   unit('Tower C, Tank 1','todo'),
   unit('Tower C, Tank 2','todo'),
  ]),
  '<button class="btn btn-pri" disabled>Complete section</button>'
  '<span class="ts">Tower B, Tank 2 — float switch needs a photo.</span>', idx(3))

p2 = phone(sync('warn','Saved on this phone','18 pending · 14 photos'),'Prestige Ferns','Survey · Logbook · 8 Apr',
  ''.join([
   crd('','<b style="font-size:13.5px">Actuator valve · per tank</b>'
     '<div class="seg2"><span class="on">Installed</span><span>Not fitted</span></div>'
     '<div class="ts">Tower C, Tank 1</div>'+
     fld('Brand / model','Belimo LR24A-SR')+
     '<div class="fld"><label>Condition</label><div class="seg2">'
     '<span class="on">Working</span><span>With faults</span><span>Not working</span><span>Unknown</span>'
     '</div></div>'+
     '<div style="display:flex;gap:7px;flex-wrap:wrap"><button class="btn btn-sec sm" style="flex:1;'
     'justify-content:center;min-height:44px">Photograph this one</button>'
     '<button class="btn btn-ghost sm" style="min-height:44px">Same as Tower A, Tank 1</button></div>'
     '<div class="ts">Copy-down fills brand, model and condition — and still asks for its own photo, '
     'because condition is per unit.</div>'),
   '<div class="lbl" style="margin-top:3px">Consumption logbook</div>',
   crd('', ''.join([
     '<div class="mstrip">'
     '<div class="mcell on">Aug</div><div class="mcell on">Jul</div><div class="mcell on">Jun</div>'
     '<div class="mcell on">May</div><div class="mcell gap">Apr</div><div class="mcell on">Mar</div>'
     '<div class="mcell on">Feb</div><div class="mcell on">Jan</div><div class="mcell on">Dec</div>'
     '<div class="mcell gap">Nov</div><div class="mcell on">Oct</div><div class="mcell">Sep</div>'
     '<div class="mcell">Aug</div><div class="mcell"></div></div>',
     '<div class="ts">11 of 13 months photographed. <b>Gaps show as gaps</b> — April and November pages are '
     'missing from the register itself, which is a finding, not an omission.</div>',
     '<div style="display:flex;gap:7px;flex-wrap:wrap">'
     '<button class="btn btn-sec sm" style="flex:1;justify-content:center;min-height:44px">Add a page</button>'
     '<button class="btn btn-ghost sm" style="min-height:44px">Logbook not maintained</button></div>',
     '<div class="ts">Each page is tagged with its month by explicit selection — a month is never inferred. '
     'No text is read off these; they are raw evidence.</div>',
   ])),
  ]),
  '<button class="btn btn-pri" disabled>Complete section</button>', idx(3))

D.add('SCR-013','Survey: pump room audit &amp; logbook','The largest data-entry burden in the whole survey, '
 'and FEAT-008 names its own risk: a form that asks forty questions in a row gets forty shortcuts. The answer '
 'is to <b>derive the unit list from the room’s own structure</b> — six answers about the room generate '
 'twenty-two already-named rows.',
 rail(('Structure first, then generated units', p1), ('One unit · the 13-month strip', p2)),
 states(
  ('Loading','<span class="ts">Instant.</span>'),
  ('Empty — first use','<span class="ts">Pass 1 only — six questions — with the six equipment categories '
   'previewed below as “not yet recorded”. Never one giant blank form.</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Partial / stale','<span class="ts">Resumed a day later: progress preserved, lands on the first '
   'unanswered unit.</span>'),
  ('Error — validation', ban('bad','x','Tower B, Tank 2 — float switch needs a photo. An installed item '
   'without a photo isn’t a complete audit.')),
  ('Error — storage', ban('warn','warn','Under 200 MB free. Sync now to free space — nothing unsynced is '
   'ever deleted to make room.')),
  ('Flagged — no access', ban('warn','lock','Pump room locked. The lighting survey is unaffected; pump '
   'automation can’t be quoted until someone gets in.'))))

# ---------------------------------------------------------------- SCR-020
p1 = phone(sync('ok','All synced'),'Prestige Ferns','Meter install · Corridor &amp; staircase · 14 Apr',
  ''.join([
   crd('','<div class="lbl">What the survey recorded</div>'+
     kv(('Circuit','<span class="mono">TowerA/DB-3/L3-corr</span>'),('Lights on circuit','62'),
        ('Watts each','36 W'))+
     '<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline;padding-top:7px;'
     'border-top:1px solid var(--border-subtle)"><span class="lbl">Theoretical load</span>'
     '<b class="mono" style="font-size:19px">2,232 W</b></div>'
     '<div class="ts">Shown before you enter the meter reading, so the check is not circular.</div>'),
   fld('Meter serial','<span class="mono">FT-SM-004417</span>',note='Scanned'),
   '<div class="lbl">Install photo · required</div>', photos(1),
   fld('Displayed load','2,180 W',big=True,note='Read off the meter with the circuit under normal load'),
   crd('ok','<div style="display:flex;gap:9px;align-items:center">'
     '<span style="width:24px;height:24px;flex:none;color:var(--ok-fg)">%s</span>'
     '<div><b style="font-size:15px;color:var(--ok-fg)">Within ±10%%</b>'
     '<div class="ts">2,180 W measured vs 2,232 W expected · <b class="mono">−2.3%%</b></div></div></div>'%I['tick']),
  ]),
  '<button class="btn btn-pri">Pass and register meter</button>'
  '<span class="ts">Next: gate pass, before you leave.</span>')

p2 = phone(sync('warn','Override request queued','1 pending'),'Prestige Ferns','Meter install · Basement parking · 21 Apr',
  ''.join([
   crd('', kv(('Circuit','<span class="mono">BsmtB/DB-1/bay-3</span>'),('Lights on circuit','58'),
        ('Watts each','55 W'),('Theoretical load','<b class="mono">3,190 W</b>'))),
   fld('Displayed load','4,100 W',big=True),
   crd('bad','<div style="display:flex;gap:9px;align-items:center">'
     '<span style="width:24px;height:24px;flex:none;color:var(--bad-fg)">%s</span>'
     '<div><b style="font-size:15px;color:var(--bad-fg)">Outside ±10%%</b>'
     '<div class="ts">4,100 W measured vs 3,190 W expected · <b class="mono">+28.5%%</b></div></div></div>'
     '<div class="ts">The meter shows 4,100 W. The survey says 3,190 W. Usually that means more lights on '
     'this circuit than were counted, or something else sharing it.</div>'%I['x']),
   '<div class="lbl">Work through the three causes</div>',
   crd('', ''.join([
     '<div style="display:flex;gap:8px;align-items:flex-start;font-size:13px">%s<span>More lights on the '
     'circuit than the survey counted — recount at the DB</span></div>'%CK,
     '<div style="display:flex;gap:8px;align-items:flex-start;font-size:13px">%s<span>Something else is on '
     'this circuit — a pump, a lift, signage</span></div>'%CU,
     '<div style="display:flex;gap:8px;align-items:flex-start;font-size:13px">%s<span>The recorded wattage '
     'is wrong — read the fitting label</span></div>'%CU,
   ])),
   ban('bad','lock','<b>You cannot pass this yourself.</b> An override is a backend decision with a name on '
     'it. The alternative is someone at 6pm deciding a 28% discrepancy is close enough, and a seven-year '
     'benchmark built on it.'),
   ban('warn','wifi','Sent when you’re back on signal. <b>You can’t finish this circuit today.</b> The other '
     'three circuits are unaffected — move to one of those.'),
  ]),
  '<button class="btn btn-sec">Recheck the reading</button>'
  '<button class="btn btn-ghost">Correct the survey count</button>')

D.add('SCR-020','Meter install &amp; load validation','<b>A gate, not a form.</b> CON-17’s ±10% comparison is '
 'the only on-site check that the survey was right — everything downstream assumes this circuit is what the '
 'survey said it was. There is no local override, by design.',
 rail(('Pass · register and move on', p1), ('Fail · three causes, no local override', p2)),
 states(
  ('Loading','<span class="ts">Circuit card renders from cache instantly.</span>'),
  ('Empty — first use','<span class="ts">The theoretical load and an empty meter field. The displayed-load '
   'field is the largest touch target on the screen.</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Partial / stale', ban('warn','wifi','Override sent when you’re back on signal. You can’t finish this '
   'circuit today.')),
  ('Error — network','<span class="ts">Capture continues; the sync bar carries the queue count. Nothing '
   'here blocks on signal except the override, which blocks honestly.</span>'),
  ('Error — permission','<span class="ts">Read-only for anyone not on the visit team.</span>'),
  ('Pending override', ban('bad','lock','Asked Priya Nair at 18:12. Blocked until answered — call ops if '
   'it’s urgent.'))))

# ---------------------------------------------------------------- SCR-021
p1 = phone(sync('ok','All synced'),'Prestige Ferns','Gate pass · taking equipment out · 13 Aug',
  ''.join([
   crd('','<div class="lbl">Items leaving site</div>'+
     kv(('Old fittings removed','<b class="mono">178</b>'),('Ladder, 12 ft','1'),
        ('Tool case','1'),('Empty cartons','14'))),
   ban('warn','warn','<b>You’re taking 178 fittings; today’s plan said 180.</b> Not a block — say what '
     'happened and the office reconciles it against the batch.'),
   '<div class="lbl">Society representative</div>',
   fld('Name','M. Bhaskar'),
   fld('Role','Facility Manager'),
   '<div class="fld"><label>Signature</label>'
   '<div class="sig done"><svg viewBox="0 0 200 50" style="width:150px;height:38px" fill="none" '
   'stroke="var(--text)" stroke-width="2" stroke-linecap="round">'
   '<path d="M8 34c10-14 16 6 24-4s10-18 16-10 4 20 12 16 10-22 18-16 6 18 14 14 12-16 20-12 10 12 18 10 14-10 22-14"/>'
   '</svg></div></div>',
   '<div class="lbl">Photo of the loaded trolley · required</div>', photos(1),
  ]),
  '<button class="btn btn-pri">Submit for approval</button>'
  '<span class="ts">This starts a 30-minute clock. You will not be held past it.</span>')

p2 = phone(sync('warn','Submitted at 20:40 — not yet sent','1 pending'),'Prestige Ferns',
  'Gate pass · awaiting approval',
  ''.join([
   '<div class="crd acc" style="align-items:center;text-align:center">'
   '<div class="lbl">You can leave provisionally in</div>'
   '<div class="big" style="font-size:44px">22:14</div>'
   '<div class="ts">Waiting for approval since 20:40 · asked Priya Nair</div>'
   '<div class="mtr" style="width:100%;margin-top:8px"><i style="width:26%;background:var(--warn-fg)"></i></div></div>',
   ban('info','i','<b>The clock runs from when you submitted, not from when this phone finds signal.</b> '
     'You submitted at 20:40 in the basement. Surfacing at 21:02 does not restart it — you have already '
     'waited 22 minutes.'),
   crd('', kv(('Items','178 fittings + 3 others'),('Signed by','M. Bhaskar, Facility Manager'),
        ('Submitted','20:40 · on this phone'),('Reached the office','not yet'))),
   '<div style="display:flex;gap:7px"><button class="btn btn-sec sm" style="flex:1;justify-content:center;'
   'min-height:44px">Call ops</button></div>',
   ban('warn','i','If nobody answers by 21:10 this releases provisionally. You may leave; the pass is '
     'flagged and reviewed afterwards. <b>A provisional release is a recorded event, never a silent pass.</b>'),
  ]),
  '<button class="btn btn-sec" disabled>Waiting for approval</button>')

D.add('SCR-021','Gate pass, including provisional release','<b>The only synchronous cross-surface contract in '
 'the product.</b> Everything else tolerates delay; this one blocks a human being at a gate. CON-40’s 30-minute '
 'provisional release exists because a technician in a basement at 9pm cannot be held indefinitely by an '
 'unanswered approval.',
 rail(('Items, signature, evidence', p1), ('The clock, running on capture time', p2)),
 states(
  ('Loading','<span class="ts">Expected item list from cache.</span>'),
  ('Empty — first use','<span class="ts">Scanner plus the expected list to check against. An unknown '
   'barcode falls back to free-text description, no friction.</span>'),
  ('Awaiting approval','<span class="ts">“Waiting for approval — 22 minutes until you can leave '
   'provisionally.” Stated plainly, never as a spinner.</span>'),
  ('Queried', ban('info','i','Ops asked: “Are the 14 cartons empty or packed?” <b>The clock is paused</b> '
   'while you answer, and says so.')),
  ('Provisional', ban('warn','tick','<b>Released provisionally. You can leave.</b> This will be reviewed by '
   'the office tomorrow.')),
  ('Partial / stale','<span class="ts">The countdown keeps running on device time and states that it is '
   'unsynced.</span>'),
  ('Error — permission','<span class="ts">Read-only for anyone not on the visit team.</span>')))

# ---------------------------------------------------------------- SCR-022
def window(name, spec, note, tone='', extra=''):
    return crd(tone,'<div style="display:flex;justify-content:space-between;gap:9px;align-items:baseline">'
      '<b style="font-size:13.5px">%s</b><span class="ts">%s</span></div>%s%s'%(name,note,slots(spec),extra))
p1 = phone(sync('ok','Synced 2 min ago'),'Prestige Ferns','Commissioning · post-install windows · 13 May',
  ''.join([
   ban('info','i','<b>Five consecutive valid days.</b> An anomaly on day 4 does not cost one day — it costs '
     'four, because the count restarts from the midnight after the fix. Each restart is shown the day it '
     'happens, with its cause.'),
   window('Corridor &amp; staircase',[('1','fill'),('2','fill'),('3','fill'),('4','fill'),('5','fill')],
     'complete','ok','<div class="ts">Finished 7 May · no restarts</div>'),
   window('Basement parking',[('1','fill'),('2','fill'),('3','fill'),('4','fill'),('5','fill')],
     'complete','ok','<div class="ts">Finished 1 May · no restarts</div>'),
   window('Lift lobby',[('1','fill'),('2','fill'),('3','fill'),('4','fill'),('5','fill')],
     'complete','ok','<div class="ts">Finished 7 May · load-check override on record</div>'),
   window('Podium &amp; landscape',[('1','fill'),('2','fill'),('3','fill'),('4','empty'),('5','empty')],
     'day 3 of 5','warn',
     '<div class="ts">If tomorrow is clean, this finishes <b>Friday 15 May</b>.</div>'
     '<div style="border-top:1px solid var(--border-subtle);padding-top:7px;margin-top:2px">'
     '<div class="lbl">Restarted twice</div>'
     '<div class="ts" style="margin-top:4px"><b>3 May</b> — connectivity gap, 14 h. Count restarted from the '
     'midnight after the fix.</div>'
     '<div class="ts"><b>10 May</b> — irrigation timer switched onto the circuit by the gardener. Removed '
     'the same day; count restarted 11 May.</div></div>'),
   crd('bad','<b style="font-size:13.5px">Blocking the deal</b>'
     '<div class="ts">Podium &amp; landscape is the only circuit without a benchmark. Pricing cannot start '
     'until it has one — the other three are done and are not waiting on anything.</div>'),
  ]),
  '')

p2 = phone(sync('ok','Synced 2 min ago'),'Podium &amp; landscape','Day 4 · 10 May · anomalous',
  ''.join([
   crd('bad','<div style="display:flex;gap:9px;align-items:center">'
     '<span style="width:22px;height:22px;flex:none;color:var(--bad-fg)">%s</span>'
     '<div><b style="font-size:14px;color:var(--bad-fg)">Day 4 was anomalous</b>'
     '<div class="ts">so the count restarted. You’re back to day 1 of 5, and this circuit now finishes on '
     'the 15th instead of the 11th.</div></div></div>'%I['warn']),
   crd('','<div class="lbl">That day’s readings</div>'+
     kv(('Expected daily','~14.2 kWh'),('Measured','31.6 kWh'),('Variance','<b style="color:var(--bad-fg)">+122%</b>'),
        ('Judged','anomalous — not excluded'))+
     '<div class="ts">An excluded day (install, replacement) looks visibly different from an anomalous one, '
     'because they mean different things.</div>'),
   '<div class="fld"><label>What did you fix, and when?</label>'
   '<div class="fin" style="height:auto;min-height:70px;align-items:flex-start;font-size:13.5px;white-space:normal">'
   'Gardener had plugged the drip irrigation timer into the landscape lighting circuit. Removed it and showed '
   'him the correct socket. 10 May, 16:30.</div></div>',
   ban('info','i','Recording the fix restarts the count from <b>the following midnight</b>, not from now. '
     'The restart, its cause and your name all stay on the circuit’s record.'),
   crd('','<div class="lbl">Only ops can do this</div>'
     '<div class="ts">Marking a day <b>excluded</b> rather than anomalous changes the benchmark’s basis, so '
     'it is not available on this surface.</div>'),
  ]),
  '<button class="btn btn-pri">Record the fix</button>')

D.add('SCR-022','Commissioning monitor','A watch screen whose entire job is to make a restart visible the day '
 'it happens rather than a week later. Five discrete slots, not a percentage — because five consecutive valid '
 'days is what the rule actually counts, and a circuit can sit at “day 2 of 5” for three weeks.',
 rail(('Four circuits, four independent clocks', p1), ('One anomalous day and its cause', p2)),
 states(
  ('Loading','<span class="ts">Skeleton per circuit.</span>'),
  ('Empty — first use','<span class="ts">“Monitoring starts tomorrow. Today’s partial day doesn’t '
   'count.”</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Restarted', ban('bad','warn','Day 4 was anomalous, so the count restarted. You’re back to day 1 of 5.')),
  ('Stalled', ban('warn','warn','This circuit has restarted 4 times in 18 days. Escalated to ops.'
   '<div class="ts" style="margin-top:3px;color:inherit;opacity:.85">The threshold — 3 restarts or 14 days — '
   'is proposed, not derived. It needs a real number once there is operating history.</div>')),
  ('Partial / stale','<span class="ts">Read-only from cache with the last-synced time on the header.</span>'),
  ('Success', ban('ok','tick','Five valid days. Window complete → benchmark result.'))))

# ---------------------------------------------------------------- SCR-023
p1 = phone(sync('ok','All synced'),'Lift lobby','Light replacement · 2 May',
  ''.join([
   '<div class="crd acc" style="align-items:center;text-align:center">'
   '<div class="lbl">Replaced</div><div class="big">28 <span style="color:var(--text-subtle)">/ 41</span></div>'
   '<div class="ts">must match exactly before the post-install window can start</div>'
   '<div class="mtr" style="width:100%;margin-top:8px"><i style="width:68%"></i></div></div>',
   crd('','<div class="lbl">Coming out</div>'+kv(('Brand','Wipro'),('Model','LD40-CW'),('Watts','40 W'))),
   crd('','<div class="lbl">Going in</div>'+kv(('Brand','Havells'),('Model','LHEBLBP'),('Watts','12 W'))+
     '<div class="ts">Feeds the savings narrative on the demo report.</div>'),
   '<div class="lbl">Photos · before and after, required</div>', photos(4),
   fld('Replaced count','28',big=True),
  ]),
  '<button class="btn btn-pri" disabled>Complete replacement</button>'
  '<span class="ts">13 fittings still to go.</span>')

p2 = phone(sync('warn','Saved on this phone','2 pending'),'Lift lobby','Light replacement · blocked',
  ''.join([
   ban('bad','x','<b>Only 28 of 41 are in.</b> The post-install measurement can’t start on a mixed circuit, '
     'so it’ll begin once the rest are done. A return visit has been raised for 4 May.'),
   crd('bad','<div class="lbl">Why this is a block and not a note</div>'
     '<div class="ts">A window measured across a half-swapped circuit produces a benchmark that is '
     'meaningless — and nothing about the readings themselves would look wrong. It would pass every '
     'validity check and be wrong for seven years.</div>'),
   crd('', kv(('Short by','13 fittings'),('Reason','Stock ran out — 41 ordered, 28 delivered'),
        ('Post-window','<b style="color:var(--bad-fg)">not started</b>'),
        ('Return visit','Mon 4 May · raised automatically'))),
   ban('info','i','The pre-install window is safe and stays complete. Only the post-install window waits.'),
  ]),
  '<button class="btn btn-sec">Close visit</button>'
  '<span class="ts">Gate pass next, before you leave.</span>')

D.add('SCR-023','Demo installation / light replacement','Records the swap that separates the two measurement '
 'windows — and treats “partially done” as a <b>blocking state, not a note</b>. If stock runs short and only '
 'some fittings are swapped, the post-install window measures a mixed state and the benchmark from it is '
 'meaningless, while looking perfectly valid.',
 rail(('In progress against an exact target', p1), ('Short stock — measurement cannot begin', p2)),
 states(
  ('Loading','<span class="ts">Target count from cache.</span>'),
  ('Empty — first use','<span class="ts">The target and an empty capture form.</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Blocked — partial', ban('bad','x','Measurement can’t start until all 41 are in. A return visit has '
   'been raised.')),
  ('Error — network','<span class="ts">Full capture offline; the queue count sits in the sync bar.</span>'),
  ('Error — permission','<span class="ts">Read-only for anyone not on the visit team.</span>'),
  ('Success', ban('ok','tick','41 of 41 replaced. The post-install window starts at midnight tonight — '
   '3 May.'))))

# ---------------------------------------------------------------- SCR-024
p1 = phone(sync('ok','Synced 4 min ago'),'Corridor &amp; staircase','Benchmark result · 8 May',
  ''.join([
   '<div class="crd ok" style="align-items:center;text-align:center">'
   '<div class="lbl">Measured saving</div><div class="big">68.4277%%</div>'
   '<div style="margin-top:5px">%s</div>'
   '<div class="ts" style="margin-top:5px">Shown to 4 decimal places. <b>Stored unrounded</b> — this is the '
   'number the contract is written against and every future month is compared to.</div></div>'%chip('ok','within 60–80%%','tri'),
   crd('','<div class="lbl">The working</div>'+
     kv(('Pre-install daily average','<b class="mono">74.2140</b> kWh'),
        ('Post-install daily average','<b class="mono">23.4310</b> kWh'),
        ('Saving','<b class="mono">68.4277%</b>'))+
     '<div class="ts">Both windows are always shown. The figure has to be reproducible from what is on '
     'this screen.</div>'),
   crd('','<div class="lbl">Which days counted</div>'+
     '<div class="ts">Pre-install · 18–22 Apr</div>'+slots([('18','fill'),('19','fill'),('20','fill'),('21','fill'),('22','fill')])+
     '<div class="ts" style="margin-top:7px">Post-install · 24–28 Apr · 23 Apr excluded, replacement day</div>'+
     slots([('23','excl'),('24','fill'),('25','fill'),('26','fill'),('27','fill'),('28','fill')])),
   crd('','<div class="lbl">Physical explanation</div>'+
     kv(('Out','Wipro LD40-CW · 40 W'),('In','Havells LHEBLBP · 12 W'),('Fitting reduction','70%'))),
   crd('','<div class="lbl">Sibling circuits</div>'+
     kv(('Basement parking','<span class="mono">71.2%</span>'),('Lift lobby','<span class="mono">68.0%</span>'),
        ('Podium &amp; landscape','<span class="ts">measuring</span>'))+
     '<div class="ts">A circuit far from its siblings is worth a second look.</div>'),
  ]),
  '<button class="btn btn-sec" disabled>Accept — office only</button>'
  '<span class="ts">Field staff cannot lock a benchmark. Ops accepts it.</span>')

p2 = phone(sync('ok','Synced 4 min ago'),'Podium &amp; landscape','Benchmark result · out of range',
  ''.join([
   '<div class="crd bad" style="align-items:center;text-align:center">'
   '<div class="lbl">Measured saving</div><div class="big" style="color:var(--bad-fg)">46.2038%%</div>'
   '<div style="margin-top:5px">%s</div></div>'%chip('bad','below 60–80%%'),
   ban('bad','i','This circuit measured 46.2%. That’s below the 60–80% range, which <b>usually means a '
     'measurement problem rather than a bad install</b>. Installation and the office will look at it in '
     'the morning.'),
   crd('','<div class="lbl">The two usual explanations</div>'
     '<div class="ts" style="margin-top:4px"><b>Below range</b> — something else drew on the circuit during '
     'one of the windows, or the old fittings were already efficient.</div>'
     '<div class="ts"><b>Above range</b> — the old fittings were worse than the survey recorded.</div>'
     '<div class="ts" style="margin-top:5px">Both are findings, not errors. Out of range is '
     '<b>investigated, never discarded on the spot</b>.</div>'),
   crd('', kv(('Pre-install daily average','<b class="mono">18.9022</b> kWh'),
        ('Post-install daily average','<b class="mono">10.1704</b> kWh'),
        ('Restarts during measurement','<b style="color:var(--warn-fg)">2</b>'))),
   '<div class="fld"><label>What did you see on site?</label>'
   '<div class="fin ph" style="height:auto;min-height:66px;align-items:flex-start;white-space:normal">'
   'Note anything that might explain it — required before sending</div></div>',
  ]),
  '<button class="btn btn-pri">Send for investigation</button>')

D.add('SCR-024','Benchmark result &amp; out-of-range review','The figure is <b>never rounded</b> — whatever '
 'the two measured averages produce is what the contract is written against, and a tidied number is one '
 'nobody can reproduce. Out of range goes to investigation the next morning, not to a decision on the spot.',
 rail(('In range · the full working', p1), ('Out of range · a finding, not an error', p2)),
 states(
  ('Loading','<span class="ts">Skeleton.</span>'),
  ('Empty — first use','<span class="ts">“Waiting on the post-install window — day 3 of 5.”</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Under investigation','<span class="ts">Who is looking, since when, and any findings so far.</span>'),
  ('Partial / stale','<span class="ts">Read-only from cache, timestamped.</span>'),
  ('Error — permission','<span class="ts">Accept is hidden for field staff; investigate stays '
   'available.</span>'),
  ('Re-run a window', ban('warn','warn','Discarding the post-install window costs another five days and '
   'the modal says so before you confirm.'))))

# ---------------------------------------------------------------- SCR-061
p1 = phone(sync('warn','Saved on this phone','9 pending · 6 photos'),'Prestige Ferns',
  'Day 4 · Basement A · Thursday 13 Aug',
  ''.join([
   '<div class="crd warn" style="align-items:center;text-align:center">'
   '<div class="lbl">Submit by 18:00 to keep tomorrow’s start</div>'
   '<div class="big" style="font-size:34px">1 h 20 m</div>'
   '<div class="ts">it’s 16:40 · the society then needs 3 hours to review</div></div>',
   crd('','<div class="lbl">Today’s target for this area</div>'+
     kv(('Planned','180 fittings'),('Recorded so far','<b class="mono">142</b>'),
        ('Against plan','<span style="color:var(--warn-fg)">38 behind</span>'))+
     '<div class="mtr"><i style="width:78.9%"></i></div>'),
   fld('Fittings installed','142',big=True),
   fld('Where in Basement A','Bays 1–7 and the ramp landing, north half'),
   '<div class="ts" style="margin-top:-6px">What a disputing onlooker needs in order to go and check.</div>',
   fld('Old fittings taken away','142',note='Reconciles against the outbound gate pass'),
   '<div class="lbl">Photos · required</div>', photos(6),
   crd('','<div class="lbl">Other areas today</div>'+
     kv(('Tower B &amp; C corridors · Mahesh N.','<span class="chip ok"><span class="tri"></span>submitted</span>'),
        ('Basement B · Faisal K.','<span class="chip neu"><span class="dot"></span>tomorrow</span>'))+
     '<div class="ts">Read-only. Three technicians hold three separate batches — <b>areas are fixed at '
     'creation, so nothing is contested</b>. The society reviews one merged day, not three batches.</div>'),
  ]),
  '<button class="btn btn-pri">Submit today’s batch</button>'
  '<button class="btn btn-ghost">Add a blocker</button>')

p2 = phone(sync('bad','Not sent — no signal','11 pending · 6 photos'),'Prestige Ferns',
  'Day 4 · Basement A · submitted',
  ''.join([
   ban('bad','warn','<b>Submit within 40 minutes or tomorrow’s start is at risk.</b> The society has to '
     'approve this at least 3 hours before the crew arrives, and they cannot start reviewing until it '
     'reaches them.'),
   crd('bad','<div class="lbl">Submitted, but not delivered</div>'
     '<div class="ts">Saved on this phone at 17:22. <b>It has not reached the society yet</b> — the '
     'notification goes out when this phone finds signal. Walk up the ramp if you can.</div>'),
   crd('', kv(('Fittings installed','162'),('Removed and taken away','162'),
        ('Photos','6 · queued'),('Submitted','17:22 · device time'),
        ('Reached the office','<b style="color:var(--bad-fg)">not yet</b>'))),
   ban('warn','warn','<b>60 more fittings in Basement B than the survey recorded.</b> That changes the '
     'represented count, which changes the benchmark basis, which changes the bill. This screen raises an '
     'amendment and stops — it cannot be corrected here.'
     '<div style="margin-top:8px"><button class="btn btn-sec sm">Raise a scope change</button></div>'),
  ]),
  '<button class="btn btn-sec">Sync now</button>'
  '<span class="ts">Reopening is possible until the society starts reviewing.</span>')

D.add('SCR-061','Daily batch capture','PER-04’s highest-frequency screen, and the one most likely to run three '
 'phones at once. Batches are <b>area-scoped from creation</b>, so nothing is contested by construction. The '
 'CON-21 deadline is shown <i>during</i> capture, not after submission — because tomorrow’s crew is the one '
 'that pays for a batch submitted at 8pm.',
 rail(('Capture, with the deadline visible', p1), ('No signal · submitted ≠ delivered', p2)),
 states(
  ('Loading','<span class="ts">Plan from cache.</span>'),
  ('Empty — first use','<span class="ts">Today’s target for this area, and the submit-by deadline.</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Deadline at risk', ban('warn','warn','Tomorrow’s crew can’t start unless the society approves this by '
   '18:00. It’s 16:40.')),
  ('Submitted','<span class="ts">Awaiting the society’s review, with <i>their</i> deadline shown — not just '
   'yours.</span>'),
  ('Error — permission','<span class="ts">Read-only, with this batch’s owner named.</span>'),
  ('Success', ban('ok','tick','Approved by R. Menon at 19:12. Tomorrow’s start is clear.'))))

# ---------------------------------------------------------------- SCR-064
def gate(state, label, detail):
    tone={'bad':'bad','warn':'warn','ok':'ok'}[state]
    ic={'bad':I['x'],'warn':I['warn'],'ok':I['tick']}[state]
    col={'bad':'var(--bad-fg)','warn':'var(--warn-fg)','ok':'var(--ok-fg)'}[state]
    return crd(tone,'<div style="display:flex;gap:9px;align-items:flex-start">'
      '<span style="width:17px;height:17px;flex:none;margin-top:1px;color:%s">%s</span>'
      '<div><b style="font-size:13.5px">%s</b><div class="ts">%s</div></div></div>'%(col,ic,label,detail))
p1 = phone(sync('ok','All synced'),'Prestige Ferns','Completion certificate · 13 Aug',
  ''.join([
   ban('bad','lock','<b>Three things block this signature.</b> A certificate signed while batches are still '
     'disputed starts billing on contested work.'),
   gate('bad','1 batch disputed','Day 3 · Tower B &amp; C corridors — the society disputes 12 fittings. '
     'Resolve on the batch review.'),
   gate('warn','2 open blockers','Basement B count discrepancy (amendment AMD-01 unsigned) · Tower B lift '
     'lobby access denied until 16 Aug. Only ops can waive these.'),
   gate('warn','3 of 7 days still to run','Days 5, 6 and 7 are planned but not worked.'),
   crd('','<div class="lbl">Installed so far, by area</div>'+
     kv(('Tower A corridors','450'),('Tower B &amp; C corridors','170'),('Basement A','162'),
        ('Basement B','—'),('Lift lobbies','—'),('Podium &amp; landscape','—'),
        ('<b>Total</b>','<b class="mono">782 of 1,260</b>'))),
   crd('','<div class="lbl">Against contracted scope</div>'
     '<div class="ts">Contract says 1,200. Site has 1,260. The 60-light variance is on amendment AMD-01, '
     'awaiting signature — named here rather than absorbed into the total.</div>'),
  ]),
  '<button class="btn btn-pri" disabled>Sign certificate</button>'
  '<span class="ts">Blocked. Each gate above names what clears it.</span>')

p2 = phone(sync('ok','All synced'),'Prestige Ferns','Completion certificate · ready to sign',
  ''.join([
   crd('ok','<div style="display:flex;gap:9px;align-items:center">'
     '<span style="width:20px;height:20px;flex:none;color:var(--ok-fg)">%s</span>'
     '<div><b style="font-size:14px">All gates clear</b><div class="ts">7 of 7 days worked · '
     '0 disputes · 0 open blockers · AMD-01 signed 18 Aug</div></div></div>'%I['tick']),
   '<div class="crd acc" style="align-items:center;text-align:center">'
   '<div class="lbl">Billing starts</div>'
   '<div class="big" style="font-size:26px">21 August 2026</div>'
   '<div class="ts">the day after signing — not today</div></div>',
   crd('','<div class="lbl">First invoice</div>'+
     kv(('Period','21–31 August'),('Days','11 of 31'),('Estimated','<b class="mono">₹40,937</b>'))+
     '<div class="ts">Prorated on actual days, and stated here so nobody meets it for the first time on '
     'the invoice.</div>'),
   crd('', kv(('Total installed','1,260 fittings'),('Contracted','1,260 after AMD-01'),('Variance','none'))),
   '<div class="lbl">Society representative</div>',
   fld('Name','K. Ramamurthy'), fld('Role','Secretary'),
   '<div class="fld"><label>Signature</label><div class="sig">Sign here</div></div>',
   ban('info','wifi','If you sign with no signal, the signature is safe on this phone and queues. '
     '<b>The certificate is not final until it syncs</b>, and this screen will not imply billing has started '
     'before then.'),
  ]),
  '<button class="btn btn-pri">Sign — billing starts 21 August</button>')

D.add('SCR-064','Completion certificate','<b>The signature that ends installation and starts billing</b>, and '
 'two rules meet here that are both money: a certificate signed over disputed batches bills contested work, '
 'and billing begins the day <i>after</i> the signature. The screen states the billing start date before the '
 'signature, never after.',
 rail(('Blocked, with each gate named', p1), ('Ready — and what signing costs', p2)),
 states(
  ('Loading','<span class="ts">Summary from cache.</span>'),
  ('Empty — first use','<span class="ts">“3 of 11 days still to run.”</span>'),
  ('Empty — filtered','<span class="ts">Not applicable.</span>'),
  ('Blocked','<span class="ts">Each gate listed with what clears it — never a greyed button with no '
   'explanation.</span>'),
  ('Partial / stale','<span class="ts">Cached summary; the signature captures locally and queues.</span>'),
  ('Error — permission','<span class="ts">Read-only for anyone not on the team. Waiving a blocker is ops '
   'only, and does not appear here at all.</span>'),
  ('Open question','<span class="ts">A certificate signed offline and synced two days later bills from the '
   '<b>signature date</b>, per the surface’s time rule. That favours the society — but it backdates a '
   'billing start, and that consequence is not yet accepted by anyone.</span>')))

n,size = D.build('field.html','Field Surface')
print('screens: %d  bytes: %d'%(n,size))
