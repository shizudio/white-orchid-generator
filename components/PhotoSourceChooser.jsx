'use client';

import { PHOTO_SOURCES, PHOTO_SOURCE_LABELS } from '@/lib/photo-source-policy.mjs';

// ── Photo-source chooser (task #69, client ruling 2026-08-17) ────────────────
// ONE shared three-way choice — "Let AI decide" (default, visually primary) /
// "Pick from my library" / "Upload a photo" — used by BOTH the landing flow
// (photo-led plans pause here for one tap) and the studio's New-post offer.
// Light and inline by design: no modal, one tap, then move on. The
// data-wo-photo-source attributes are a DRIVER CONTRACT: the MCP headless
// driver (mcp-server/driver.mjs) and the resident tester accept the default by
// clicking [data-wo-photo-source="ai"] — keep them stable.
export default function PhotoSourceChooser({ onChoose, hint, busy = false, onDismiss = null }) {
  const primary = {
    ai: {
      background: 'var(--tw-tangerine)',
      color: '#fff',
      border: '1px solid transparent',
      fontWeight: 600,
    },
  };
  const quiet = {
    background: 'color-mix(in srgb, var(--tw-celadon) 22%, transparent)',
    border: '1px solid color-mix(in srgb, var(--tw-celadon-deep) 40%, transparent)',
    color: 'var(--fg)',
  };
  return (
    <div role="group" aria-label="Choose the photo source"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {hint && (
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--fg, #3a3f3a)',
          lineHeight: 1.4, textAlign: 'center',
        }}>
          {hint}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
        {PHOTO_SOURCES.map(source => (
          <button key={source} type="button"
            data-wo-photo-source={source}
            disabled={busy}
            onClick={() => onChoose?.(source)}
            style={{
              fontFamily: 'var(--font-body)', fontSize: 13,
              borderRadius: 20, padding: '9px 16px', minHeight: 38,
              cursor: busy ? 'default' : 'pointer', transition: 'background 140ms, opacity 140ms',
              opacity: busy ? 0.6 : 1,
              ...(primary[source] || quiet),
            }}>
            {PHOTO_SOURCE_LABELS[source]}
          </button>
        ))}
        {onDismiss && (
          <button type="button" onClick={onDismiss} aria-label="Dismiss photo source choice"
            style={{
              background: 'none', border: 'none', color: 'var(--fg-subtle, #8a8f8a)',
              fontSize: 16, lineHeight: 1, padding: '6px 8px', cursor: 'pointer',
            }}>
            ×
          </button>
        )}
      </div>
    </div>
  );
}
