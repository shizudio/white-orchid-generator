'use client';
import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';

// (Media organization — client ruling 2026-07-29) Everything brought in through
// this page is source_type 'uploaded' ("its either generated or uploaded" —
// 'generated' is reserved for the studio's own AI pipeline).
// (Consent removed — client ruling 2026-08-03: "remove the consent category")
// The real-people question and per-file consent selector are gone: files upload
// straight in with no gating. The DB's consent_status column stays dormant at
// its default; the API no longer reads it.
export default function UploadPage() {
  const [files, setFiles] = useState([]); // [{file, preview, status, error, result}]
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const addFiles = useCallback((newFiles) => {
    const entries = Array.from(newFiles).map(file => ({
      id: Math.random().toString(36).slice(2),
      file,
      preview: URL.createObjectURL(file),
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
    update(entry.id, { status: 'uploading', error: null });

    const fd = new FormData();
    fd.append('file', entry.file);
    fd.append('source_type', 'uploaded');   // taxonomy 2026-07-29: a person brought it in

    const res = await fetch('/api/images', { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) {
      update(entry.id, { status: 'error', error: data.error || 'Upload failed' });
    } else {
      update(entry.id, { status: 'done', result: data });
    }
  };

  const uploadAll = () => {
    files.filter(f => f.status === 'pending' || f.status === 'error').forEach(uploadOne);
  };

  const anyPending = files.some(f => f.status === 'pending' || f.status === 'error');

  return (
    <div style={{ minHeight: '100vh', background: 'var(--fg-on-deep)' }}>
      <Nav section="upload" />

      <div style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 'clamp(1.8rem, 3vw, 2.5rem)', fontWeight: 400, color: 'var(--fg-strong)', letterSpacing: '-0.01em', marginBottom: 6 }}>Upload Images</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: '#6B6560', marginBottom: 32, lineHeight: 1.6 }}>
          Everything you add lands in your library, ready to use in designs.
        </p>

        {/* Drop zone */}
        <div
          className="upload-dropzone"
          role="button"
          tabIndex={0}
          aria-label="Choose images to upload"
          onDrop={onDrop}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onClick={() => inputRef.current?.click()}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          style={{
            border: `2px dashed ${dragging ? 'var(--tw-burnham)' : 'rgba(43,80,64,0.25)'}`,
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
          <div style={{ fontFamily: 'var(--font-ui)', fontWeight: 700, fontSize: 15, color: 'var(--tw-burnham)', marginBottom: 6 }}>
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
                <FileCard key={entry.id} entry={entry} onRemove={remove} onUpload={uploadOne} />
              ))}
            </div>

            {anyPending && (
              <button
                onClick={uploadAll}
                style={{
                  padding: '14px 40px',
                  background: 'var(--tw-burnham)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 40,
                  fontFamily: 'var(--font-ui)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Upload All
              </button>
            )}

            {files.every(f => f.status === 'done') && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ fontSize: 20 }}>✅</div>
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--tw-burnham)' }}>
                  All uploaded successfully
                </span>
                <Link href="/library" style={{ marginLeft: 8, padding: '10px 24px', background: 'var(--tw-tangerine)', color: '#fff', borderRadius: 40, fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }}>
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

function FileCard({ entry, onRemove, onUpload }) {
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
      alignItems: 'center',
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

      {/* Name + state */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--tw-jet)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {entry.file.name}
        </div>
        {isError && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#CC3333' }}>
            {entry.error}
          </div>
        )}
        {isDone && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--tw-burnham)' }}>
            Uploaded · Ready to use
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
        {!isDone && !isUploading && (
          <>
            <button
              onClick={() => onUpload(entry)}
              style={{
                padding: '8px 18px',
                background: 'var(--tw-tangerine)',
                color: '#fff',
                border: 'none',
                borderRadius: 20,
                fontFamily: 'var(--font-ui)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {isError ? 'Retry' : 'Upload'}
            </button>
            <button onClick={() => onRemove(entry.id)} style={{ background: 'none', border: 'none', color: '#aaa', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button>
          </>
        )}
        {isUploading && <div style={{ fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--tw-burnham)', letterSpacing: 1 }}>Uploading…</div>}
      </div>
    </div>
  );
}

const navLink = { fontFamily: 'var(--font-ui)', fontSize: 11, letterSpacing: 2, color: 'var(--tw-celadon)', textTransform: 'uppercase' };
