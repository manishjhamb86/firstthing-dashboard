# -*- coding: utf-8 -*-
# Cross-cutting — sign in, and the offline screen. Prototype 6 of 6.
# Two screens, both spanning SUR-01 and SUR-02, so this deck renders each at the size it is
# actually met at rather than picking one.
from _base import I, CK, CU, SK, states, Deck

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
def tbl(heads, rows, align=None, wrapn=None):
    align = align or []; wrapn = wrapn or []
    def cc(i):
        c = []
        if i in align: c.append('ta-r')
        if i in wrapn: c.append('wrapn')
        return ' class="' + ' '.join(c) + '"' if c else ''
    th = ''.join('<th' + cc(i) + '>' + h + '</th>' for i, h in enumerate(heads))
    body = []
    for r in rows:
        cls = ''
        if isinstance(r, tuple): r, cls = r
        body.append('<tr' + (' class="' + cls + '"' if cls else '') + '>' +
                    ''.join('<td' + cc(i) + '>' + c + '</td>' for i, c in enumerate(r)) + '</tr>')
    return ('<div class="tw"><table class="t"><thead><tr>' + th + '</tr></thead><tbody>'
            + ''.join(body) + '</tbody></table></div>')
def cols(a, b, ratio='1.6fr 1fr'):
    w = lambda x: '<div style="display:flex;flex-direction:column;gap:11px;min-width:0">' + x + '</div>'
    return ('<div class="cols2" style="display:grid;grid-template-columns:' + ratio +
            ';gap:11px;align-items:start">' + w(a) + w(b) + '</div>')
def grid(*panels, **kw):
    m = kw.get('m', 270)
    return ('<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(' + str(m) +
            'px,1fr));gap:11px;align-items:start">' + ''.join(panels) + '</div>')
def rows2(pairs):
    return '<div>' + ''.join(
      '<div style="display:flex;justify-content:space-between;gap:14px;padding:6px 0;'
      'border-bottom:1px solid var(--border-subtle)"><span class="mut" style="font-size:12.5px">' + k +
      '</span><span style="font-size:12.5px;text-align:right">' + v + '</span></div>'
      for k, v in pairs) + '</div>'

XC_CSS = '''
/* --- sign-in card ---------------------------------------------------------------- */
.signwrap{background:var(--ground);border:1px solid var(--border);border-radius:var(--r-lg);
          padding:36px 18px;display:flex;justify-content:center;box-shadow:var(--e1)}
.signcard{width:100%;max-width:392px;background:var(--surface);border:1px solid var(--border);
          border-radius:var(--r-md);box-shadow:var(--e2);padding:26px 24px;
          display:flex;flex-direction:column;gap:16px}
.signbrand{display:flex;align-items:center;gap:10px;font-weight:660;font-size:19px;
           letter-spacing:-.015em}
.signbrand .mk{width:29px;height:29px;border-radius:8px;background:var(--accent);
               color:var(--text-on-accent);display:grid;place-items:center;font-size:15px;
               font-weight:800;flex:none}
.fld{display:flex;flex-direction:column;gap:5px}
.fld label{font-size:12px;font-weight:620;color:var(--text-muted)}
.fin{border:1px solid var(--field-border);border-radius:var(--r-sm);background:var(--surface);
     padding:11px 12px;font-size:14.5px;min-width:0;display:flex;align-items:center;gap:8px}
.fin.err{border-color:var(--bad-fg)}
.fin .gh{color:var(--text-subtle)}
.fin .rv{margin-left:auto;font-size:12px;color:var(--accent);font-weight:600;flex:none}
.cbrow{display:flex;align-items:center;gap:9px;font-size:13.5px}
.lnk{color:var(--accent);font-weight:600;font-size:13.5px}

/* --- phone frame ------------------------------------------------------------------ */
.phrail{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}
.ph{width:336px;flex:none;border:1px solid var(--border);border-radius:24px;overflow:hidden;
    background:var(--ground);box-shadow:var(--e2)}
.phtop{background:var(--chrome);color:var(--chrome-muted);padding:7px 16px 4px;display:flex;
       justify-content:space-between;align-items:center;font-size:11px}
.phbar{background:var(--chrome);color:var(--chrome-text);border-bottom:1px solid var(--chrome-border);
       padding:8px 16px 12px;font-size:15px;font-weight:640}
.phbody{padding:13px;display:flex;flex-direction:column;gap:11px}
.phcap{font-size:12px;color:var(--text-subtle);text-align:center;margin-top:8px}
.qitem{border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface);
       padding:10px 12px;display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
.qitem.bad{border-color:var(--bad-line);background:var(--bad-bg);--tone-fg:var(--bad-fg)}
.qitem b{font-size:13.5px;font-weight:620;display:block}
.conn{display:flex;align-items:center;gap:9px;padding:11px 13px;border-radius:var(--r-md);
      border:1px solid}
.conn.off{background:var(--warn-bg);border-color:var(--warn-line);--tone-fg:var(--warn-fg);
          color:var(--warn-fg)}
.conn.sync{background:var(--info-bg);border-color:var(--info-line);--tone-fg:var(--info-fg);
           color:var(--info-fg)}
.conn.ok{background:var(--ok-bg);border-color:var(--ok-line);--tone-fg:var(--ok-fg);color:var(--ok-fg)}
.conn b{font-size:14px}
.prog{height:6px;border-radius:var(--r-pill);background:var(--neu-bg);overflow:hidden}
.prog i{display:block;height:100%;background:var(--accent)}
@media (max-width:720px){.ph{width:100%}}
'''

def phone(title, body, cap=''):
    c = '<div class="phcap">' + cap + '</div>' if cap else ''
    return ('<div><div class="ph"><div class="phtop"><span class="mono">09:41</span>' + I['wifi'] +
            '</div><div class="phbar">' + title + '</div><div class="phbody">' + body +
            '</div></div>' + c + '</div>')

def fld(label, val, ghost=False, extra='', err=False):
    cls = 'fin' + (' err' if err else '')
    inner = ('<span class="gh">' + val + '</span>') if ghost else val
    return ('<div class="fld"><label>' + label + '</label><div class="' + cls + '">' + inner +
            extra + '</div></div>')

D = Deck('Prototype 6 of 6 · cross-cutting',
  'Sign in & offline',
  'Two screens that belong to no flow and every flow. Both span SUR-01 and SUR-02, so each is shown '
  'at both sizes rather than at whichever one was convenient. Sign in has to get four quite '
  'different populations into the right place through one form; the offline screen has to convince '
  'a technician standing in a basement that nothing they captured is at risk — which is true, and '
  'the screen’s whole job is making it visible.',
  css=XC_CSS)

# ================================================================ SCR-200
signin = ('<div class="signwrap"><div class="signcard">'
 '<div class="signbrand"><span class="mk">F</span>FirsThing</div>'
 '<p style="font-size:13.5px;color:var(--text-muted)">Sign in to see your savings, your bills and '
 'your reports.</p>' +
 fld('Email', 'k.ramamurthy@example.com') +
 fld('Password', '••••••••••', extra='<span class="rv">Show</span>') +
 '<div class="cbrow">' + CK + '<span>Keep me signed in on this device</span></div>'
 '<button class="btn btn-pri" style="width:100%;justify-content:center">Sign in</button>'
 '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">'
 '<span class="lnk">Forgot your password?</span></div>'
 '<div style="border-top:1px solid var(--border-subtle);padding-top:13px">'
 '<span class="ts">Locked out entirely? Call Rakesh Nair on 98xxx xxxxx and he will get you '
 'back in.</span></div>'
 '</div></div>')

phone_signin = phone('FirsThing', ''.join([
 '<div class="signbrand" style="font-size:17px"><span class="mk">F</span>FirsThing</div>',
 fld('Email', 'a.kulkarni@firsthing.earth'),
 fld('Password', '••••••••••', extra='<span class="rv">Show</span>'),
 '<div class="cbrow">' + CK + '<span>Keep me signed in</span></div>',
 '<button class="btn btn-pri" style="width:100%;justify-content:center">Sign in</button>',
 '<span class="lnk" style="text-align:center">Forgot your password?</span>',
]), 'SUR-02 · the same form, the same mechanism')

b = ''.join([
 ban('info', 'lock', '<b>One mechanism: email and password</b> (CON-46, the user’s decision). No '
   'magic link, no OTP, no SMS dependency. And <b>no variation in how you sign in</b> — the four '
   'populations differ only in where they land afterwards. The form never asks which you are; the '
   'account already knows.'),

 '<div class="phrail">' + signin + phone_signin + '</div>',

 panel('Four populations, one form',
     tbl(['Who', 'How often', 'Where', 'What that costs them'],
      [['Ops &amp; support', 'daily', 'desk', 'Nothing — they live here'],
       ['Field staff', 'daily', 'personal phone, poor signal', 'A cold start with no signal is the one genuinely blocked case'],
       ['Society portal', '<b>monthly, or less</b>', 'personal phone', 'They will have forgotten the password. This is the population the design is for'],
       ['Admin', 'daily', 'desk', 'Separate table, checked before Profile']], wrapn=[3]) +
     '<span class="ts">The society portal row is why <b>Keep me signed in</b> defaults to on and '
     'why <b>Forgot your password</b> is a real link rather than small print — the population most '
     'likely to need it is the one least likely to hunt for it.</span>'),

 grid(
   panel('Where each account lands',
     tbl(['Account', 'Lands on'],
      [['Admin / ops', 'Ops home'],
       ['Support', 'Ticket triage'],
       ['Accountant', 'Release queue'],
       ['Field', 'My visits'],
       ['Society portal', 'Portal home'],
       ['Prospect', 'Their demo report, or a holding page']]) +
     '<span class="ts">Getting this wrong strands someone on a page they cannot use. A <b>deep link '
     'is honoured after sign-in rather than discarded</b> — a committee member following an email '
     'link to their savings report lands on the report, not on the home page.</span>'),
   panel('Session lengths, and why they differ',
     rows2([('Society portal', '<b>90 days</b> on a remembered device'),
            ('Ops, support, accountant', '12 hours'),
            ('Field', '30 days, revocable, purged on sign-out'),
            ('Admin', '12 hours')]) +
     '<span class="ts" style="display:block;margin-top:9px">The portal’s 90 days is CON-46’s '
     'mitigation: a monthly visitor should almost never re-authenticate. The field’s 30 days is a '
     'balance — long enough to survive a month of basements, short enough that a lost phone ages '
     'out, since ASSUM-27 puts cached society data on a personal device. Admin has the highest '
     'privilege and therefore the shortest session.</span>'),
   panel('Signing out of the field surface can be refused',
     ban('warn', 'warn', 'Sign-out purges the local cache. <b>If there is unsynced work, purging it '
       'would lose a site visit</b>, so the sign-out is refused until the queue drains — see '
       'SCR-223.') +
     '<span class="ts" style="display:block;margin-top:9px">One of the few places in the product '
     'where a user is told no. It is the right no: the alternative is silently discarding a '
     'morning’s work to honour a button.</span>'),
   m=330),
])

D.add('SCR-200', 'Sign in',
 'Four quite different populations, one form. Ops at a desk every day; field staff on a personal '
 'phone in a basement; <b>a committee member who last signed in eleven months ago</b>; and admins '
 'on a separate table checked before anything else. The design is built around the third of those, '
 'because they are the ones the product loses: “keep me signed in” defaults to on, the session '
 'lasts 90 days, and “forgot your password” is a real link rather than small print. Everything '
 'else — one mechanism, no per-population variation, a failure message that never reveals whether '
 'an account exists — follows from CON-46.',
 '<div style="display:flex;flex-direction:column;gap:14px">' + b + '</div>',
 states(
  ('Loading', '<span class="ts">The button takes its loading state and <b>the form stays filled</b> '
    '— clearing a password on submit is how you lose someone on a phone.</span>'),
  ('Empty — first use', '<span class="ts">Just the form.</span>'),
  ('Empty — filtered', '<span class="ts">Not applicable.</span>'),
  ('<b>Failed</b>', '<div class="fld"><label>Email</label><div class="fin err">'
    'k.ramamurthy@example.com</div></div>' +
    ban('bad', 'x', '<b>That email and password don’t match.</b>') +
    '<span class="ts">Never “no such user”. The response is identical whether or not the account '
    'exists, on both sign-in and password reset — otherwise the form becomes a way to enumerate '
    'which societies are customers.</span>'),
  ('<b>Rate limited</b>', ban('warn', 'i', '<b>Too many attempts.</b> Try again in 4 minutes, or '
    'reset your password now.') + '<span class="ts">The wait is stated with its duration. “Try '
    'again later” tells someone nothing and they will keep hammering it.</span>'),
  ('Partial / stale — expired session', ban('info', 'i', 'You were signed out because your session '
    'expired. <b>Sign in and we will take you back to where you were.</b>')),
  ('Error — network', chip('bad', 'Could not reach us — try again') +
    '<span class="ts">The form keeps its contents.</span>'),
  ('Error — permission', ban('bad', 'lock', '<b>This account has been disabled.</b> Call Rakesh '
    'Nair on 98xxx xxxxx.')),
  ('Password revealed', '<div class="fin">Summer2026!<span class="rv">Hide</span></div>' +
    '<span class="ts">The toggle announces its state to a screen reader. It matters more on a '
    'phone than anyone admits.</span>'),
  ('Success', chip('ok', 'Routed by role', 'tri'))))

# ================================================================ SCR-223
def qitem(what, soc, when, tone=''):
    cls = 'qitem' + (' ' + tone if tone else '')
    return ('<div class="' + cls + '"><div style="min-width:0"><b>' + what + '</b>'
            '<span class="ts">' + soc + '</span></div>'
            '<span class="ts mono" style="flex:none">' + when + '</span></div>')

phone_healthy = phone('Sync', ''.join([
 '<div class="conn off">' + I['wifi'] + '<div><b>You’re offline</b>'
 '<div class="ts">Last sent 14 minutes ago · 15:42</div></div></div>',
 ban('ok', 'tick', '<b>Nothing here is at risk.</b> 14 things are waiting and they will go up as '
   'soon as you have signal. Unsynced work is never deleted, at any age.'),
 '<span class="lbl">Waiting to send · oldest first</span>',
 qitem('Area claim · Tower C corridors', 'Prestige Ferns', '09:12'),
 qitem('42 photos', 'Prestige Ferns', '09:31'),
 qitem('Light count · Tower C, floors 1–4', 'Prestige Ferns', '10:04'),
 qitem('Gate pass · provisional', 'Prestige Ferns', '10:22'),
 '<span class="ts">…10 more</span>',
 '<button class="btn btn-pri" style="width:100%;justify-content:center">Carry on working</button>'
 '<button class="btn btn-sec" style="width:100%;justify-content:center">Try sending now</button>',
]), 'Offline, queue healthy — the ordinary state')

phone_poison = phone('Sync', ''.join([
 '<div class="conn sync">' + I['up'] + '<div><b>Sending… 11 of 14</b>'
 '<div class="ts">Signal came back 40 seconds ago</div></div></div>',
 '<div class="prog"><i style="width:79%"></i></div>',
 ban('bad', 'x', '<b>One thing won’t send.</b> It has been refused three times, so it is holding '
   'nothing else up — but it will not go on its own.'),
 qitem('Light count · Tower C, floors 1–4', 'Refused: “Tower C is claimed by D. Prasad”', '10:04', 'bad'),
 '<div style="display:flex;gap:7px">'
 '<button class="btn btn-sec sm" style="flex:1">See the record</button>'
 '<button class="btn btn-sec sm" style="flex:1">Discard it</button></div>',
 '<span class="lbl">Still going</span>',
 qitem('42 photos', 'Prestige Ferns', 'sent'),
 qitem('Gate pass · provisional', 'Prestige Ferns', 'sending'),
]), 'The poison item — named on its own, never buried in a count')

phone_cold = phone('FirsThing', ''.join([
 '<div class="conn off">' + I['wifi'] + '<div><b>You’re offline</b>'
 '<div class="ts">And nothing is downloaded yet</div></div></div>',
 ban('warn', 'i', '<b>Get signal for a moment and today’s visits will come down.</b> Step outside '
   'or to a window — it only takes a few seconds, and then everything works underground again.'),
 '<button class="btn btn-pri" style="width:100%;justify-content:center">Try again</button>',
 '<div style="border-top:1px solid var(--border-subtle);padding-top:11px">'
 '<span class="ts">Still stuck? Call the office on 98xxx xxxxx — they can tell you where you are '
 'meant to be today.</span></div>',
]), 'Cold start — the one genuinely blocked case')

b = ''.join([
 ban('info', 'i', '<b>This is not an error screen.</b> Offline is the normal condition of a '
   'basement, and treating it as a failure is how a field app teaches people to distrust it. The '
   'screen is an honest inventory: what is waiting, how old it is, what still works, what does '
   'not — and the fact that nothing is lost, which is true and therefore worth saying plainly.'),

 '<div class="phrail">' + phone_healthy + phone_poison + phone_cold + '</div>',

 grid(
   panel('The poison item is the real content',
     '<p style="font-size:13.5px;color:var(--text-muted)">A queue that says “3 pending” while one '
     'item is permanently stuck is the failure mode the field rules name, and it is <b>how a survey '
     'is quietly lost</b>. So a rejected item is listed on its own, with what the server actually '
     'said, and two ways out.</p>' +
     rows2([('<b>See the record</b>', 'Opens it for correction — usually the right answer'),
            ('<b>Discard it</b>', 'Removes it from the queue, behind a confirmation naming '
             'precisely what is lost')]) +
     '<span class="ts">Discarding is deliberately the second option and deliberately '
     'confirmed. It is the only action on this whole surface that destroys captured work.</span>'),
   panel('What still works, and what does not',
     '<div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px">' +
     ''.join('<div style="display:flex;gap:8px;align-items:flex-start">' + CK + '<span>' + t +
             '</span></div>' for t in
       ['Every downloaded visit, in full',
        'Capturing counts, photos, notes and signatures',
        'Claiming an area and working it',
        'Completing and queueing a submission']) +
     ''.join('<div style="display:flex;gap:8px;align-items:flex-start;opacity:.72">' + CU +
             '<span>' + t + '</span></div>' for t in
       ['Gate-pass approval — needs a live answer',
        'Override requests — needs someone to answer',
        'Signing in — the cold-start case']) + '</div>' +
     '<span class="ts" style="display:block;margin-top:9px">Listing what is blocked is as important '
     'as listing what works. A technician who knows the gate pass needs signal walks to the gate; '
     'one who does not stands in a basement tapping a button.</span>'),
   m=330),

 grid(
   panel('Both times, always',
     rows2([('Last sent', '<b>14 minutes ago · 15:42</b>'),
            ('Oldest waiting', '<span class="mono">09:12 · 6 h 29 m</span>'),
            ('Queue', '<span class="mono">14 items</span>')]) +
     '<span class="ts" style="display:block;margin-top:9px">Relative <i>and</i> absolute. “14 '
     'minutes ago” is what a person reads; “15:42” is what they can quote down a phone to the '
     'office, and relative time alone is useless in a log.</span>'),
   panel('The promise this screen makes visible',
     ban('ok', 'lock', '<b>A save that reaches the device is a save.</b> Unsynced records are never '
       'purged, at any age, for any reason.') +
     '<span class="ts" style="display:block;margin-top:9px">The field rules state it; this screen '
     'is where it becomes something a person can actually see. It is also why sign-out is refused '
     'while the queue is non-empty (SCR-200) — a purge-on-sign-out that ignored the queue would '
     'break the promise in the one place nobody would be watching.</span>'),
   m=330),
])

D.add('SCR-223', 'Offline & sync pending',
 'Tell someone with no signal exactly what they can still do, what is waiting, and what is '
 'genuinely lost — which is <b>nothing</b>. Three frames, because this screen is really three '
 'states and the middle one is the one that matters: a queue reporting “3 pending” while one item '
 'is permanently rejected is precisely how a morning’s survey gets quietly lost, so the poison item '
 'is named on its own, with the server’s actual words, and never folded into a count.',
 '<div style="display:flex;flex-direction:column;gap:14px">' + b + '</div>',
 states(
  ('Loading', '<span class="ts">The queue comes from local storage <b>instantly</b> — there is no '
    'network to wait for, so a spinner here would be a lie.</span>'),
  ('Empty — first use', ban('ok', 'tick', '<b>Everything’s synced.</b>') +
    '<span class="ts">Reachable on purpose, even when there is nothing to see, so that the state '
    'can be trusted on the day it matters.</span>'),
  ('Empty — filtered', '<span class="ts">Not applicable.</span>'),
  ('<b>Offline, queue healthy</b>', chip('warn', 'offline · 14 waiting') +
    '<span class="ts">The ordinary state. “You’re offline. 14 things are waiting to send. Nothing '
    'is lost — they’ll go up as soon as you have signal.”</span>'),
  ('<b>Offline, cold start</b>', ban('warn', 'i', '<b>You’re offline and nothing’s downloaded '
    'yet.</b> Get signal for a moment and today’s visits will come down.') +
    '<span class="ts">The one genuinely blocked case in the whole field surface. Stated plainly, '
    'with the office’s number, rather than dressed up as a retry loop.</span>'),
  ('<b>Poison</b>', chip('bad', '1 refused 3× · named individually') +
    '<span class="ts">A blocked queue must be loud.</span>'),
  ('Partial / stale — syncing', '<div class="prog"><i style="width:79%"></i></div>' +
    '<span class="ts">Per-item progress, not a spinner — “11 of 14” is information, a spinner is '
    'not.</span>'),
  ('Error — permission', ban('info', 'lock', 'Your session expired while you were offline. '
    '<b>Everything you captured is still here.</b> Sign in when you have signal and it will send.') +
    '<span class="ts">Retained, never discarded, and the screen says so before it asks for '
    'anything.</span>'),
  ('Success', ban('ok', 'tick', '<b>All 14 items synced.</b>') +
    '<span class="ts">Then it steps out of the way. A confirmation that lingers on a field screen '
    'is a confirmation someone has to dismiss with one hand full.</span>')))

n, size = D.build('cross.html', 'Sign In & Offline')
print('screens: %d  bytes: %d' % (n, size))
