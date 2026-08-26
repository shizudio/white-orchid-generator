'use client';

import { useCallback, useEffect, useState } from 'react';
import { templateById } from '@/lib/templates/index.mjs';
import PostComposer from './PostComposer';
import TemplateGallery from './TemplateGallery';

function templateFromLocation() {
  if (typeof window === 'undefined') return null;
  const id = new URLSearchParams(window.location.search).get('template');
  return templateById(id)?.id || null;
}

function writeTemplateToLocation(templateId, mode = 'push') {
  const url = new URL(window.location.href);
  if (templateId) url.searchParams.set('template', templateId);
  else url.searchParams.delete('template');
  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export default function PostFlow() {
  const [templateId, setTemplateId] = useState(null);
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    setTemplateId(templateFromLocation());
    setLocationReady(true);
    const onPopState = () => setTemplateId(templateFromLocation());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openTemplate = useCallback((id) => {
    const valid = templateById(id)?.id || null;
    if (!valid) return;
    setTemplateId(valid);
    writeTemplateToLocation(valid);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const browseTemplates = useCallback(() => {
    setTemplateId(null);
    writeTemplateToLocation(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const rememberComposerTemplate = useCallback((id) => {
    if (!templateById(id)) return;
    setTemplateId(id);
    writeTemplateToLocation(id, 'replace');
  }, []);

  if (!locationReady) return <div style={{ minHeight: '100dvh', background: 'var(--bg-raised, #fff)' }} />;

  if (!templateId) return <TemplateGallery onChoose={openTemplate} />;

  return (
    <PostComposer
      key={templateId}
      initialTemplateId={templateId}
      onBrowseTemplates={browseTemplates}
      onTemplateChange={rememberComposerTemplate}
    />
  );
}
