// ============================================================
// Pages — IA reconciled to the real White Orchid site
// Home · Curriculum · Day in the Life · Children's Club · Contact
// ============================================================

const PAGES = {};

// ---------- HOME ----------
PAGES.home = function Home({ setRoute }) {
  return (
    <div className="page">
      <section className="hero">
        <div className="shape-ornament" style={{top:80, right:-80, width:380, opacity:.45, transform:'rotate(12deg)'}}>
          <img src="../../assets/shape-2.svg" alt="" />
        </div>
        <div className="shape-ornament" style={{bottom:-40, left:-60, width:240, opacity:.5}}>
          <img src="../../assets/shape-1.svg" alt="" />
        </div>
        <div className="container" style={{position:'relative', zIndex:1}}>
          <span className="tw-eyebrow">Student Care · Singapore</span>
          <h1>A school <em>led by</em><br/>children.</h1>
          <p className="lede">We believe in the extraordinary potential of every child. That's why we give them real ownership to lead, make decisions, and shape their own journey. No limits. Only possibilities.</p>
          <div style={{display:'flex', gap:14, alignItems:'center', flexWrap:'wrap'}}>
            <button className="btn btn-pri btn-lg" onClick={() => setRoute('curriculum')}>
              Curriculum <span aria-hidden>→</span>
            </button>
            <button className="btn btn-out btn-lg" onClick={() => setRoute('day')}>
              Day in the Life
            </button>
          </div>
        </div>
      </section>

      {/* Curriculum preview */}
      <section className="section">
        <div className="container">
          <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:64, alignItems:'end', marginBottom:48}}>
            <div>
              <span className="tw-eyebrow">Our Curriculum</span>
              <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:48, lineHeight:1.08, letterSpacing:'-0.01em', margin:'14px 0 0', textWrap:'balance'}}>
                A transformative space,<br/>for children <em style={{color:'var(--tw-tangerine)'}}>and their parents.</em>
              </h2>
            </div>
            <p style={{fontSize:16, lineHeight:1.7, color:'var(--fg)', maxWidth:480, justifySelf:'end'}}>
              At The White Orchid, we offer a thoughtfully balanced student care programme designed to nurture your child's academic foundation, emotional resilience, and readiness for life beyond the classroom. Our curriculum is built around two key pillars — <strong>Core</strong> and <strong>Explore</strong> — that together shape confident, curious, and capable young individuals.
            </p>
          </div>

          <div className="pillar">
            <div className="core">
              <div className="pillar-h">CORE</div>
              <p>Core is designed to cultivate essential life skills, strengthen academic habits, and build self-confidence — equipping children with the tools they need to thrive.</p>
              <SubpillarList items={['Adulting 101','Unshakable Confidence','Academic Co-Pilot']} />
            </div>
            <div className="explore">
              <div className="pillar-h">EXPLORE</div>
              <p>Explore offers opportunities to discover a wide array of interests. We introduce new enrichment experiences every week, giving children the chance to find new passions.</p>
              <SubpillarList items={['Deep Dive','Weekly Discoveries']} />
            </div>
          </div>

          <div style={{textAlign:'center', marginTop:40}}>
            <button className="btn btn-out btn-lg" onClick={()=>setRoute('curriculum')}>
              View Details →
            </button>
          </div>
        </div>
      </section>

      {/* Day in the Life teaser */}
      <section className="section celadon">
        <div className="container">
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:64, alignItems:'center'}}>
            <div>
              <span className="tw-eyebrow">A Day in the Life</span>
              <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:48, lineHeight:1.1, letterSpacing:'-0.01em', margin:'14px 0 24px', textWrap:'balance'}}>
                Click on one of us<br/>to see more about<br/><em style={{color:'var(--tw-tangerine)'}}>our day.</em>
              </h2>
              <p style={{fontSize:16, lineHeight:1.7, color:'var(--fg)', maxWidth:440, marginBottom:24}}>
                Our day balances academic rigour with rest, play, and exploration. Every child has a name, a voice, and a story.
              </p>
              <button className="btn btn-pri" onClick={()=>setRoute('day')}>See Their Day →</button>
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14}}>
              <Photo ratio="3 / 4" label="Nathan" tone="wisteria" />
              <Photo ratio="3 / 4" label="Inara" style={{marginTop:32}} />
              <Photo ratio="3 / 4" label="Theo" tone="ash" />
            </div>
          </div>
        </div>
      </section>

      {/* Children's Club */}
      <section className="section deep">
        <div className="pattern-bg"></div>
        <div className="container" style={{position:'relative'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:80, alignItems:'end', marginBottom:48}}>
            <div>
              <span className="tw-eyebrow">Saturday</span>
              <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:56, lineHeight:1.05, margin:'14px 0 0'}}>
                Children's<br/>Club.
              </h2>
            </div>
            <p style={{fontSize:16, lineHeight:1.7, color:'var(--tw-celadon)', maxWidth:440, justifySelf:'end'}}>
              "As parents, we would like to thank the teachers for their continuous care, support, collaboration, and most importantly patience. We have witnessed massive and exponential development in our daughter."
            </p>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:14, marginBottom:36}}>
            <FacilityTile label="Workshops" tone="celadon" />
            <FacilityTile label="Event Space" tone="wisteria-soft" />
            <FacilityTile label="Birthdays" tone="tangerine-soft" />
            <FacilityTile label="Playground" tone="celadon-soft" />
            <FacilityTile label="Play Area" tone="ash-soft" />
          </div>

          <div style={{textAlign:'center'}}>
            <button className="btn btn-pri btn-lg" onClick={()=>setRoute('club')}>Find Out More →</button>
          </div>
        </div>
      </section>

      {/* Visit CTA */}
      <section className="section">
        <div className="container" style={{textAlign:'center'}}>
          <span className="tw-eyebrow">Tour</span>
          <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:56, lineHeight:1.05, letterSpacing:'-0.01em', margin:'18px auto 24px', maxWidth:760, textWrap:'balance'}}>
            We invite you to <em style={{color:'var(--tw-tangerine)'}}>experience our school.</em>
          </h2>
          <p style={{fontSize:18, lineHeight:1.6, color:'var(--fg)', maxWidth:560, margin:'0 auto 36px'}}>
            By the end of it, we hope you'll see first-hand our vision come to life at The White Orchid.
          </p>
          <a className="btn btn-pri btn-lg" href={WA_URL} target="_blank" rel="noopener">
            Find Your Slot <span aria-hidden>→</span>
          </a>
        </div>
      </section>
    </div>
  );
};

// ---------- CURRICULUM ----------
PAGES.curriculum = function Curriculum() {
  return (
    <div className="page">
      <section className="hero" style={{paddingBottom:48}}>
        <div className="container-narrow">
          <span className="tw-eyebrow">Our Curriculum</span>
          <h1 style={{fontSize:'clamp(40px, 5vw, 72px)', margin:'18px 0 28px'}}>
            Two pillars,<br/><em>one whole child.</em>
          </h1>
          <p className="lede" style={{maxWidth:'none'}}>
            A thoughtfully balanced student care programme designed to nurture your child's academic foundation, emotional resilience, and readiness for life beyond the classroom.
          </p>
        </div>
      </section>

      {/* CORE */}
      <section className="section deep">
        <div className="pattern-bg"></div>
        <div className="container" style={{position:'relative'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:64, marginBottom:48, alignItems:'end'}}>
            <div>
              <span className="tw-eyebrow">Pillar One</span>
              <div style={{fontFamily:'var(--font-syne)', fontWeight:700, fontSize:88, letterSpacing:'.06em', margin:'14px 0 0', color:'var(--tw-celadon)'}}>CORE</div>
            </div>
            <p style={{fontSize:18, lineHeight:1.7, color:'var(--tw-celadon)', maxWidth:520, justifySelf:'end'}}>
              Core is designed to cultivate essential life skills, strengthen academic habits, and build self-confidence — equipping children with the tools they need to thrive.
            </p>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:18}}>
            {[
              { tag:'Adulting 101', title:'Adulting 101', body:'The everyday skills schools forget to teach. Cooking, budgeting, conflict, time. Practised, not lectured.' },
              { tag:'Unshakable Confidence', title:'Unshakable Confidence', body:'Children speak first in our circles. They lead projects, settle disagreements, and learn that their voice matters.' },
              { tag:'Academic Co-Pilot', title:'Academic Co-Pilot', body:'A patient adult beside the homework, not over it. We strengthen habits, not just answers.' },
            ].map(c => (
              <div key={c.title} className="card-deep">
                <span className="tag tag-on-deep">{c.tag}</span>
                <h3 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:26, lineHeight:1.18, margin:'14px 0 12px', color:'var(--fg-on-deep)'}}>{c.title}</h3>
                <p style={{margin:0, fontSize:14, lineHeight:1.6, color:'var(--tw-celadon)'}}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EXPLORE */}
      <section className="section celadon">
        <div className="container">
          <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:64, marginBottom:48, alignItems:'end'}}>
            <div>
              <span className="tw-eyebrow">Pillar Two</span>
              <div style={{fontFamily:'var(--font-syne)', fontWeight:700, fontSize:88, letterSpacing:'.06em', margin:'14px 0 0', color:'var(--tw-burnham)'}}>EXPLORE</div>
            </div>
            <p style={{fontSize:18, lineHeight:1.7, color:'var(--fg)', maxWidth:520, justifySelf:'end'}}>
              Explore offers opportunities to discover a wide array of interests. We introduce new enrichment experiences every week, giving children the chance to find new passions.
            </p>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
            {[
              { tag:'Deep Dive', title:'Deep Dive', body:'Long-form projects across weeks — chess, ceramics, gardening. Children carry one practice deeply rather than many shallowly.' },
              { tag:'Weekly Discoveries', title:'Weekly Discoveries', body:'A new enrichment every week. Visiting practitioners, field trips, hands-on workshops. Curiosity is the curriculum.' },
            ].map(c => (
              <div key={c.title} className="card-w">
                <span className="tag">{c.tag}</span>
                <h3 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:28, lineHeight:1.18, margin:'14px 0 12px', color:'var(--fg-strong)'}}>{c.title}</h3>
                <p style={{margin:0, fontSize:15, lineHeight:1.6, color:'var(--fg)'}}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-tight">
        <div className="container-narrow">
          <QuoteBlock
            quote="Nathan learnt chess in one day during our weekly Children's Chess Club. Frankly, we smell a grandmaster on our hands…"
            attrib="From the studio · April"
          />
        </div>
      </section>
    </div>
  );
};

// ---------- DAY IN THE LIFE ----------
PAGES.day = function Day() {
  const [active, setActive] = React.useState('inara');
  const children = {
    nathan: { name:'Nathan', age:'8 yrs', tone:'wisteria',
      blurb:'Nathan plays chess at the Children\'s Chess Club every Saturday. He learnt the game in a day.' },
    inara:  { name:'Inara',  age:'5 yrs', tone:undefined,
      blurb:'Inara is in the Garden Class. She led the morning circle and chose the boat-build over reading.' },
    theo:   { name:'Theo',   age:'7 yrs', tone:'ash',
      blurb:'Theo is in the Studio for the older children. He carried a ceramics project across six weeks.' },
  };
  const day = [
    ['1.30pm', 'Pickup &amp; Snack', 'A slow start. Tea, fruit, and a check-in with each child.'],
    ['2.30pm', 'Academic Co-Pilot', 'Homework with a patient adult beside, not over.'],
    ['4.00pm', 'Deep Dive', 'Weekly project work. Chess, ceramics, gardening, writing.'],
    ['5.00pm', 'Weekly Discovery', 'A new enrichment — a guest, a trip, a hands-on workshop.'],
    ['6.00pm', 'Free Play', 'Outdoors when dry. The playground, the play area, the sea wall walk.'],
    ['6.45pm', 'Wind Down', 'Tidy together. The school is put to bed by the children who built the day.'],
    ['7.00pm', 'Doors Close', 'Pickup. Parents are welcome to stay for tea.'],
  ];
  const c = children[active];

  return (
    <div className="page">
      <section className="hero" style={{paddingBottom:32}}>
        <div className="container">
          <span className="tw-eyebrow">A Day in the Life</span>
          <h1 style={{fontSize:'clamp(40px,5vw,72px)', margin:'18px 0 24px'}}>
            Click on one of us<br/>to see more about <em>our day.</em>
          </h1>
        </div>
      </section>

      <section className="section-tight" style={{paddingTop:0}}>
        <div className="container">
          {/* Child selector */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14, marginBottom:48}}>
            {Object.entries(children).map(([id, ch]) => (
              <button key={id}
                onClick={()=>setActive(id)}
                style={{
                  border:0, padding:0, cursor:'pointer',
                  background:'transparent', textAlign:'left',
                  outline: active===id ? '3px solid var(--tw-tangerine)' : 'none',
                  outlineOffset: 6, borderRadius: 'var(--radius-lg)',
                  transition: 'outline-color 200ms'
                }}>
                <Photo ratio="4 / 5" label={ch.name} tone={ch.tone} />
              </button>
            ))}
          </div>

          {/* Active child */}
          <div style={{display:'grid', gridTemplateColumns:'1fr 1.4fr', gap:64, alignItems:'start', marginBottom:32}}>
            <div>
              <span className="tag">{c.age}</span>
              <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:56, lineHeight:1.05, margin:'14px 0 16px', color:'var(--fg-strong)'}}>
                {c.name}'s day.
              </h2>
              <p style={{fontSize:17, lineHeight:1.6, color:'var(--fg)'}}>{c.blurb}</p>
            </div>

            <div style={{borderTop:'1px solid var(--line)'}}>
              {day.map(([t, title, body]) => (
                <div key={t} style={{
                  display:'grid', gridTemplateColumns:'90px 1fr',
                  gap:32, padding:'22px 0',
                  borderBottom:'1px solid var(--line)'
                }}>
                  <div style={{fontFamily:'var(--font-syne)', fontSize:11, fontWeight:600, letterSpacing:'.16em', textTransform:'uppercase', color:'var(--fg-muted)', paddingTop:6}}>
                    {t}
                  </div>
                  <div>
                    <div style={{fontFamily:'var(--font-serif)', fontSize:22, lineHeight:1.2, color:'var(--fg-strong)'}} dangerouslySetInnerHTML={{__html: title}} />
                    <p style={{margin:'6px 0 0', fontSize:14, lineHeight:1.6, color:'var(--fg)'}}>{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

// ---------- CHILDREN'S CLUB ----------
PAGES.club = function Club() {
  return (
    <div className="page">
      <section className="hero" style={{paddingBottom:48}}>
        <div className="container-narrow">
          <span className="tw-eyebrow">Saturday Children's Club</span>
          <h1 style={{fontSize:'clamp(40px, 5vw, 72px)', margin:'18px 0 28px'}}>
            A space to <em>discover, play, and belong.</em>
          </h1>
          <p className="lede" style={{maxWidth:'none'}}>
            On Saturdays, our doors open to a wider community of children. Workshops led by visiting practitioners, free play in the gardens, and quiet corners for reading.
          </p>
        </div>
      </section>

      <section className="section-tight">
        <div className="container">
          <div style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:14, marginBottom:48}}>
            <FacilityTile label="Workshops" tone="celadon" />
            <FacilityTile label="Event Space" tone="wisteria-soft" />
            <FacilityTile label="Birthdays" tone="tangerine-soft" />
            <FacilityTile label="Playground" tone="celadon-soft" />
            <FacilityTile label="Play Area" tone="ash-soft" />
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:48}}>
            {[
              {tag:'Workshops', title:'Visiting Practitioners', body:'Each Saturday brings a new craft, skill, or curiosity — chess, pottery, cooking, woodwork. Children sign up for what calls them.'},
              {tag:'Event Space', title:'For Family Gatherings', body:'A bookable indoor space for small gatherings, classes, and community evenings.'},
              {tag:'Birthdays', title:'Celebrate With Us', body:'Birthday parties hosted in our event space, with optional craft tables, garden games, and tea for the grown-ups.'},
              {tag:'Playground', title:'Outdoor Play', body:'The garden playground is open every Saturday for free play, weather permitting.'},
            ].map(c => (
              <div key={c.tag} className="card-w">
                <span className="tag">{c.tag}</span>
                <h3 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:28, lineHeight:1.18, margin:'14px 0 12px', color:'var(--fg-strong)'}}>{c.title}</h3>
                <p style={{margin:0, fontSize:15, lineHeight:1.6, color:'var(--fg)'}}>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section deep" style={{paddingTop:96, paddingBottom:96}}>
        <div className="pattern-bg"></div>
        <div className="container" style={{position:'relative', textAlign:'center'}}>
          <span className="tw-eyebrow">Find Out More</span>
          <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:48, lineHeight:1.08, margin:'18px auto 36px', maxWidth:680, textWrap:'balance'}}>
            Saturdays at The White Orchid.
          </h2>
          <a className="btn btn-pri btn-lg" href={WA_URL} target="_blank" rel="noopener">Message Us →</a>
        </div>
      </section>
    </div>
  );
};

// ---------- CONTACT ----------
PAGES.contact = function Contact() {
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    first:'', child:'', email:'', mobile:'', age:'5', source:'Website', message:''
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="page">
      <section className="hero" style={{paddingBottom:32}}>
        <div className="container-narrow">
          <span className="tw-eyebrow">Contact</span>
          <h1 style={{fontSize:'clamp(40px,5vw,72px)', margin:'18px 0 24px'}}>
            We'd love to <em>hear from you.</em>
          </h1>
        </div>
      </section>

      <section className="section-tight" style={{paddingTop:0}}>
        <div className="container">
          <div style={{display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:64, alignItems:'start'}}>
            {/* Form */}
            <div>
              {submitted ? (
                <div style={{padding:48, background:'var(--tw-celadon-soft)', borderRadius:'var(--radius-lg)', textAlign:'center'}}>
                  <img src="../../assets/orchid-flat-vector.png" alt="" style={{width:52, opacity:.9, margin:'0 auto 18px', display:'block'}} />
                  <h2 style={{fontFamily:'var(--font-serif)', fontWeight:400, fontSize:32, margin:'0 0 12px', color:'var(--tw-burnham)'}}>Thank you, {form.first || 'friend'}.</h2>
                  <p style={{fontSize:15, color:'var(--tw-burnham)'}}>We'll be in touch within two working days.</p>
                </div>
              ) : (
                <form onSubmit={(e)=>{e.preventDefault();setSubmitted(true);}}
                      style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:18}}>
                  <Field label="First Name *" value={form.first} onChange={set('first')} />
                  <Field label="Child Name" value={form.child} onChange={set('child')} />
                  <Field label="Email *" value={form.email} onChange={set('email')} />
                  <Field label="Mobile Number *" value={form.mobile} onChange={set('mobile')} />
                  <Field label="Child Age" as="select" value={form.age} onChange={set('age')}
                         options={['4','5','6','7','8','9','10','11','12']} />
                  <Field label="How did you hear about us? *" as="select" value={form.source} onChange={set('source')}
                         options={['Website','Social Media','Relative','Friend','Walked Past']} />
                  <Field span={2} label="Your Message *" as="textarea" value={form.message} onChange={set('message')} />
                  <div style={{gridColumn:'1 / -1', display:'flex', justifyContent:'flex-end', marginTop:8}}>
                    <button className="btn btn-pri btn-lg" type="submit">Submit →</button>
                  </div>
                </form>
              )}
            </div>

            {/* Find us */}
            <div>
              <h6 style={{fontFamily:'var(--font-syne)', fontSize:11, fontWeight:600, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--fg-muted)', margin:'0 0 14px'}}>Find Us</h6>
              <p style={{fontFamily:'var(--font-serif)', fontSize:24, lineHeight:1.3, color:'var(--fg-strong)', margin:0}}>
                11 Simon Road,<br/>Singapore 545896
              </p>

              <div style={{height:1, background:'var(--line)', margin:'28px 0'}} />

              <h6 style={{fontFamily:'var(--font-syne)', fontSize:11, fontWeight:600, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--fg-muted)', margin:'0 0 14px'}}>Contact Us</h6>
              <p style={{fontSize:16, lineHeight:1.7, color:'var(--fg)', margin:0}}>
                <a href="tel:+6580850652" style={{color:'inherit', textDecoration:'none', borderBottom:'1px solid var(--line)'}}>+65 8085 0652</a><br/>
                <a href="mailto:hello@thewhiteorchid.sg" style={{color:'inherit', textDecoration:'none', borderBottom:'1px solid var(--line)'}}>hello@thewhiteorchid.sg</a>
              </p>

              <div style={{height:1, background:'var(--line)', margin:'28px 0'}} />

              <h6 style={{fontFamily:'var(--font-syne)', fontSize:11, fontWeight:600, letterSpacing:'.18em', textTransform:'uppercase', color:'var(--fg-muted)', margin:'0 0 14px'}}>Timings</h6>
              <p style={{fontSize:14, lineHeight:1.7, color:'var(--fg)', margin:0}}>
                <strong>School Term Hours</strong><br/>
                Monday to Friday: 1:30pm – 7:00pm
              </p>
              <p style={{fontSize:14, lineHeight:1.7, color:'var(--fg)', margin:'14px 0 0'}}>
                <strong>School Holiday Hours</strong><br/>
                Monday to Friday: 8:30am – 7:00pm
              </p>

              <a className="btn btn-pri btn-lg" style={{marginTop:28}}
                 href={WA_URL} target="_blank" rel="noopener">
                WhatsApp Us →
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

function Field({ label, value, onChange, as = 'input', options, span = 1 }) {
  const inputStyle = {
    fontFamily:'var(--font-body)', fontSize:14, color:'var(--fg)',
    background:'#fff', border:'1px solid var(--line-strong)',
    borderRadius:10, padding:'12px 14px', outline:'none', width:'100%',
    boxSizing:'border-box'
  };
  return (
    <label style={{display:'flex', flexDirection:'column', gap:8, gridColumn:`span ${span}`}}>
      <span style={{fontFamily:'var(--font-syne)', fontSize:11, fontWeight:600, letterSpacing:'.10em', textTransform:'uppercase', color:'var(--fg-muted)'}}>{label}</span>
      {as === 'input' && <input value={value} onChange={onChange} style={inputStyle} />}
      {as === 'select' && (
        <select value={value} onChange={onChange} style={inputStyle}>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
      )}
      {as === 'textarea' && <textarea rows={4} value={value} onChange={onChange} style={{...inputStyle, resize:'vertical'}} />}
    </label>
  );
}

Object.assign(window, { PAGES });
