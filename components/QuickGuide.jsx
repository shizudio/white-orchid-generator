'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STEPS = [
  ['Start', 'Describe the post you want in the chat on the left — Orchid, your design helper, builds a ready-to-edit design. Or open a starter template from Templates.'],
  ['Click anything to edit it', 'Every element on the preview is editable — click the text, photo, logo, even the small labels and hairlines. A small inspector opens with just that element’s controls.'],
  ['Undo anything', 'Press Cmd+Z (Ctrl+Z) to undo any change — yours or the AI’s. Cmd+Shift+Z redoes. There’s also a floating ↶ Undo button by the canvas.'],
  ['Add what’s missing', 'The ＋ Add button in the top bar shows everything you can add — small text, a date, a button, the logo, a photo, and the signature petal Shapes. Tap a tile, no design words needed.'],
  ['Ask Orchid', 'The chat changes anything you can describe — “make the background wisteria”, “try another layout”, “generate a photo of children painting outdoors”.'],
  ['Check + export', 'Run the AI audit for contrast and on-brand polish, write a caption with the Caption writer, then Export — one format or all sizes at once.'],
  ['Report something that’s off', 'Type “/feedback” in the chat followed by what isn’t working — Orchid notes it with a snapshot of your current design and sends it to the team. No form to fill in.'],
  ['Save for the team', 'Templates → “Save current design” adds it to the shared library so the whole team can reuse it.'],
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
