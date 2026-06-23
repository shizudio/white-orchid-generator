'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

export const MIDJOURNEY_PROFILE = '--p m7465332324297605130';
export const MIDJOURNEY_CREATE_URL = 'https://www.midjourney.com/imagine';

export default function MidjourneyLauncher({ variant = 'media' }) {
  const [open, setOpen] = useState(false);
  const [copyState, setCopyState] = useState('idle');
  const triggerRef = useRef(null);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  const panelId = useId();
  const titleId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setCopyState('idle');
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape') { close(); return; }
      if (event.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll('button, a[href]');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  const copyProfile = async () => {
    try {
      await navigator.clipboard.writeText(MIDJOURNEY_PROFILE);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      try {
        const field = document.createElement('textarea');
        field.value = MIDJOURNEY_PROFILE;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        field.remove();
        if (!copied) throw new Error('Copy was blocked');
        setCopyState('copied');
        window.setTimeout(() => setCopyState('idle'), 2200);
      } catch {
        setCopyState('error');
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`mj-launcher-trigger mj-launcher-trigger--${variant}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
      >
        <span aria-hidden="true">✦</span>
        Generate from MJ
      </button>

      {open && (
        <>
          <button type="button" className="mj-launcher-backdrop" tabIndex={-1} aria-hidden="true" onClick={close} />
          <aside ref={panelRef} id={panelId} className="mj-launcher-panel" role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className="mj-launcher-header">
            <div>
              <div className="mj-launcher-kicker">Midjourney</div>
              <h2 id={titleId}>Generate an on-brand image</h2>
            </div>
            <button ref={closeRef} type="button" className="mj-launcher-close" onClick={close} aria-label="Close Midjourney helper">×</button>
          </div>

          <p className="mj-launcher-intro">Write your image description in Midjourney, then add this personalization setting to the end of your prompt:</p>

          <div className="mj-profile-row">
            <code>{MIDJOURNEY_PROFILE}</code>
            <button type="button" onClick={copyProfile} aria-live="polite">
              {copyState === 'copied' ? 'Copied ✓' : copyState === 'error' ? 'Copy failed' : 'Copy'}
            </button>
          </div>

          {copyState === 'error' && <p className="mj-copy-error">Select and copy the setting manually, then paste it at the end of your prompt.</p>}

          <ol className="mj-launcher-steps">
            <li>Describe the image you want.</li>
            <li>Paste the personalization setting at the end.</li>
            <li>Generate and download your chosen image.</li>
            <li>Return here and upload it as a Midjourney render.</li>
          </ol>

          <a className="mj-open-link" href={MIDJOURNEY_CREATE_URL} target="_blank" rel="noopener noreferrer">
            Open Midjourney <span aria-hidden="true">↗</span>
          </a>
          </aside>
        </>
      )}
    </>
  );
}
