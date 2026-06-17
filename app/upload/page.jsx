'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';

const CONSENT_OPTIONS = [
  { value: 'cleared', label: 'Cleared for public posting', desc: 'Written consent obtained from all identifiable individuals', color: '#2B5040' },
  { value: 'pending', label: 'Consent pending', desc: 'Consent process started but not yet confirmed — cannot export until cleared', color: '#C9A030' },
  { value: 'blocked', label: 'Do not post', desc: 'No consent — this image cannot be exported under any circumstances', color: '#CC3333' },
];

export default function UploadPage() {
  const [files, setFiles] = useState([]); // [{file, preview, sourceType, consentStatus, status, error, result}]
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const addFiles = useCallback((newFiles) => {
    const entries = Array.from(newFiles).map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
      sourceType: null,
      consentStatus: 'cleared',
      status: 'pending', // pending | uploading | done | error
      error: null,
      result: null,
    }));
    setFiles(prev => [...prev, ...entries]);
  }, []);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files;
    if (dropped.length) addFiles(dropped);
  }, [addFiles]);

  const update = (id, patch) =>
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));

  const remove = (id) => setFiles(prev => prev.filter(f => f.id !== id));

  const uploadOne = async (entry) => {
    if (!entry.sourceType) {
      update(entry.id, { error: 'Select image type before uploading', status: 'error' });
      return;
    }
    update(entry.id, { status: 'uploading', error: null });

    const fd = new FormData();
    fd.append('file', entry.file);
    fd.append('source_type', entry.sourceType);
    if (entry.sourceType === 'real_photo') {
      fd.append('consent_status', entry.consentStatus);
    }

    const res = await fetch('/api/images', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) {
      update(entry.id, { status: 'error', error: data.error || 'Upload failed' });
    } else {
      update(entry.id, { status: 'done', result: data });
    }
  };

  const uploadAll = () => {
    files.filter(f => f.status === 'pending').forEach(uploadOne);
  };

  const allReady = files.length > 0 && files.every(f => f.sourceType);
  const anyPending = files.some(f => f.status === 'pending');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ivory)' }}>
      {/* Nav */}
      <nav style={{ background: 'var(--burnham)', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 3, color: 'var(--ivory)', textTransform: 'uppercase' }}>The White Orchid — Upload</span>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/library" style={navLink}>Library</Link>
          <Link href="/generate" style={navLink}>Create Post</Link>
          <Link href="/" style={navLink}>Home</Link>
        </div>
      </nav>

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 36, fontWeight: 400, color: 'var(--burnham)', marginBottom: 6 }}>Upload Images</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#6B6560', marginBottom: 32, lineHeight: 1.6 }}>
          Every image must be tagged as a Midjourney render or real photo. Real photos require a consent status before they can be exported.
        </p>

        {/* Drop zone */}
        <div
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragging ? 'var(--burnham)' : 'rgba(43,80,64,0.25)'}`,
            borderRadius: 16,
            padding: '48px 32px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragging ? 'rgba(43,80,64,0.04)' : '#fff',
            transition: 'all 0.15s',
            marginBottom: 32,
            transform: dragging ? 'scale(1.01)' : 'scale(1)',
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📁</div>
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--burnham)', marginBottom: 6 }}>
            Drop images here
          </div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#6B6560' }}>
            or click to browse — JPG, PNG, WebP
          </div>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={e => addFiles(e.target.files)} style={{ display: 'none' }} />
        </div>

        {/* File list */}
        {files.length > 0 && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 32 }}>
              {files.map(entry => (
                <FileCard key={entry.id} entry={entry} onUpdate={update} onRemove={remove} onUpload={uploadOne} />
              ))}
            </div>

            {anyPending && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <button
                  onClick={uploadAll}
                  disabled={!allReady}
                  style={{
                    padding: '14px 40px',
                    background: allReady ? 'var(--burnham)' : '#ccc',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 40,
                    fontFamily: 'var(--font-ui)',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 2,
                    textTransform: 'uppercase',
                    cursor: allReady ? 'pointer' : 'not-allowed',
                  }}
                >
                  Upload All
                </button>
                {!allReady && (
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: '#CC3333' }}>
                    Tag all images as Midjourney or Real Photo first
                  </span>
                )}
              </div>
            )}

            {files.every(f => f.status === 'done') && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 20 }}>✅</div>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--burnham)' }}>
                  All uploaded successfully
                </span>
                <Link href="/library" style={{ marginLeft: 8, padding: '10px 24px', background: 'var(--tangerine)', color: '#fff', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
                  View Library →
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function FileCard({ entry, onUpdate, onRemove, onUpload }) {
  const isDone = entry.status === 'done';
  const isUploading = entry.status === 'uploading';
  const isError = entry.status === 'error';

  return (
    <div style={{
      background: '#fff',
      borderRadius: 14,
      border: `1.5px solid ${isError ? '#CC3333' : isDone ? 'rgba(43,80,64,0.3)' : 'rgba(184,176,168,0.4)'}`,
      padding: 16,
      display: 'flex',
      gap: 16,
      alignItems: 'flex-start',
      opacity: isDone ? 0.85 : 1,
    }}>
      {/* Thumbnail */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <img src={entry.preview} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
        {isDone && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(43,80,64,0.5)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>✓</div>
        )}
        {isUploading && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.7)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>⏳</div>
        )}
      </div>

      {/* Controls */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--jet)', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.file.name}
        </div>

        {!isDone && (
          <>
            {/* Source type */}
            <div style={{ marginBottom: 12 }}>
              <div style={sectionLabel}>Image type</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'midjourney_render', label: 'Midjourney render' },
                  { value: 'real_photo', label: 'Real photo' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => onUpdate(entry.id, { sourceType: opt.value, consentStatus: opt.value === 'real_photo' ? 'cleared' : 'na' })}
                    style={{
                      padding: '7px 14px',
                      borderRadius: 40,
                      border: `1.5px solid ${entry.sourceType === opt.value ? 'var(--burnham)' : 'rgba(184,176,168,0.5)'}`,
                      background: entry.sourceType === opt.value ? 'var(--burnham)' : 'transparent',
                      color: entry.sourceType === opt.value ? '#fff' : 'var(--jet)',
                      fontFamily: 'var(--font-ui)',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      letterSpacing: 0.3,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Consent gate — only for real photos */}
            {entry.sourceType === 'real_photo' && (
              <div style={{ marginBottom: 12, background: 'rgba(43,80,64,0.04)', borderRadius: 10, padding: '12px 14px', border: '1px solid rgba(43,80,64,0.12)' }}>
                <div style={{ ...sectionLabel, marginBottom: 8 }}>Consent status <span style={{ color: '#CC3333' }}>*</span></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {CONSENT_OPTIONS.map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={`consent-${entry.id}`}
                        value={opt.value}
                        checked={entry.consentStatus === opt.value}
                        onChange={() => onUpdate(entry.id, { consentStatus: opt.value })}
                        style={{ marginTop: 3, accentColor: opt.color }}
                      />
                      <div>
                        <div style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: opt.color }}>{opt.label}</div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: '#6B6560', lineHeight: 1.4 }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {isError && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#CC3333', marginBottom: 8 }}>
                {entry.error}
              </div>
            )}
          </>
        )}

        {isDone && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--burnham)' }}>
            Uploaded · {entry.result?.source_type === 'real_photo' ? `Consent: ${entry.result?.consent_status}` : 'Midjourney render'} · Ready to use
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {!isDone && !isUploading && (
          <>
            <button
              onClick={() => onUpload(entry)}
              disabled={!entry.sourceType}
              style={{
                padding: '8px 18px',
                background: entry.sourceType ? 'var(--tangerine)' : '#ddd',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                fontFamily: 'var(--font-ui)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                cursor: entry.sourceType ? 'pointer' : 'not-allowed',
              }}
            >
              Upload
            </button>
            <button onClick={() => onRemove(entry.id)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </>
        )}
        {isUploading && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--burnham)', letterSpacing: 1 }}>Uploading…</div>}
      </div>
    </div>
  );
}

const navLink = { fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, color: 'var(--celadon)', textTransform: 'uppercase' };
const sectionLabel = { fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#6B6560', marginBottom: 6, display: 'block' };
