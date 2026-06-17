// ============================================================
// The White Orchid — Marketing Site
// IA reconciled to the real site / Framer draft.
// ============================================================

const { useState, useEffect, useMemo } = React;

const NAV_ITEMS = [
  { id: 'home',       label: 'Home' },
  { id: 'curriculum', label: 'Curriculum' },
  { id: 'day',        label: 'Day in the Life' },
  { id: 'club',       label: "Children's Club" },
  { id: 'contact',    label: 'Contact' },
];

const WA_URL = 'https://api.whatsapp.com/send/?phone=6580850652&text=Hi%21+I+would+like+to+schedule+a+tour+at+The+White+Orchid';

// ---------- Header ----------
function Header({ route, setRoute }) {
  return (
    <header className="tw-header">
      <div className="tw-header-inner">
        <a className="tw-logo" onClick={(e)=>{e.preventDefault();setRoute('home');}} href="#">
          <img src="../../assets/logo-circle.png" alt="" />
          <span className="wm">THE WHITE ORCHID</span>
        </a>
        <nav className="tw-nav">
          {NAV_ITEMS.filter(i => i.id !== 'home').map(it => (
            <a key={it.id}
               className={route === it.id ? 'active' : ''}
               onClick={(e)=>{e.preventDefault();setRoute(it.id);}} href="#">
              {it.label}
            </a>
          ))}
        </nav>
        <a className="btn btn-pri" href={WA_URL} target="_blank" rel="noopener">
          Find Your Slot <span aria-hidden>→</span>
        </a>
      </div>
    </header>
  );
}

// ---------- Footer ----------
function Footer({ setRoute }) {
  return (
    <footer className="tw-footer">
      <div className="container">
        <div className="row">
          <div>
            <a className="tw-logo" href="#" onClick={(e)=>{e.preventDefault();setRoute('home');}}>
              <img src="../../assets/logo-bg-none.png" alt="" style={{height:36, width:'auto', opacity:.95}} />
              <span className="wm" style={{color:'var(--fg-on-deep)'}}>THE WHITE ORCHID</span>
            </a>
            <p style={{marginTop:18, color:'var(--tw-celadon)', maxWidth:300, fontSize:14, lineHeight:1.6}}>
              A transformative space, for children and their parents.
            </p>
          </div>
          <div>
            <h6>Find Us</h6>
            <ul>
              <li>11 Simon Road</li>
              <li>Singapore 545896</li>
              <li><a href="tel:+6580850652">+65 8085 0652</a></li>
              <li><a href="mailto:hello@thewhiteorchid.sg">hello@thewhiteorchid.sg</a></li>
            </ul>
          </div>
          <div>
            <h6>Term Hours</h6>
            <ul>
              <li>Mon – Fri</li>
              <li>1.30pm – 7.00pm</li>
              <li style={{marginTop:14, color:'var(--tw-celadon)'}}>Holiday Hours</li>
              <li>Mon – Fri</li>
              <li>8.30am – 7.00pm</li>
            </ul>
          </div>
          <div>
            <h6>Pages</h6>
            <ul>
              {NAV_ITEMS.map(it => (
                <li key={it.id}>
                  <a href="#" onClick={(e)=>{e.preventDefault();setRoute(it.id);}}>{it.label}</a>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© 2026 The White Orchid · All Rights Reserved</span>
          <span>11 Simon Road, Singapore 545896</span>
        </div>
      </div>
    </footer>
  );
}

// ---------- Photo placeholder ----------
function Photo({ ratio = '4 / 5', label = 'Photograph', tone, style }) {
  return (
    <div className={'photo' + (tone ? ' ' + tone : '')} style={{ aspectRatio: ratio, ...style }}>
      <span className="ph-label">{label}</span>
    </div>
  );
}

// ---------- Sub-pillar list (Core / Explore items) ----------
function SubpillarList({ items }) {
  return (
    <ul className="subpillar-list">
      {items.map(it => <li key={it}>{it}</li>)}
    </ul>
  );
}

// ---------- Quote block ----------
function QuoteBlock({ quote, attrib }) {
  return (
    <div style={{maxWidth:860, margin:'0 auto', textAlign:'center', position:'relative'}}>
      <img src="../../assets/orchid-flat-vector.png" alt=""
           style={{width:52, opacity:.9, margin:'0 auto 24px', display:'block'}} />
      <blockquote style={{
        fontFamily:'var(--font-serif)', fontStyle:'italic', fontWeight:400,
        fontSize:32, lineHeight:1.35, color:'var(--fg-strong)',
        margin:0, textWrap:'balance'
      }}>
        "{quote}"
      </blockquote>
      <div style={{
        marginTop:24, fontFamily:'var(--font-syne)',
        fontSize:11, letterSpacing:'.18em', textTransform:'uppercase', fontWeight:600,
        color:'var(--fg-muted)'
      }}>{attrib}</div>
    </div>
  );
}

// ---------- Children's club facility tile ----------
function FacilityTile({ label, tone='celadon-soft' }) {
  const bg = {
    'celadon-soft': 'var(--tw-celadon-soft)',
    'wisteria-soft': 'var(--tw-wisteria-soft)',
    'tangerine-soft': 'var(--tw-tangerine-soft)',
    'ash-soft': 'var(--tw-ash-soft)',
    'celadon': 'var(--tw-celadon)',
  }[tone];
  return (
    <div style={{
      aspectRatio:'4 / 3', borderRadius:'var(--radius-lg)',
      background:bg, position:'relative', overflow:'hidden',
      display:'flex', alignItems:'flex-end', padding:24
    }}>
      <span style={{
        fontFamily:'var(--font-syne)', fontWeight:700,
        fontSize:14, letterSpacing:'.16em', textTransform:'uppercase',
        color:'var(--tw-burnham)'
      }}>{label}</span>
    </div>
  );
}

Object.assign(window, { Header, Footer, Photo, SubpillarList, QuoteBlock, FacilityTile, WA_URL, NAV_ITEMS });
