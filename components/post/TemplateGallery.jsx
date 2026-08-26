'use client';

import { useMemo, useState } from 'react';
import { TEMPLATES } from '@/lib/templates/index.mjs';
import styles from './PostFlow.module.css';

const FILTERS = Object.freeze([
  { id: 'all', label: 'All templates' },
  { id: 'single', label: 'Single post' },
  { id: 'carousel', label: 'Carousel' },
]);

const FUTURE_TEMPLATES = Object.freeze([
  {
    key: 'instagram-carousel',
    name: 'Instagram Carousel',
    purpose: 'A connected multi-slide story for explainers, programmes and step-by-step posts.',
    category: 'carousel',
    badge: 'Coming soon',
  },
  {
    key: 'event-story',
    name: 'Event Story',
    purpose: 'A story-first event announcement with room for dates, timings and a clear next step.',
    category: 'single',
    badge: 'Planned',
  },
]);

function CarouselArtwork() {
  return (
    <div className={styles.carouselArtwork} aria-hidden="true">
      <div className={`${styles.carouselSlide} ${styles.carouselSlideBack}`} />
      <div className={`${styles.carouselSlide} ${styles.carouselSlideMiddle}`} />
      <div className={`${styles.carouselSlide} ${styles.carouselSlideFront}`}>
        <span>01</span>
        <strong>A story,<br />slide by slide</strong>
        <i />
      </div>
    </div>
  );
}

export default function TemplateGallery({ onChoose }) {
  const [filter, setFilter] = useState('all');
  const existing = filter === 'carousel' ? [] : TEMPLATES;
  const future = useMemo(
    () => FUTURE_TEMPLATES.filter((template) => filter === 'all' || template.category === filter),
    [filter],
  );

  return (
    <main className={styles.galleryPage}>
      <header className={styles.galleryHeader}>
        <a href="/" className={styles.wordmark} aria-label="The White Orchid home">
          <img src="/assets/logos/primary/primary-2-green.svg" alt="The White Orchid" />
        </a>
        <div className={styles.headerCopy}>
          <p className={styles.kicker}>Make a post</p>
          <h1>Start with the right structure.</h1>
          <p>Choose a brand-approved template. Add your words and photo next—we keep the layout, type and mark working together.</p>
        </div>
      </header>

      <nav className={styles.filters} aria-label="Filter templates">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={filter === item.id ? styles.filterActive : ''}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className={styles.gallerySection} aria-labelledby="available-heading">
        <div className={styles.sectionHeading}>
          <h2 id="available-heading">Ready to use</h2>
          <span>{existing.length} {existing.length === 1 ? 'template' : 'templates'}</span>
        </div>

        {existing.length > 0 ? (
          <div className={styles.templateGrid}>
            {existing.map((template) => (
              <button
                key={template.id}
                type="button"
                className={styles.templateCard}
                onClick={() => onChoose(template.id)}
                aria-label={`Use ${template.name} template`}
              >
                <img className={styles.templateImage} src={template.galleryPreview.src} alt={template.galleryPreview.alt} />
                <span className={styles.templateOverlay} aria-hidden="true">
                  <strong>{template.name}</strong>
                  <span>Use template</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className={styles.emptyReady}>
            <span>Multi-slide templates are being built.</span>
            <button type="button" onClick={() => setFilter('all')}>See ready templates</button>
          </div>
        )}
      </section>

      {future.length > 0 && (
        <section className={styles.gallerySection} aria-labelledby="future-heading">
          <div className={styles.sectionHeading}>
            <h2 id="future-heading">Coming next</h2>
            <span>Preview the roadmap</span>
          </div>
          <div className={styles.futureGrid}>
            {future.map((template) => (
              <article key={template.key} className={styles.futureCard}>
                <div className={styles.futurePreview}>
                  {template.category === 'carousel' ? <CarouselArtwork /> : <div className={styles.eventArtwork}><i /><strong>OPEN<br />HOUSE</strong><span>12 SEPTEMBER</span></div>}
                </div>
                <div className={styles.futureCopy}>
                  <span className={styles.futureBadge}>{template.badge}</span>
                  <h3>{template.name}</h3>
                  <p>{template.purpose}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
