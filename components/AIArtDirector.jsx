'use client';

import { useEffect, useRef, useState } from 'react';

const CHANNELS = ['Instagram', 'Story / Reel', 'Facebook', 'X / Twitter', 'Website banner'];
const TYPE_LABELS = {
  photo_logo: 'Photo + Logo', quote: 'Quote', event: 'Event / Date',
  text_post: 'Text Post', texture_text: 'Photo + Text',
};
const FORMAT_LABELS = {
  ig_square: 'IG Square', ig_portrait: 'IG Portrait', story: 'Story / Reel',
  twitter: 'X / Twitter', facebook: 'Facebook', banner: 'Website Banner',
};

export default function AIArtDirector({ onApply, canUndo, onUndo }) {
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [audience, setAudience] = useState('');
  const [channel, setChannel] = useState('Instagram');
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    setTimeout(() => dialogRef.current?.focus(), 0);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [open]);

  async function createPlan() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/creative-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal, audience, channel }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create a suggestion.');
      setPlan(data.plan);
      setCopied(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function applyPlan() {
    onApply(plan);
    setOpen(false);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(plan.midjourneyPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Could not copy automatically. Select the prompt and copy it manually.');
    }
  }

  return (
    <>
      <div className="art-director-entry">
        <div>
          <span className="art-director-kicker">AI Art Director</span>
          <p>Describe the post and get an editable layout suggestion.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)}>Create starting point</button>
      </div>
      {canUndo && (
        <button type="button" className="art-director-undo" onClick={onUndo}>↶ Undo AI suggestion</button>
      )}

      {open && (
        <div className="art-director-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section ref={dialogRef} className="art-director-dialog" role="dialog" aria-modal="true" aria-labelledby="art-director-title" tabIndex={-1}>
            <button type="button" className="art-director-close" onClick={() => setOpen(false)} aria-label="Close AI Art Director">×</button>
            <span className="art-director-kicker">AI Art Director</span>
            <h2 id="art-director-title">What are we creating?</h2>
            <p className="art-director-intro">Give it the intention behind your post. It will choose an existing template and fill the editor—nothing gets locked.</p>

            {!plan ? (
              <form onSubmit={event => { event.preventDefault(); createPlan(); }}>
                <label htmlFor="art-goal">Post goal and reason</label>
                <textarea id="art-goal" value={goal} onChange={event => setGoal(event.target.value)} minLength={8} maxLength={600} required placeholder="E.g. Promote our June parent workshop because we want more registrations. Keep it warm and welcoming." />
                <div className="art-director-grid">
                  <div>
                    <label htmlFor="art-audience">Audience <span>Optional</span></label>
                    <input id="art-audience" value={audience} onChange={event => setAudience(event.target.value)} maxLength={160} placeholder="Parents of students aged 10+" />
                  </div>
                  <div>
                    <label htmlFor="art-channel">Channel</label>
                    <select id="art-channel" value={channel} onChange={event => setChannel(event.target.value)}>
                      {CHANNELS.map(item => <option key={item}>{item}</option>)}
                    </select>
                  </div>
                </div>
                {error && <p className="art-director-error" role="alert">{error}</p>}
                <button type="submit" className="art-director-primary" disabled={loading || goal.trim().length < 8}>
                  {loading ? 'Directing…' : 'Suggest a layout'}
                </button>
              </form>
            ) : (
              <div className="art-director-result">
                <div className="art-director-summary">
                  <span>{TYPE_LABELS[plan.postType]}</span>
                  <span>{FORMAT_LABELS[plan.dimensionId]}</span>
                  <span>{plan.bgColor.replace(/([A-Z])/g, ' $1')}</span>
                </div>
                {(plan.headline || plan.subtext) && (
                  <div className="art-director-copy">
                    {plan.headline && <h3>{plan.headline}</h3>}
                    {plan.subtext && <p>{plan.subtext}</p>}
                  </div>
                )}
                <dl>
                  <div><dt>Layout</dt><dd>{plan.logoPosition.replace(/-/g, ' ')} logo · size {plan.logoSize.toUpperCase()}</dd></div>
                  <div><dt>Visual direction</dt><dd>{plan.imageDirection || 'Use a simple brand-led background.'}</dd></div>
                  <div><dt>Why this works</dt><dd>{plan.rationale}</dd></div>
                </dl>
                <div className="art-director-prompt">
                  <div className="art-director-prompt-header">
                    <span>Midjourney prompt</span>
                    <button type="button" onClick={copyPrompt}>{copied ? 'Copied ✓' : 'Copy prompt'}</button>
                  </div>
                  <p>{plan.midjourneyPrompt}</p>
                </div>
                {error && <p className="art-director-error" role="alert">{error}</p>}
                <div className="art-director-actions">
                  <button type="button" className="art-director-secondary" onClick={() => { setPlan(null); setError(''); }}>Edit brief</button>
                  <button type="button" className="art-director-secondary" onClick={createPlan} disabled={loading}>{loading ? 'Directing…' : 'Regenerate'}</button>
                  <button type="button" className="art-director-primary" onClick={applyPlan}>Apply suggestion</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
