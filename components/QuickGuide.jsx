'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STEPS = [
  ['Start', 'On the landing page, just describe the post you want — the Art Director builds a ready-to-edit design. Or open a starter template (or one from “Your templates”).'],
  ['Make it yours', 'Click anything on the preview to edit it — text, photo or logo. Use the elements rail (or the chips on mobile) for colours, fonts and backgrounds, and the format strip to switch between Instagram, Stories, X, Facebook and banner sizes.'],
  ['Ask the Art Director', 'Tap the ✦ button any time to change colours or formats, swap the layout, or even generate a photo — “generate a photo of children painting outdoors”.'],
  ['Check + export', 'Run ✓ AI audit for contrast, sizing and on-brand polish, use ✎ Caption to write a post caption and hashtags, then Download — as PNG/JPG, or “Download all formats” for every size at once.'],
  ['Save for the team', 'Save template adds your design to the shared “Your templates” library so the whole team can reuse it.'],
];

export default function QuickGuide({ variant = 'nav' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const closeRef = useRef(null);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = event => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`quick-guide-trigger quick-guide-trigger--${variant}`}
        aria-expanded={open}
        aria-controls="quick-guide-panel"
        onClick={() => setOpen(value => !value)}
      >
        <span aria-hidden="true" className="quick-guide-icon">?</span>
        <span className="quick-guide-label">Guide</span>
      </button>

      {open && (
        <aside id="quick-guide-panel" className="quick-guide-panel" role="dialog" aria-modal="false" aria-labelledby="quick-guide-title">
          <div className="quick-guide-header">
            <div>
              <div className="quick-guide-kicker">Help</div>
              <h2 id="quick-guide-title">Content Studio quick guide</h2>
            </div>
            <button ref={closeRef} type="button" className="quick-guide-close" onClick={close} aria-label="Close quick guide">×</button>
          </div>

          <ol className="quick-guide-steps">
            {STEPS.map(([title, description]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{description}</span>
              </li>
            ))}
          </ol>

          <p className="quick-guide-admin"><strong>Administrators:</strong> Update colours, typography and publishing guidance from Brand Kit.</p>
        </aside>
      )}
    </>
  );
}
