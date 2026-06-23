'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STEPS = [
  ['Upload images', 'Label each image as a Midjourney render or real photo. Only publish real photos marked Cleared.'],
  ['Check the Library', 'Search and filter your approved images before choosing one.'],
  ['Create a post', 'Choose Photo + Logo, Quote, Event, Text Post or Photo + Text.'],
  ['Choose a format', 'Pick the correct size for Instagram, Stories, Twitter/X, Facebook or banners.'],
  ['Design', 'Add text, position the image, select a logo and optionally apply a branded shape.'],
  ['Review', 'Check spelling, layout, logo visibility, brand guidance and consent.'],
  ['Download', 'Export as PNG or JPG. Video can be previewed, but MP4 export is not available yet.'],
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
