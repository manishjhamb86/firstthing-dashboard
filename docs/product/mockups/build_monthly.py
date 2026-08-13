# -*- coding: utf-8 -*-
import io, html

CSS = io.open('_tokens.css', encoding='utf-8').read()

I = {
 'grid':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
 'bldg':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 21h18M6 21V7l6-4 6 4v14"/></svg>',
 'up':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
 'chk':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
 'rs':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h4"/></svg>',
 'inv':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
 'warn':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
 'chart':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg>',
 'api':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M4 12a8 8 0 0 1 8-8M20 12a8 8 0 0 1-8 8"/><circle cx="12" cy="12" r="2.5"/></svg>',
 'doc':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
 'cash':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
 'tick':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
 'x':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
 'i':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
}
CK = '<span class="cbx on">'+I['tick']+'</span>'
CU = '<span class="cbx"></span>'

NAV = [('grid','Portfolio',None,''),('bldg','Societies',None,''),
       ('__g','Monthly close','',''),
       ('up','Readings','SCR-080',''),('api','Vendor fetch','SCR-084',''),
       ('rs','Anomalies','SCR-081','4'),('chk','Readiness','SCR-082','6'),
       ('chart','Compliance','SCR-090',''),('doc','Reports','SCR-091',''),
       ('cash','Release queue','SCR-092','12'),('inv','Invoices','SCR-093',''),
       ('warn','Deviations','SCR-110','3'),('cash','Arrears','SCR-120','9')]

def shell(active, crumb, title, actions, body):
    nav=[]
    for ic,label,scr,ct in NAV:
        if ic=='__g':
            nav.append('<div class="nvg">%s</div>'%label); continue
        on=' on' if scr==active else ''
        c='<span class="ct">%s</span>'%ct if ct else ''
        nav.append('<a class="nv%s">%s%s%s</a>'%(on,I[ic],label,c))
    return ('<div class="app"><div class="appbody"><nav class="side">'
      '<div class="brand"><span class="mk">F</span>FirsThing</div>%s</nav>'
      '<div class="main"><div class="top"><div><div class="crumb">%s</div>'
      '<h2 style="margin-top:2px">%s</h2></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">%s</div></div>'
      '<div class="body">%s</div></div></div></div>')%(''.join(nav),crumb,title,actions,body)

def states(*rows):
    out=['<div class="states"><div class="lbl">States</div><div class="stgrid">']
    for name,inner in rows:
        out.append('<div class="st"><div class="sh">%s</div><div class="sb">%s</div></div>'%(name,inner))
    out.append('</div></div>')
    return ''.join(out)

SK='<div class="sk" style="width:70%%"></div><div class="sk" style="width:92%%"></div><div class="sk" style="width:48%%"></div>'

def screen(sid,name,note,app,st,first=False):
    return ('<section class="screen%s" data-scr="%s"><div class="scrhead"><span class="scrid">%s</span>'
            '<h2>%s</h2><p class="scrnote">%s</p></div>%s%s</section>')%(
            ' on' if first else '',sid,sid,name,note,app,st)

S=[]

# ---------------- SCR-080 ----------------
recon = '''
<div class="ban warn">%s<span><b>14 readings disagree with what's already stored.</b> Nothing has been changed. Select the ones to replace, or commit and leave them alone.</span></div>
<div class="kpis">
 <div class="card"><span class="lbl">New</span><span class="v">1,104</span><span class="ts">will be imported</span></div>
 <div class="card"><span class="lbl">Already match</span><span class="v">312</span><span class="ts">ignored silently</span></div>
 <div class="card"><span class="lbl">Disagree</span><span class="v" style="color:var(--warn-fg)">14</span><span class="ts">nothing selected</span></div>
 <div class="card"><span class="lbl">Missing</span><span class="v">6</span><span class="ts">no reading either side</span></div>
</div>
<div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
 <h3>Conflicts — Basement parking, 6 days</h3><div style="display:flex;gap:7px;align-items:center"><span class="cbx"></span><span class="ts">Select all 14</span></div></div>
<div class="tw"><table class="t"><thead><tr><th style="width:26px"></th><th>Interval</th><th class="ta-r">In system</th><th class="ta-r">In this file</th><th class="ta-r">Difference</th><th>Stored value came from</th></tr></thead><tbody>
<tr><td>%s</td><td>14 Jul 09:00</td><td class="ta-r mono">41.20</td><td class="ta-r mono">43.80</td><td class="ta-r mono" style="color:var(--warn-fg)">+2.60</td><td class="ts">API fetch, 14 Jul 23:10</td></tr>
<tr><td>%s</td><td>14 Jul 10:00</td><td class="ta-r mono">39.75</td><td class="ta-r mono">42.10</td><td class="ta-r mono" style="color:var(--warn-fg)">+2.35</td><td class="ts">API fetch, 14 Jul 23:10</td></tr>
<tr><td>%s</td><td>19 Jul 06:00</td><td class="ta-r mono">28.40</td><td class="ta-r mono">28.40</td><td class="ta-r mono sub">—</td><td class="ts">manual correction — A. Rao, 22 Jul</td></tr>
<tr><td><span class="chip neu" style="font-size:10px">Locked</span></td><td>02 Jul 08:00</td><td class="ta-r mono">44.10</td><td class="ta-r mono">44.55</td><td class="ta-r mono sub">+0.45</td><td class="ts" style="color:var(--bad-fg)">In the released June calculation — cannot be changed</td></tr>
</tbody></table></div>
<p class="ts">Rows that already match are not listed. Re-uploading the same file reports nothing.</p></div>
<div class="panel"><h3>Missing — 6 intervals with no reading from either source</h3>
<div class="fil"><span class="chip neu">07 Jul 02:00</span><span class="chip neu">07 Jul 03:00</span><span class="chip neu">18 Jul 21:00</span><span class="chip neu">18 Jul 22:00</span><span class="chip neu">18 Jul 23:00</span><span class="chip neu">26 Jul 14:00</span></div>
<p class="ts">Reported, never filled. Feeds the month's coverage figure — no interpolation, no carry-forward.</p></div>
<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri">Commit — 1,104 new, 0 replaced</button><button class="btn btn-sec">Back to files</button></div>
''' % (I['warn'],CU,CU,CU)

S.append(screen('SCR-080','Reading upload & reconciliation',
 'The four classes, exactly as CON-43 now specifies them. <b>Nothing pre-selected</b> — committing with no conflicts ticked imports the new rows and leaves every stored value untouched, which is the expected path rather than a special case. A row already inside a released calculation carries no checkbox at all.',
 shell('SCR-080','Monthly close / July 2026','Reading upload',
   '<span class="chip warn"><span class="tri"></span>Day 11 of 17</span><button class="btn btn-sec sm">Quarantine</button>',
   '<div class="fil"><span class="fc on">Settlement Nexus — Basement parking.csv</span><span class="fc">Stilt parking.csv</span><span class="fc">Lift lobby.csv</span></div>'+recon),
 states(('Loading',SK),
   ('Empty — first use','<div class="drop">Drop this month’s meter exports here.<br><span class="ts">One file per circuit; a whole folder is fine.</span></div>'),
   ('Reconciled — clean','<div class="ban ok">'+I['tick']+'<span><b>1,104 new readings.</b> Nothing already stored disagrees.</span></div>'),
   ('Reconciled — no-op','<div class="ban info">'+I['i']+'<span>These readings are already in the system. Nothing to import.</span></div><button class="btn btn-pri sm" disabled>Commit</button>'),
   ('Bulk conflict','<div class="ban warn">'+I['warn']+'<span><b>All 744 conflicts differ by less than 0.01 kWh.</b> This usually means the vendor changed their export precision.</span></div>'),
   ('Blocked — closed month','<div class="ban bad">'+I['x']+'<span>July is closed. Reopen it on the readiness board before replacing readings.</span></div>'),
   ('Error — AI unavailable','<div class="ban warn">'+I['warn']+'<span>Automatic column detection is unavailable. Map the columns yourself and carry on.</span></div>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>1,104 readings added. 312 already matched and were left alone.</span></div>')),
 first=True))

# ---------------- SCR-084 ----------------
S.append(screen('SCR-084','Vendor API fetch monitor',
 'Path B of CON-43. Three distinguishable failure kinds, because each has a different owner: the vendor API erroring is integration’s, a single meter offline is field dispatch’s, and a gap in an otherwise-reporting meter is data quality’s. <b>A conflict found here is recorded, never applied</b> — no-silent-overwrite is a property of the data, not of the upload screen.',
 shell('SCR-084','Monthly close','Vendor fetch',
   '<span class="chip ok"><span class="dot"></span>Last run 04:00</span><button class="btn btn-sec sm">Refresh selected</button>',
   '''<div class="kpis">
   <div class="card"><span class="lbl">Meters reporting</span><span class="v">84 / 90</span><span class="ts">last 24h</span></div>
   <div class="card"><span class="lbl">API errors</span><span class="v" style="color:var(--bad-fg)">1</span><span class="ts">integration</span></div>
   <div class="card"><span class="lbl">Meters offline</span><span class="v" style="color:var(--warn-fg)">4</span><span class="ts">field dispatch</span></div>
   <div class="card"><span class="lbl">Gaps in reporting</span><span class="v" style="color:var(--warn-fg)">1</span><span class="ts">data quality</span></div></div>
   <div class="tw"><table class="t"><thead><tr><th>Meter</th><th>Society / circuit</th><th class="ta-r">Last reading</th><th class="ta-r">Coverage</th><th>State</th><th>Owner</th></tr></thead><tbody>
   <tr class="risk r-bad"><td class="mono ts">MTR-00412</td><td><div class="nm">Settlement Vega</div><div class="ts">Basement parking</div></td><td class="ta-r mono">—</td><td class="ta-r mono">18/31</td><td><span class="chip bad"><span class="sq"></span>API error 502</span></td><td class="ts">Integration</td></tr>
   <tr class="risk r-warn"><td class="mono ts">MTR-00388</td><td><div class="nm">Prestige Ferns</div><div class="ts">Lift lobby</div></td><td class="ta-r mono">09 Aug</td><td class="ta-r mono">0/31</td><td><span class="chip warn"><span class="tri"></span>Meter offline</span></td><td class="ts">Field dispatch</td></tr>
   <tr class="risk r-warn"><td class="mono ts">MTR-00401</td><td><div class="nm">ASF Insignia</div><div class="ts">Staircase</div></td><td class="ta-r mono">13 Aug</td><td class="ta-r mono">27/31</td><td><span class="chip warn"><span class="tri"></span>4-day gap</span></td><td class="ts">Data quality</td></tr>
   <tr class="risk r-ok"><td class="mono ts">MTR-00355</td><td><div class="nm">Settlement Nexus</div><div class="ts">Basement parking</div></td><td class="ta-r mono">13 Aug</td><td class="ta-r mono">31/31</td><td><span class="chip ok"><span class="dot"></span>Reporting</span></td><td class="ts">—</td></tr>
   </tbody></table></div>
   <div class="ban info">'''+I['i']+'''<span><b>2 conflicts recorded, none applied.</b> The fetch found values differing from stored readings on Settlement Nexus. They are listed for review on the upload screen.</span></div>'''),
 states(('Loading',SK),
   ('Empty — not configured','<div class="empty"><strong>The vendor API isn’t connected yet.</strong><span class="ts">Readings come from manual upload until it is.</span></div>'),
   ('Partial / stale','<div class="ban warn">'+I['warn']+'<span>Last successful run was 31 hours ago.</span></div>'),
   ('Error — whole API down','<div class="ban bad">'+I['x']+'<span><b>The vendor API is unreachable.</b> All 90 meters are affected — this is one problem, not ninety.</span></div>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>90 of 90 meters reporting.</span></div>'))))

# ---------------- SCR-081 ----------------
S.append(screen('SCR-081','Anomaly & coverage review',
 'Coverage below 20 days flips a circuit to unusable (CON-12), so the count is stated as a fraction rather than a percentage — <b>28/31 and 20/31 are different kinds of month</b>, and a percentage flattens that.',
 shell('SCR-081','Monthly close / July 2026','Anomalies & coverage',
   '<button class="btn btn-sec sm">Export</button><button class="btn btn-pri sm">Resolve 4</button>',
   '''<div class="fil"><span class="fc on">Needs a decision <span class="ct" style="background:var(--warn-fg);color:var(--surface)">4</span></span><span class="fc">Resolved</span><span class="fc">Coverage below 28</span><span class="fc">All circuits</span></div>
   <div class="tw"><table class="t"><thead><tr><th>Society / circuit</th><th class="ta-r">Coverage</th><th>Anomaly</th><th class="ta-r">Daily mean</th><th class="ta-r">vs last month</th><th>Decision</th></tr></thead><tbody>
   <tr class="risk r-bad"><td><div class="nm">Settlement Vega</div><div class="ts">Basement parking</div></td><td class="ta-r mono" style="color:var(--bad-fg)">18/31</td><td><span class="chip bad"><span class="sq"></span>Below usable</span></td><td class="ta-r mono">412.8</td><td class="ta-r mono sub">—</td><td><button class="btn btn-sec sm">Request re-upload</button></td></tr>
   <tr class="risk r-warn"><td><div class="nm">ASF Insignia</div><div class="ts">Staircase</div></td><td class="ta-r mono">27/31</td><td><span class="chip warn"><span class="tri"></span>4-day gap</span></td><td class="ta-r mono">208.4</td><td class="ta-r mono">−1.2%</td><td><button class="btn btn-sec sm">Exclude days</button></td></tr>
   <tr class="risk r-warn"><td><div class="nm">Brigade Cornerstone</div><div class="ts">Lift lobby</div></td><td class="ta-r mono">31/31</td><td><span class="chip warn"><span class="tri"></span>Single-day spike ×4.2</span></td><td class="ta-r mono">341.0</td><td class="ta-r mono">+18.9%</td><td><button class="btn btn-sec sm">Review day</button></td></tr>
   <tr class="risk r-warn"><td><div class="nm">Emerald Isle</div><div class="ts">External</div></td><td class="ta-r mono">31/31</td><td><span class="chip warn"><span class="tri"></span>Flat line, 9 days</span></td><td class="ta-r mono">96.2</td><td class="ta-r mono">−32.4%</td><td><button class="btn btn-sec sm">Dispatch check</button></td></tr>
   </tbody></table></div>
   <div class="ban info">'''+I['i']+'''<span>A flat line is a meter fault far more often than a saving. It routes to field dispatch, not to a deviation review.</span></div>'''),
 states(('Loading',SK),
   ('Empty — all clean','<div class="empty"><strong>No anomalies this month</strong><span class="ts">All 90 circuits reported 28 days or more.</span></div>'),
   ('Empty — filtered','<span class="ts">No circuits match “Coverage below 28”.</span><button class="btn btn-ghost sm">Clear filter</button>'),
   ('Partial / stale','<div class="ban info">'+I['i']+'<span>Readings are still importing for 12 circuits.</span></div>'),
   ('Error — network','<span class="ts">Couldn’t load anomalies.</span><button class="btn btn-sec sm">Retry</button>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>4 anomalies resolved. July is ready to close.</span></div>'))))

# ---------------- SCR-082 ----------------
rows82 = [
 ('r-bad',CU,'Settlement Vega','Sarjapur · 1,240 flats','5','18 / 31','—','66.2%','bad','sq','Missing readings','—'),
 ('r-bad',CU,'Prestige Ferns','Whitefield · 1,080 flats','4','0 / 31','—','64.8%','bad','sq','Missing readings','—'),
 ('r-warn',CK,'Settlement Nexus','Whitefield · 1,410 flats','4','31 / 31','66.4%','67.6%','warn','tri','2nd month out','₹48,210'),
 ('r-warn',CU,'Brigade Cornerstone','Whitefield · 1,650 flats','5','31 / 31','61.9%','68.0%','info','dot','Disputed','₹62,740'),
 ('r-warn',CK,'ASF Insignia','Gurugram · 1,120 flats','4','31 / 31','63.1%','67.2%','warn','tri','Approaching edge','₹41,905'),
 ('r-ok',CU,'Aditya Mega City','Bhiwadi · 2,300 flats','5','31 / 31','69.8%','68.4%','ok','dot','Ready','₹87,320'),
 ('r-ok',CU,'Emerald Isle','Powai · 1,004 flats','3','31 / 31','65.5%','65.0%','ok','dot','Ready','₹38,460'),
 ('r-ok',CU,'Nirvana Country','Gurugram · 1,380 flats','4','31 / 31','70.2%','69.1%','ok','dot','Ready','₹54,180'),
]
tb=[]
for r,cb,nm,sub,ci,rd,ms,bm,tone,shape,lab,fee in rows82:
    sel=' sel' if cb==CK else ''
    tb.append('<tr class="risk %s%s"><td>%s</td><td><div class="nm">%s</div><div class="ts">%s</div></td>'
      '<td class="ts">%s</td><td class="ta-r mono">%s</td><td class="ta-r mono%s">%s</td><td class="ta-r mono">%s</td>'
      '<td><span class="chip %s"><span class="%s"></span>%s</span></td><td class="ta-r mono%s">%s</td></tr>'%(
      r,sel,cb,nm,sub,ci,rd,' sub' if ms=='—' else '',ms,bm,tone,shape,lab,' sub' if fee=='—' else '',fee))
S.append(screen('SCR-082','Month-close readiness board',
 'The proof screen from the theme reference, now in its place. The <b>3px row accent</b> exists because a status chip alone couldn’t answer “which rows are stopping me closing” across forty of these — the chip became the detail once the accent carried the signal. Absent figures are an em-dash, never a zero.',
 shell('SCR-082','Monthly close / July 2026','Month-close readiness',
  '<span class="chip warn"><span class="tri"></span>Day 11 of 17</span><button class="btn btn-sec sm">Export</button><button class="btn btn-pri">Approve 31 ready</button>',
  '''<div class="kpis">
  <div class="card"><span class="lbl">Ready to bill</span><span class="v">31 / 40</span><span class="ts">₹14.8L of ₹19.2L</span></div>
  <div class="card"><span class="lbl">Missing readings</span><span class="v">3</span><span class="ts">blocks close</span></div>
  <div class="card"><span class="lbl">In deviation review</span><span class="v">4</span><span class="ts">2 second-month</span></div>
  <div class="card"><span class="lbl">Days left</span><span class="v">6</span><span class="ts">window closes 17 Aug</span></div></div>
  <div class="fil"><span class="fc on">All 40</span><span class="fc">Blocked <span class="ct" style="background:var(--bad-fg);color:var(--surface)">3</span></span><span class="fc">In review <span class="ct" style="background:var(--warn-fg);color:var(--surface)">4</span></span><span class="fc">Ready</span><span class="fc">Disputed</span></div>
  <div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap;background:var(--accent-subtle);border:1px solid var(--accent-line);border-radius:var(--r-md);padding:8px 12px;font-size:12.5px;color:var(--accent)">
  '''+CK+'''<strong>2 societies selected</strong><button class="btn btn-sec sm">Approve both</button><button class="btn btn-ghost sm">Clear</button></div>
  <div class="tw"><table class="t"><thead><tr><th style="width:26px"></th><th>Society</th><th>Circuits</th><th class="ta-r">Readings</th><th class="ta-r">Measured</th><th class="ta-r">Benchmark</th><th>Status</th><th class="ta-r">Fee</th></tr></thead>
  <tbody>'''+''.join(tb)+'''</tbody>
  <tfoot class="tfoot"><tr><td></td><td>40 societies</td><td class="ts">168 circuits</td><td class="ta-r mono">37 complete</td><td class="ta-r"></td><td class="ta-r"></td><td><span class="chip neu"><span class="dot"></span>9 blocked</span></td><td class="ta-r mono">₹19,24,860</td></tr></tfoot>
  </table></div>'''),
 states(('Loading',SK),
   ('Empty — first use','<div class="empty"><strong>Nothing to close yet</strong><span class="ts">Societies appear once readings are in.</span></div>'),
   ('Empty — filtered','<span class="ts">No societies match “Disputed”.</span><button class="btn btn-ghost sm">Clear filter</button>'),
   ('Partial / stale','<div class="ban info">'+I['i']+'<span>12 circuits still importing.</span></div>'),
   ('Window at risk','<div class="ban bad">'+I['x']+'<span><b>2 days left, 9 societies blocked.</b></span></div>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>July closed. 40 societies sent to the release queue.</span></div>'))))

# ---------------- SCR-090 ----------------
S.append(screen('SCR-090','Per-circuit compliance view',
 'The hardest real case in the product and the screen the three directions were judged on. One circuit has breached for a second month and flipped to <b>actual-metered</b> while its three siblings stay fixed — so the invoice is a set of per-circuit fee lines, not one number.',
 shell('SCR-090','Monthly close / July 2026','Compliance — Settlement Nexus',
  '<span class="chip warn"><span class="tri"></span>1 circuit out</span><button class="btn btn-pri">Send to release queue</button>',
  '''<div class="kpis">
  <div class="card"><span class="lbl">Measured saving</span><span class="v">66.4%</span><span class="ts">weighted across circuits</span></div>
  <div class="card"><span class="lbl">Contracted</span><span class="v">67.6%</span><span class="ts">per-circuit benchmark</span></div>
  <div class="card"><span class="lbl">Fee this month</span><span class="v">₹48,210</span><span class="ts">1 line at actual-metered</span></div>
  <div class="card"><span class="lbl">Circuits in band</span><span class="v">3 / 4</span><span class="ts">1 breached 2nd month</span></div></div>
  <div class="ban warn">'''+I['warn']+'''<span><b>Lift lobby has been outside its band for two consecutive months.</b> Its fee line moves to actual metered consumption from this month (CON-01c). The other three circuits are unaffected.</span></div>
  <div class="tw"><table class="t"><thead><tr><th>Circuit</th><th class="ta-r">Benchmark</th><th class="ta-r">Measured</th><th class="ta-r">Variance</th><th>Basis</th><th>Status</th><th class="ta-r">Fee line</th></tr></thead><tbody>
  <tr class="risk r-ok"><td><div class="nm">Basement parking</div><div class="ts">420 lights represented</div></td><td class="ta-r mono">68.4%</td><td class="ta-r mono">67.1%</td><td class="ta-r mono">−1.9%</td><td class="ts">Fixed</td><td><span class="chip ok"><span class="dot"></span>In band</span></td><td class="ta-r mono">₹16,480</td></tr>
  <tr class="risk r-ok"><td><div class="nm">Stilt parking</div><div class="ts">180 lights represented</div></td><td class="ta-r mono">71.2%</td><td class="ta-r mono">70.8%</td><td class="ta-r mono">−0.6%</td><td class="ts">Fixed</td><td><span class="chip ok"><span class="dot"></span>In band</span></td><td class="ta-r mono">₹7,940</td></tr>
  <tr class="risk r-bad"><td><div class="nm">Lift lobby</div><div class="ts">260 lights represented</div></td><td class="ta-r mono">64.9%</td><td class="ta-r mono">58.2%</td><td class="ta-r mono">−10.3%</td><td class="ts" style="color:var(--bad-fg)">Actual-metered</td><td><span class="chip bad"><span class="sq"></span>2nd month out</span></td><td class="ta-r mono">₹9,630</td></tr>
  <tr class="risk r-ok"><td><div class="nm">Staircase</div><div class="ts">340 lights represented</div></td><td class="ta-r mono">66.0%</td><td class="ta-r mono">65.1%</td><td class="ta-r mono">−1.4%</td><td class="ts">Fixed</td><td><span class="chip ok"><span class="dot"></span>In band</span></td><td class="ta-r mono">₹14,160</td></tr>
  </tbody><tfoot class="tfoot"><tr><td>Total</td><td class="ta-r"></td><td class="ta-r"></td><td class="ta-r"></td><td></td><td></td><td class="ta-r mono">₹48,210</td></tr></tfoot></table></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec sm">Open deviation — Lift lobby</button><button class="btn btn-sec sm">View savings report</button></div>'''),
 states(('Loading',SK),
   ('Empty — first use','<div class="empty"><strong>Not calculated yet</strong><span class="ts">Runs once every circuit has its readings.</span></div>'),
   ('All in band','<div class="ban ok">'+I['tick']+'<span>All 4 circuits inside their bands. Nothing to review.</span></div>'),
   ('Approaching edge','<div class="ban warn">'+I['warn']+'<span>Staircase is within 20% of its band edge (CON-01d).</span></div>'),
   ('Partial / stale','<div class="ban info">'+I['i']+'<span>Recalculated after readings changed at 14:02.</span></div>'),
   ('Error — permission','<span class="ts">Society-scoped account — this is the ops view.</span>'))))

# ---------------- SCR-091 ----------------
S.append(screen('SCR-091','Savings report (ops view / editor)',
 'Figures are never editable; commentary is. A savings report whose numbers can be typed over is not evidence. The <b>mixed-basis banner</b> is the whole design problem — a month where one circuit flipped shows a total that moved for a reason no single number explains.',
 shell('SCR-091','Monthly close / July 2026','Savings report — Settlement Nexus',
  '<span class="chip neu"><span class="dot"></span>Draft</span><button class="btn btn-sec sm">View as society</button><button class="btn btn-pri sm">Release with month</button>',
  '''<div class="ban warn">'''+I['warn']+'''<span><b>Mixed basis this month.</b> Three circuits billed at the agreed rate; the lift lobby is billed on actual metered consumption. State this on the society's copy — the total moved for a reason no single figure explains.</span></div>
  <div class="kpis">
  <div class="card"><span class="lbl">Society keeps</span><span class="v" style="color:var(--accent)">₹66,610</span><span class="ts">58% of verified saving</span></div>
  <div class="card"><span class="lbl">FirsThing fee</span><span class="v">₹48,210</span><span class="ts">42%</span></div>
  <div class="card"><span class="lbl">Energy saved</span><span class="v">9,842</span><span class="ts">kWh this month</span></div>
  <div class="card"><span class="lbl">Since contract start</span><span class="v">₹8.42L</span><span class="ts">18 months</span></div></div>
  <div class="panel"><h3>Commentary <span class="ts" style="font-weight:400">— the only editable part of this document</span></h3>
  <textarea class="inp" rows="3" style="font-family:var(--ui)">July was steady across the basement and stilt circuits. The lift lobby has now been outside its band for a second month; a site visit on 8 July found two failed drivers, replaced the same day, and we are monitoring.</textarea>
  <span class="ts">Autosaved. Figures below are generated and cannot be edited here.</span></div>
  <div class="tw"><table class="t"><thead><tr><th>Area</th><th class="ta-r">Benchmark</th><th class="ta-r">Measured</th><th>Basis</th><th class="ta-r">Saved</th><th>Provenance</th></tr></thead><tbody>
  <tr><td class="nm">Basement parking</td><td class="ta-r mono">68.4%</td><td class="ta-r mono">67.1%</td><td class="ts">Fixed</td><td class="ta-r mono">₹39,240</td><td><a class="ts" style="color:var(--accent)">31 readings · benchmark v2</a></td></tr>
  <tr><td class="nm">Stilt parking</td><td class="ta-r mono">71.2%</td><td class="ta-r mono">70.8%</td><td class="ts">Fixed</td><td class="ta-r mono">₹18,910</td><td><a class="ts" style="color:var(--accent)">31 readings · benchmark v1</a></td></tr>
  <tr><td class="nm">Lift lobby</td><td class="ta-r mono">64.9%</td><td class="ta-r mono">58.2%</td><td class="ts" style="color:var(--bad-fg)">Actual-metered</td><td class="ta-r mono">₹22,930</td><td><a class="ts" style="color:var(--accent)">31 readings · metered</a></td></tr>
  <tr><td class="nm">Staircase</td><td class="ta-r mono">66.0%</td><td class="ta-r mono">65.1%</td><td class="ts">Fixed</td><td class="ta-r mono">₹33,740</td><td><a class="ts" style="color:var(--accent)">31 readings · benchmark v1</a></td></tr>
  </tbody></table></div>'''),
 states(('Loading',SK),
   ('Empty — first use','<div class="empty"><strong>Generated once July’s calculation completes</strong><span class="ts">2 circuits still outstanding.</span></div>'),
   ('Partial / stale','<div class="ban warn">'+I['warn']+'<span>Readings changed after this was generated on 12 Aug. Regenerate before releasing.</span></div>'),
   ('Blocked','<div class="ban bad">'+I['x']+'<span>Lift lobby has an open deviation. Resolve it before releasing.</span></div>'),
   ('Error — network','<span class="ts">Couldn’t load.</span><button class="btn btn-sec sm">Retry</button>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>Released. The society can see it now.</span></div>'))))

# ---------------- SCR-092 ----------------
S.append(screen('SCR-092','Accountant release queue',
 'FEAT-054 states its own risk: at 200 societies a one-at-a-time gate becomes the month-end bottleneck. The answer is structural rather than careful — <b>needs-review months cannot be reached by any bulk action</b>, so the shortcut physically does not extend to the rows that matter.',
 shell('SCR-092','Monthly close / July 2026','Release queue',
  '<span class="chip warn"><span class="tri"></span>6 days left</span><button class="btn btn-sec sm">Export</button>',
  '''<div class="kpis">
  <div class="card"><span class="lbl">Routine</span><span class="v" style="color:var(--accent)">28</span><span class="ts">bulk releasable</span></div>
  <div class="card"><span class="lbl">Needs review</span><span class="v" style="color:var(--warn-fg)">4</span><span class="ts">one at a time</span></div>
  <div class="card"><span class="lbl">Released</span><span class="v">8</span><span class="ts">of 40</span></div>
  <div class="card"><span class="lbl">Total value</span><span class="v">₹19.2L</span><span class="ts">July</span></div></div>
  <div class="panel" style="border-color:var(--warn-line)"><h3>Needs review — 4</h3>
  <div class="tw"><table class="t"><thead><tr><th>Society</th><th>Why it’s here</th><th class="ta-r">Total</th><th class="ta-r">vs 3-month mean</th><th></th></tr></thead><tbody>
  <tr class="risk r-warn"><td class="nm">Settlement Nexus</td><td class="ts">Lift lobby switched to metered billing</td><td class="ta-r mono">₹48,210</td><td class="ta-r mono">−8.1%</td><td><button class="btn btn-sec sm">Open figures</button></td></tr>
  <tr class="risk r-warn"><td class="nm">Aditya Mega City</td><td class="ts">Total is 34% above the 3-month average</td><td class="ta-r mono">₹87,320</td><td class="ta-r mono" style="color:var(--warn-fg)">+34.2%</td><td><button class="btn btn-sec sm">Open figures</button></td></tr>
  <tr class="risk r-warn"><td class="nm">Brigade Cornerstone</td><td class="ts">Open dispute on last month’s invoice</td><td class="ta-r mono">₹62,740</td><td class="ta-r mono">+2.0%</td><td><button class="btn btn-sec sm">Open figures</button></td></tr>
  <tr class="risk r-warn"><td class="nm">Emerald Isle</td><td class="ts">Coverage 27 of 31 days</td><td class="ta-r mono">₹38,460</td><td class="ta-r mono">−4.4%</td><td><button class="btn btn-sec sm">Open figures</button></td></tr>
  </tbody></table></div>
  <span class="ts">No bulk action reaches these rows. That is the guarantee, not a setting.</span></div>
  <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
  <h3>Routine — 28 <span class="ts" style="font-weight:400">· all circuits in band, no basis change, within 10% of trailing mean, no dispute, coverage ≥ 28</span></h3>
  <button class="btn btn-pri sm">Release all 28 — ₹12.4L</button></div>
  <div class="tw"><table class="t"><tbody>
  <tr><td>'''+CU+'''</td><td class="nm">Nirvana Country</td><td class="ta-r mono">₹54,180</td><td><span class="chip ok"><span class="dot"></span>Routine</span></td></tr>
  <tr><td>'''+CU+'''</td><td class="nm">Settlement Vega</td><td class="ta-r mono">₹44,020</td><td><span class="chip ok"><span class="dot"></span>Routine</span></td></tr>
  <tr><td colspan="4" class="ts" style="text-align:center;padding:8px">26 more</td></tr>
  </tbody></table></div></div>'''),
 states(('Loading',SK),
   ('Empty — first use','<div class="empty"><strong>Nothing to release yet</strong><span class="ts">Months appear once ops closes them.</span></div>'),
   ('Empty — all released','<div class="ban ok">'+I['tick']+'<span>All 40 societies released for July 2026. ₹19,24,860.</span></div>'),
   ('Partial / stale','<div class="ban info">'+I['i']+'<span>Ops is still closing July. More will appear.</span></div>'),
   ('Error — permission','<span class="ts">Ops role: the queue is visible, release is hidden.</span>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>28 released. 4 still need review.</span></div>'))))

# ---------------- SCR-093 ----------------
S.append(screen('SCR-093','Invoice upload & reconciliation',
 'DF-07’s gap, closed. The expected total is shown <b>before</b> the upload so the check is not circular. A total, period or society mismatch blocks the save outright — resolvable only by fixing the invoice in Zoho or recording an approved variance, never silently overridable.',
 shell('SCR-093','Monthly close / July 2026','Invoice — Settlement Nexus',
  '<span class="chip neu"><span class="dot"></span>Awaiting invoice</span>',
  '''<div class="ban info">'''+I['i']+'''<span><b>Expected total ₹48,210</b> for July 2026, from the compliance calculation. Shown before upload so the reconciliation isn’t circular.</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px" class="recon-cols">
   <div class="panel"><h3>Extracted from the PDF</h3>
    <div class="field"><label>Invoice number</label><input class="inp" value="FT/2026-27/104"></div>
    <div class="field"><label>Invoice date</label><input class="inp" value="2026-08-01"></div>
    <div class="field"><label>Due date</label><input class="inp" value="2026-08-16"></div>
    <div class="field"><label>Total</label><input class="inp" value="52,400" style="border-color:var(--bad-fg);box-shadow:0 0 0 3px var(--bad-bg)"></div>
    <div class="field"><label>GST</label><input class="inp" value="7,992"></div></div>
   <div class="panel"><h3>Reconciliation</h3>
    <div class="ban bad">'''+I['x']+'''<span><b>This invoice says ₹52,400. The calculation says ₹48,210, a difference of ₹4,190.</b> Fix the invoice in Zoho, or record why the difference is correct.</span></div>
    <div class="tw"><table class="t"><tbody>
    <tr><td>Total</td><td class="ta-r mono">₹52,400</td><td class="ta-r mono sub">₹48,210</td><td><span class="chip bad"><span class="sq"></span>Blocks save</span></td></tr>
    <tr><td>Period</td><td class="ta-r mono">Jul 2026</td><td class="ta-r mono sub">Jul 2026</td><td><span class="chip ok"><span class="dot"></span>Match</span></td></tr>
    <tr><td>Society</td><td class="ta-r ts">Settlement Nexus</td><td class="ta-r ts sub">Settlement Nexus</td><td><span class="chip ok"><span class="dot"></span>Match</span></td></tr>
    <tr><td>Due date</td><td class="ta-r mono">16 Aug</td><td class="ta-r mono sub">16 Aug</td><td><span class="chip ok"><span class="dot"></span>Match</span></td></tr>
    <tr><td>GST</td><td class="ta-r mono">₹7,992</td><td class="ta-r mono sub">₹7,352</td><td><span class="chip warn"><span class="tri"></span>Warns</span></td></tr>
    </tbody></table></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri sm" disabled>Save & link</button><button class="btn btn-sec sm">Record an accepted variance</button></div>
   </div></div>'''),
 states(('Loading',SK),
   ('Empty — first use','<div class="drop">Drop the invoice PDF here<br><span class="ts">Expected total ₹48,210 for July 2026</span></div>'),
   ('Reconciled — clean','<div class="ban ok">'+I['tick']+'<span>Invoice matches the calculation exactly.</span></div>'),
   ('Partial / stale','<div class="ban warn">'+I['warn']+'<span>The calculation changed after this invoice was uploaded. Re-reconcile.</span></div>'),
   ('Error — extraction','<div class="ban warn">'+I['warn']+'<span>Gemini is unavailable. Enter the fields manually — reconciliation still runs on what you type.</span></div>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>Linked to July. The society can see it now.</span></div>'))))

# ---------------- SCR-110 chart ----------------
import math
pts=[]; bench=64.9
vals=[64.2,65.1,63.8,64.9,65.4,64.1,63.2,58.9,57.4,58.1,57.8,58.6,57.2,58.4,59.1,58.0,57.6,58.9,58.2,57.4,58.8,58.1,57.9,58.5,58.3,57.7,58.6,58.2,57.5,58.4,58.1]
W,H,PL,PT=660,180,34,12
def x(i): return PL+i*(W-PL-8)/30.0
def y(v): return PT+(72-v)*(H-PT-22)/(72-50)
poly=' '.join('%.1f,%.1f'%(x(i),y(v)) for i,v in enumerate(vals))
bandtop,bandbot=y(bench*1.10),y(bench*0.90)
grid=''.join('<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="var(--border-subtle)"/><text x="4" y="%.1f" font-size="9" fill="var(--text-subtle)" font-family="var(--mono)">%d%%</text>'%(PL,y(v),W-8,y(v),y(v)+3,v) for v in (55,60,65,70))
chart='''<svg viewBox="0 0 %d %d" width="100%%" role="img" aria-label="Daily saving for the lift lobby through July. Steady near 64 percent for the first seven days, then a step change down to about 58 percent on the eighth, holding flat for the rest of the month. A site visit is marked on the eighth.">
<rect x="%d" y="%.1f" width="%d" height="%.1f" fill="var(--ok-bg)" opacity=".55"/>
%s<line x1="%d" y1="%.1f" x2="%d" y2="%.1f" stroke="var(--accent)" stroke-dasharray="4 3" stroke-width="1.5"/>
<polyline points="%s" fill="none" stroke="var(--bad-fg)" stroke-width="2" stroke-linejoin="round"/>
<line x1="%.1f" y1="%d" x2="%.1f" y2="%d" stroke="var(--info-fg)" stroke-width="1.5" stroke-dasharray="3 2"/>
<circle cx="%.1f" cy="%.1f" r="3.5" fill="var(--bad-fg)"/>
<text x="%.1f" y="%d" font-size="9" fill="var(--info-fg)" font-family="var(--ui)">Site visit</text>
<text x="%d" y="%d" font-size="9" fill="var(--accent)" font-family="var(--ui)">Benchmark 64.9%%</text>
</svg>'''%(W,H,PL,bandtop,W-PL-8,bandbot-bandtop,grid,PL,y(bench),W-8,y(bench),poly,
  x(7),PT,x(7),H-20,x(7),y(vals[7]),x(7)+5,PT+9,PL+4,y(bench)-5)

S.append(screen('SCR-110','Deviation chart & initial findings',
 'The one screen where the visualisation <i>is</i> the feature. FLOW-11 asks a question a monthly aggregate cannot answer: is this one bad day, a step change, or a gradual drift? Here it is unmistakably a <b>step change on the 8th</b>, lined up against a site visit. The sibling panel is the cheapest diagnostic on the screen — one circuit down is a circuit problem, all of them down together is a metering or tariff event.',
 shell('SCR-110','Monthly close / Deviations','Lift lobby — July 2026',
  '<span class="chip bad"><span class="sq"></span>Second consecutive month</span>',
  '''<div class="ban bad">'''+I['warn']+'''<span><b>Second consecutive month outside the band.</b> One more and this circuit moves to metered billing.</span></div>
  <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><h3>Daily saving vs benchmark</h3><button class="btn btn-ghost sm">Show as table</button></div>'''+chart+'''
  <span class="ts">Raw daily readings. Shaded band is the ±10% tolerance. Markers show events on the time axis.</span></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px" class="recon-cols">
   <div class="panel"><h3>Sibling circuits this month</h3>
   <div class="tw"><table class="t"><tbody>
   <tr><td class="nm">Basement parking</td><td class="ta-r mono">67.1%</td><td><span class="chip ok"><span class="dot"></span>In band</span></td></tr>
   <tr><td class="nm">Stilt parking</td><td class="ta-r mono">70.8%</td><td><span class="chip ok"><span class="dot"></span>In band</span></td></tr>
   <tr><td class="nm">Staircase</td><td class="ta-r mono">65.1%</td><td><span class="chip ok"><span class="dot"></span>In band</span></td></tr>
   </tbody></table></div>
   <span class="ts">Three siblings in band. This is a circuit problem, not a society-level or metering event.</span></div>
   <div class="panel"><h3>Context</h3>
   <div class="tw"><table class="t"><tbody>
   <tr><td class="ts">Coverage</td><td class="ta-r mono">31 / 31</td></tr>
   <tr><td class="ts">Ingest anomalies</td><td class="ta-r ts">None</td></tr>
   <tr><td class="ts">Site visit</td><td class="ta-r ts">8 Jul — 2 drivers replaced</td></tr>
   <tr><td class="ts">Light-count change</td><td class="ta-r ts">None since Feb</td></tr>
   <tr><td class="ts">Open tickets</td><td class="ta-r ts">1 — flickering, 3 Jul</td></tr>
   </tbody></table></div></div></div>
  <div class="panel"><div class="field"><label>Initial findings</label><textarea class="inp" rows="2" style="font-family:var(--ui)" placeholder="Required before assigning an inspector"></textarea></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec">Resolve from desk</button><button class="btn btn-sec">Assign inspector</button><button class="btn btn-ghost sm">Exclude days</button><button class="btn btn-ghost sm">Escalate</button></div>
  <span class="ts">Neither action is the default. Assigning everything defeats the chart; resolving everything from the desk misses real faults.</span></div>'''),
 states(('Loading','<div class="sk" style="height:60px"></div><span class="ts">Axes drawn first, data second.</span>'),
   ('Empty — insufficient data','<div class="ban warn">'+I['warn']+'<span>18 of 31 days. Too little to diagnose a trend.</span></div>'),
   ('Partial / stale','<div class="ban info">'+I['i']+'<span>4 days still importing.</span></div>'),
   ('Investigating','<div class="ban info">'+I['i']+'<span>Assigned to R. Kumar, site visit 19 Aug.</span></div>'),
   ('Error — network','<span class="ts">Couldn’t load readings.</span><button class="btn btn-sec sm">Retry</button>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>Assigned. Deviation is now investigating.</span></div>'))))

# ---------------- SCR-112 ----------------
S.append(screen('SCR-112','Root-cause & decision record',
 'The classification drives billing, so the screen <b>states the consequence before the decision is committed</b>. The two cause groups are visually separated because they move money in opposite directions, and there is no control anywhere that applies an adjustment without a completed record.',
 shell('SCR-112','Monthly close / Deviations','Root cause — Lift lobby, July 2026',
  '<span class="chip bad"><span class="sq"></span>2nd consecutive month</span>',
  '''<div class="kpis">
  <div class="card"><span class="lbl">Benchmark</span><span class="v">64.9%</span></div>
  <div class="card"><span class="lbl">Measured</span><span class="v" style="color:var(--bad-fg)">58.2%</span></div>
  <div class="card"><span class="lbl">Variance</span><span class="v">−10.3%</span></div>
  <div class="card"><span class="lbl">Days excluded</span><span class="v">0</span></div></div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px" class="recon-cols">
   <div class="panel" style="border-color:var(--bad-line)"><h3 style="color:var(--bad-fg)">FirsThing-attributable</h3>
   <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="radio" name="cause" checked style="margin-top:3px"><span><b>Driver or fitting failure</b><br><span class="ts">Hardware we installed and own</span></span></label>
   <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="radio" name="cause" style="margin-top:3px"><span><b>Installation defect</b><br><span class="ts">Wrong spec, poor termination</span></span></label>
   <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="radio" name="cause" style="margin-top:3px"><span><b>Metering fault</b><br><span class="ts">Our meter, misreading</span></span></label></div>
   <div class="panel" style="border-color:var(--neu-line)"><h3>Excluded / society-caused</h3>
   <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="radio" name="cause" style="margin-top:3px"><span><b>Fitting removed or altered by the society</b></span></label>
   <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="radio" name="cause" style="margin-top:3px"><span><b>Usage pattern change</b><br><span class="ts">New load on the circuit</span></span></label>
   <label style="display:flex;gap:8px;align-items:flex-start;font-size:13px"><input type="radio" name="cause" style="margin-top:3px"><span><b>Tariff or supply change</b></span></label></div></div>
  <div class="ban bad">'''+I['warn']+'''<span><b>What this decision does:</b> FirsThing-attributable, uncorrected, second consecutive month — this circuit’s fee line moves to actual metered consumption from this month.</span></div>
  <div class="panel"><div class="field"><label>What actually happened</label><textarea class="inp" rows="2" style="font-family:var(--ui)">Two LED drivers failed between 6 and 8 July. Replaced on the 8th, but output has not recovered to the benchmark level — a further four fittings are suspected and are being checked.</textarea></div>
  <span class="ts">Written for someone reading it a year from now.</span></div>
  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:var(--surface-sunken);border:1px solid var(--border);border-radius:var(--r-md);padding:10px 12px">
  <span class="ts">Recorded as <b>A. Rao</b> · 13 Aug 2026, 11:42</span>
  <div style="margin-left:auto;display:flex;gap:8px"><button class="btn btn-ghost sm">Escalate instead</button><button class="btn btn-pri">Save decision</button></div></div>'''),
 states(('Loading',SK),
   ('Awaiting investigation','<div class="ban info">'+I['i']+'<span>Waiting on the site visit on 19 Aug. Classification is disabled until findings are in.</span></div>'),
   ('Excluded cause','<div class="ban ok">'+I['tick']+'<span><b>Bill unchanged.</b> The society will be told why.</span></div>'),
   ('First month','<div class="ban warn">'+I['warn']+'<span><b>Bill unchanged this month.</b> If next month is also outside the band, this circuit moves to metered billing.</span></div>'),
   ('Partial / stale','<div class="ban warn">'+I['warn']+'<span>Readings changed. Re-check the chart before deciding.</span></div>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>Decision saved. Society notified.</span></div>'))))

# ---------------- SCR-113 ----------------
S.append(screen('SCR-113','Management escalation & benchmark adjustment',
 'CON-37 enforced by omission. On the branch where a change favours FirsThing, <b>the apply action does not exist</b> — only “raise amendment”. A unilateral repricing of a signed contract becomes impossible rather than discouraged. Management sees this path rarely, so the case is restated in full rather than linked to.',
 shell('SCR-113','Deviations / Escalated','Benchmark adjustment — Lift lobby',
  '<span class="chip info"><span class="dot"></span>Awaiting management</span>',
  '''<div class="panel"><h3>The case</h3>
  <div class="tw"><table class="t"><tbody>
  <tr><td class="ts" style="width:180px">Society</td><td class="nm">Settlement Nexus, Whitefield</td></tr>
  <tr><td class="ts">Circuit</td><td>Lift lobby · 260 lights represented</td></tr>
  <tr><td class="ts">Current benchmark</td><td class="mono">64.9% · ±10% · v2 since Feb 2026</td></tr>
  <tr><td class="ts">Breach</td><td>Two consecutive months. July measured 58.2%</td></tr>
  <tr><td class="ts">Investigation</td><td>2 drivers replaced 8 Jul; 4 more suspected, checked 19 Aug</td></tr>
  <tr><td class="ts">Post-fix readings</td><td class="mono">21 days since the fix, mean 63.4%</td></tr>
  <tr><td class="ts">Ops recommendation</td><td>Lower the benchmark to 63.0% — the original was set on a demo run in cooler weather</td></tr>
  <tr><td class="ts">Remaining term</td><td>42 months</td></tr>
  </tbody></table></div></div>
  <div class="panel"><div class="field" style="max-width:280px"><label>Proposed new benchmark</label><input class="inp" value="63.0%"></div>
  <div class="ban ok">'''+I['tick']+'''<span><b>This lowers what Settlement Nexus pays.</b> You can apply it now — it takes effect from August, the society is notified, and no amendment is needed.</span></div>
  <div class="tw"><table class="t"><thead><tr><th>Effect</th><th class="ta-r">Per month</th><th class="ta-r">Over 42 months</th></tr></thead><tbody>
  <tr><td>FirsThing fee change</td><td class="ta-r mono" style="color:var(--bad-fg)">−₹1,340</td><td class="ta-r mono" style="color:var(--bad-fg)">−₹56,280</td></tr>
  <tr><td>Society pays</td><td class="ta-r mono" style="color:var(--ok-fg)">−₹1,340</td><td class="ta-r mono" style="color:var(--ok-fg)">−₹56,280</td></tr>
  </tbody></table></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-pri">Approve — applies from August</button><button class="btn btn-ghost sm">Send back to ops</button><button class="btn btn-ghost sm">Reject</button></div></div>'''),
 states(('Loading',SK),
   ('Favours FirsThing','<div class="ban warn">'+I['warn']+'<span><b>This raises what Settlement Nexus pays.</b> It needs a signed amendment before it can take effect.</span></div><button class="btn btn-sec sm">Raise amendment</button><span class="ts">The approve action is absent on this branch, not disabled.</span>'),
   ('Partial / stale','<div class="ban warn">'+I['warn']+'<span>Only 9 days of readings since the fix. A benchmark decision on this is premature.</span></div>'),
   ('Error — permission','<span class="ts">Ops role — this decision is management’s.</span>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>Approved. Benchmark is 63.0% from 1 August. Society notified.</span></div>'))))

# ---------------- SCR-120 ----------------
S.append(screen('SCR-120','Arrears board',
 'The unusual property this board has to make legible: <b>manual intervention is only ever a brake, never an accelerator</b> (CON-13). There is no “suspend now” — offering it would invite exactly the manual suspension the rule forbids. Two conditions freeze countdowns, and both are header banners rather than columns, because a frozen suspension clock is the most important fact on the screen.',
 shell('SCR-120','Billing','Arrears',
  '<span class="chip bad"><span class="sq"></span>Payment data from 10 Aug</span><button class="btn btn-pri sm">Refresh payment data</button>',
  '''<div class="ban warn">'''+I['warn']+'''<span><b>Payment data was last confirmed on 10 Aug.</b> Suspensions are paused until it’s refreshed — firing on stale data would suspend a society that has already paid.</span></div>
  <div class="kpis">
  <div class="card"><span class="lbl">Outstanding</span><span class="v">₹4,82,140</span><span class="ts">across 9 societies</span></div>
  <div class="card"><span class="lbl">Overdue</span><span class="v" style="color:var(--warn-fg)">6</span><span class="ts">past due date</span></div>
  <div class="card"><span class="lbl">Suspended</span><span class="v" style="color:var(--bad-fg)">1</span><span class="ts">field servicing only</span></div>
  <div class="card"><span class="lbl">Disputed</span><span class="v">2</span><span class="ts">clock still running</span></div></div>
  <div class="fil"><span class="fc on">All</span><span class="fc">Overdue</span><span class="fc">Warning</span><span class="fc">Suspended</span><span class="fc">Disputed</span><span class="fc">Extension requested</span></div>
  <div class="tw"><table class="t"><thead><tr><th>Society</th><th>Invoice</th><th class="ta-r">Amount</th><th class="ta-r">Days over</th><th>Countdown to suspension</th><th class="ta-r">Extensions</th><th>Status</th></tr></thead><tbody>
  <tr class="risk r-bad"><td class="nm">Prestige Ferns</td><td class="mono ts">FT/26-27/081</td><td class="ta-r mono">₹1,04,220</td><td class="ta-r mono">17</td><td><span class="chip neu"><span class="dot"></span>Paused — data from 10 Aug</span></td><td class="ta-r mono">5 / 10</td><td><span class="chip bad"><span class="sq"></span>Suspended</span></td></tr>
  <tr class="risk r-bad"><td class="nm">Settlement Vega</td><td class="mono ts">FT/26-27/077</td><td class="ta-r mono">₹88,400</td><td class="ta-r mono">12</td><td><span class="chip neu"><span class="dot"></span>Paused — warning email bounced 8 Aug</span></td><td class="ta-r mono">0 / 10</td><td><span class="chip warn"><span class="tri"></span>Unreachable</span></td></tr>
  <tr class="risk r-warn"><td class="nm">Brigade Cornerstone</td><td class="mono ts">FT/26-27/084</td><td class="ta-r mono">₹62,740</td><td class="ta-r mono">9</td><td><span class="chip neu"><span class="dot"></span>Paused — data from 10 Aug</span></td><td class="ta-r mono">0 / 10</td><td><span class="chip info"><span class="dot"></span>Disputed</span></td></tr>
  <tr class="risk r-warn"><td class="nm">Emerald Isle</td><td class="mono ts">FT/26-27/090</td><td class="ta-r mono">₹38,460</td><td class="ta-r mono">4</td><td><span class="chip neu"><span class="dot"></span>Paused — data from 10 Aug</span></td><td class="ta-r mono">5 / 10</td><td><span class="chip warn"><span class="tri"></span>Extended to 24 Aug</span></td></tr>
  <tr class="risk r-ok"><td class="nm">Nirvana Country</td><td class="mono ts">FT/26-27/092</td><td class="ta-r mono">₹54,180</td><td class="ta-r mono">1</td><td><span class="chip neu"><span class="dot"></span>Paused — data from 10 Aug</span></td><td class="ta-r mono">0 / 10</td><td><span class="chip neu"><span class="dot"></span>Overdue</span></td></tr>
  </tbody></table></div>
  <div class="ban info">'''+I['i']+'''<span><b>Suspension halts field servicing only.</b> Meter ingest, monthly calculation, invoicing and portal access all continue — Prestige Ferns has not gone dark.</span></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec sm">Record payment</button><button class="btn btn-sec sm">Grant extension</button><button class="btn btn-ghost sm">Log a dispute</button></div>
  <span class="ts">There is no “suspend now”. CON-13 permits no accelerator.</span>'''),
 states(('Loading',SK),
   ('Empty — nothing owed','<div class="ban ok">'+I['tick']+'<span>Everything’s paid. ₹0 outstanding across 40 societies.</span></div>'),
   ('Empty — filtered','<span class="ts">No societies match “Suspended”.</span><button class="btn btn-ghost sm">Clear filter</button>'),
   ('Data fresh','<span class="chip ok"><span class="dot"></span>Confirmed today, 09:15</span><span class="ts">Countdowns run normally.</span>'),
   ('Extension capped','<div class="ban warn">'+I['warn']+'<span>10 of 10 days already granted. No further extension is available.</span></div>'),
   ('Error — network','<span class="ts">Couldn’t load arrears.</span><button class="btn btn-sec sm">Retry</button>'),
   ('Success','<div class="ban ok">'+I['tick']+'<span>Payment recorded. Field servicing restored.</span></div>'))))

# ---------------- assemble ----------------
tabs=[]
for sec in S:
    sid=sec.split('data-scr="')[1].split('"')[0]
    nm=sec.split('<h2>')[1].split('</h2>')[0]
    tabs.append('<button class="tb" data-go="%s"><span class="mono">%s</span> %s</button>'%(sid,sid,nm))

DOC = '''<title>Monthly Loop Prototype</title>
<style>%s
.tabs{display:flex;flex-wrap:wrap;gap:5px}
.tb{appearance:none;font:inherit;font-size:12px;padding:6px 10px;border-radius:var(--r-pill);
    border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;display:flex;gap:6px}
.tb .mono{font-size:10.5px;color:var(--text-subtle)}
.tb:hover{background:var(--surface-hover);color:var(--text)}
.tb.on{background:var(--accent);border-color:var(--accent);color:var(--text-on-accent)}
.tb.on .mono{color:var(--text-on-accent);opacity:.8}
@media (max-width:760px){.recon-cols{grid-template-columns:1fr!important}}
</style>
<div class="wrap">
<header class="masthead">
<span class="lbl">FirsThing Platform · Phase 5 · Mockups 1 of 6</span>
<h1>The monthly loop</h1>
<p class="lede">Twelve screens, rendered in the Console system, each with the states its spec requires.
This is the revenue spine — readings in, compliance checked, report and invoice out, money chased.
Every figure is real synthetic data carried consistently across all twelve, so a society that is
blocked on one screen is blocked on the next.</p>
</header>
<div class="bar">
 <span class="lbl">Theme</span>
 <div class="seg" role="group" aria-label="Theme"><button type="button" id="bA" aria-pressed="true">Auto</button><button type="button" id="bL" aria-pressed="false">Light</button><button type="button" id="bD" aria-pressed="false">Dark</button></div>
 <span class="ts">Both themes ship. Every screen is drawn from the same tokens.</span>
</div>
<div class="tabs" id="tabs">%s</div>
%s
</div>
<script>
(function(){
 var root=document.documentElement, body=document.body;
 var b={auto:document.getElementById('bA'),light:document.getElementById('bL'),dark:document.getElementById('bD')};
 function theme(m){ if(m==='auto'){root.removeAttribute('data-theme');} else {root.setAttribute('data-theme',m);}
   for(var k in b){b[k].setAttribute('aria-pressed',String(k===m));} }
 b.auto.addEventListener('click',function(){theme('auto');});
 b.light.addEventListener('click',function(){theme('light');});
 b.dark.addEventListener('click',function(){theme('dark');});
 var tabs=document.querySelectorAll('.tb'), scr=document.querySelectorAll('.screen');
 function go(id){ scr.forEach(function(s){s.classList.toggle('on',s.dataset.scr===id);});
   tabs.forEach(function(t){t.classList.toggle('on',t.dataset.go===id);});
   window.scrollTo({top:0,behavior:'smooth'}); }
 tabs.forEach(function(t){t.addEventListener('click',function(){go(t.dataset.go);});});
 go(tabs[0].dataset.go);
})();
</script>''' % (CSS, ''.join(tabs), ''.join(S))
io.open('monthly.html','w',encoding='utf-8').write(DOC)
print('monthly.html written,', len(S), 'screens,', len(DOC), 'bytes')
