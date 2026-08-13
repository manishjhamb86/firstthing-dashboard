# -*- coding: utf-8 -*-
import io
CSS = io.open('_tokens.css', encoding='utf-8').read()
I = {
 'grid':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
 'bldg':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 21h18M6 21V7l6-4 6 4v14"/></svg>',
 'funnel':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 4h18l-7 8v7l-4 2v-9z"/></svg>',
 'clip':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/></svg>',
 'zap':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>',
 'doc':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
 'pen':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 7l-9 9v3h3l9-9M14 7l3-3 3 3-3 3"/></svg>',
 'hard':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M2 18h20M5 18v-4a7 7 0 0 1 14 0v4M10 4h4v4h-4z"/></svg>',
 'cal':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M8 2v4M16 2v4M3 10h18"/></svg>',
 'warn':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
 'chart':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 3v18h18M7 15l4-4 3 3 5-6"/></svg>',
 'phone':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
 'pin':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
 'box':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/></svg>',
 'users':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M17 11a3 3 0 1 0 0-6M18 20a6 6 0 0 0-2-4.5"/></svg>',
 'inv':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
 'cash':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>',
 'up':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
 'tick':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>',
 'x':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
 'i':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
 'wifi':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01"/></svg>',
 'lock':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
 'cam':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 8h4l2-3h6l2 3h4v12H3z"/><circle cx="12" cy="13" r="3.5"/></svg>',
 'home':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 11l9-8 9 8M6 10v10h12V10"/></svg>',
}
CK = '<span class="cbx on">'+I['tick']+'</span>'
CU = '<span class="cbx"></span>'
SK = '<div class="sk" style="width:70%"></div><div class="sk" style="width:92%"></div><div class="sk" style="width:48%"></div>'

def make(nav_spec, roomy=False):
    def shell(active, crumb, title, actions, body):
        nav=[]
        for ic,label,scr,ct in nav_spec:
            if ic=='__g':
                nav.append('<div class="nvg">%s</div>'%label); continue
            on=' on' if scr==active else ''
            c='<span class="ct">%s</span>'%ct if ct else ''
            nav.append('<a class="nv%s">%s%s%s</a>'%(on,I[ic],label,c))
        return ('<div class="app%s"><div class="appbody"><nav class="side">'
          '<div class="brand"><span class="mk">F</span>FirsThing</div>%s</nav>'
          '<div class="main"><div class="top"><div><div class="crumb">%s</div>'
          '<h2 style="margin-top:2px">%s</h2></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">%s</div></div>'
          '<div class="body">%s</div></div></div></div>')%(' roomy' if roomy else '',''.join(nav),crumb,title,actions,body)
    return shell

def states(*rows):
    out=['<div class="states"><div class="lbl">States</div><div class="stgrid">']
    for name,inner in rows:
        out.append('<div class="st"><div class="sh">%s</div><div class="sb">%s</div></div>'%(name,inner))
    out.append('</div></div>')
    return ''.join(out)

def phone(title, body):
    return ('<div style="max-width:390px;margin:0 auto;border:1px solid var(--border);border-radius:22px;'
            'overflow:hidden;background:var(--ground);box-shadow:var(--e2)" class="roomy">'
            '<div style="background:var(--surface);border-bottom:1px solid var(--border);padding:11px 15px;'
            'display:flex;justify-content:space-between;align-items:center">'
            '<strong style="font-size:15px">%s</strong>'
            '<span style="display:flex;gap:6px;align-items:center;color:var(--text-subtle)">%s</span></div>'
            '<div style="padding:14px;display:flex;flex-direction:column;gap:11px">%s</div></div>')%(
            title, I['wifi'], body)

class Deck:
    def __init__(self, eyebrow, title, lede, css=''):
        self.S=[]; self.meta=(eyebrow,title,lede); self.css=css
    def add(self, sid, name, note, app, st):
        first=' on' if not self.S else ''
        self.S.append('<section class="screen%s" data-scr="%s"><div class="scrhead">'
          '<span class="scrid">%s</span><h2>%s</h2><p class="scrnote">%s</p></div>%s%s</section>'%(
          first,sid,sid,name,note,app,st))
    def build(self, path, doctitle):
        tabs=[]
        for sec in self.S:
            sid=sec.split('data-scr="')[1].split('"')[0]
            nm=sec.split('</h2>')[0].split('<h2>')[-1]
            tabs.append('<button class="tb" data-go="%s"><span class="mono">%s</span> %s</button>'%(sid,sid,nm))
        eyebrow,title,lede=self.meta
        doc='''<title>%s</title>
<style>%s
.tabs{display:flex;flex-wrap:wrap;gap:5px}
.tb{appearance:none;font:inherit;font-size:12px;padding:6px 10px;border-radius:var(--r-pill);
    border:1px solid var(--border);background:var(--surface);color:var(--text-muted);cursor:pointer;display:flex;gap:6px}
.tb .mono{font-size:10.5px;color:var(--text-subtle)}
.tb:hover{background:var(--surface-hover);color:var(--text)}
.tb.on{background:var(--accent);border-color:var(--accent);color:var(--text-on-accent)}
.tb.on .mono{color:var(--text-on-accent);opacity:.8}
table.t td.wrap{white-space:normal;min-width:200px}
table.t th.wrap{white-space:normal}
@media (max-width:760px){.cols2{grid-template-columns:1fr!important}}
%s
</style>
<div class="wrap">
<header class="masthead"><span class="lbl">%s</span><h1>%s</h1><p class="lede">%s</p></header>
<div class="bar"><span class="lbl">Theme</span>
<div class="seg" role="group" aria-label="Theme"><button type="button" id="bS" aria-pressed="true">Slate</button><button type="button" id="bL" aria-pressed="false">Light</button><button type="button" id="bD" aria-pressed="false">Dark</button></div>
<span class="ts">Three themes ship. <b>Slate is the default</b> on web and mobile — light working surface, dark navigation shell. Light and Dark are there to be chosen, and a choice is remembered: the theme never changes on its own, and never follows the operating system.</span></div>
<div class="tabs">%s</div>
%s
</div>
<script>
(function(){
 var root=document.documentElement;
 var b={light:document.getElementById('bL'),slate:document.getElementById('bS'),dark:document.getElementById('bD')};
 // A chosen theme is remembered and is the only thing that ever changes it. In the product this
 // is a field on the account, so the choice follows the person across devices; localStorage is
 // the mockup's stand-in. There is no prefers-color-scheme listener here or in the CSS, on
 // purpose — a theme that follows the OS is a theme that changes itself.
 function store(m){ try{ localStorage.setItem('ft-theme',m); }catch(e){} }
 function stored(){ try{ return localStorage.getItem('ft-theme'); }catch(e){ return null; } }
 function theme(m,persist){ root.setAttribute('data-theme',m);
   for(var k in b){b[k].setAttribute('aria-pressed',String(k===m));}
   if(persist){ store(m); } }
 b.light.addEventListener('click',function(){theme('light',1);});
 b.slate.addEventListener('click',function(){theme('slate',1);});
 b.dark.addEventListener('click',function(){theme('dark',1);});
 var saved=stored();
 theme(saved==='light'||saved==='dark'||saved==='slate' ? saved : 'slate', 0);  // Slate is the default
 var tabs=document.querySelectorAll('.tb'), scr=document.querySelectorAll('.screen');
 function go(id){ scr.forEach(function(s){s.classList.toggle('on',s.dataset.scr===id);});
   tabs.forEach(function(t){t.classList.toggle('on',t.dataset.go===id);});
   window.scrollTo({top:0,behavior:'smooth'}); }
 tabs.forEach(function(t){t.addEventListener('click',function(){go(t.dataset.go);});});
 go(tabs[0].dataset.go);
})();
</script>'''%(doctitle,CSS,self.css,eyebrow,title,lede,''.join(tabs),''.join(self.S))
        io.open(path,'w',encoding='utf-8').write(doc)
        return len(self.S), len(doc)
