"use client";

import type { NextPage } from 'next';
import { useRouter } from 'next/navigation';
import { useEffect, useCallback, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useIsAdmin } from '@/lib/useIsAdmin';
import useEmblaCarousel from 'embla-carousel-react';
import Autoplay from 'embla-carousel-autoplay';
import styles from './index.module.css';
import Image from 'next/image';


// ─── Hero carousel slides ────────────────────────────────────────────────────
// Replace these with your own image URLs.
// They are used as CSS background-image values so any valid URL works:
// local /public images → '/images/slide1.jpg'
// remote URLs         → 'https://...'
const HERO_SLIDES = [
  { url: '/images/slide1.jpg', alt: 'Scenery' },
  { url: '/images/slide2.jpg', alt: 'The Clear Ocean' },
  { url: '/images/slide3.jpg', alt: 'Silent Night' },
  { url: '/images/slide4.png', alt: 'Let\'s Play!' },
];

// ─── Chevron icons (inline — no extra dep) ──────────────────────────────────
const ChevronLeft = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const ChevronRight = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

// ─── Hero Carousel component ─────────────────────────────────────────────────
const HeroCarousel = () => {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [
    Autoplay({ delay: 5000, stopOnInteraction: false }),
  ]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.on('select', onSelect);
    onSelect();
    return () => { emblaApi.off('select', onSelect); };
  }, [emblaApi, onSelect]);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo  = useCallback((i: number) => emblaApi?.scrollTo(i), [emblaApi]);

  return (
    <div className={styles.carouselRoot}>
      {/* Viewport */}
      <div className={styles.carouselViewport} ref={emblaRef}>
        <div className={styles.carouselContainer}>
          {HERO_SLIDES.map((slide, i) => (
            <div
              key={i}
              className={styles.carouselSlide}
              style={{ backgroundImage: `url(${slide.url})` }}
              role="img"
              aria-label={slide.alt}
            />
          ))}
        </div>
      </div>

      {/* Dark overlay so hero text stays readable */}
      <div className={styles.carouselOverlay} aria-hidden="true" />

      {/* Prev / Next buttons */}
      <button
        className={`${styles.carouselBtn} ${styles.carouselBtnPrev}`}
        onClick={scrollPrev}
        aria-label="Previous slide"
      >
        <ChevronLeft />
      </button>
      <button
        className={`${styles.carouselBtn} ${styles.carouselBtnNext}`}
        onClick={scrollNext}
        aria-label="Next slide"
      >
        <ChevronRight />
      </button>

      {/* Dot indicators */}
      <div className={styles.carouselDots} aria-label="Slide indicators">
        {HERO_SLIDES.map((_, i) => (
          <button
            key={i}
            className={`${styles.carouselDot} ${i === selectedIndex ? styles.carouselDotActive : ''}`}
            onClick={() => scrollTo(i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* Snap display  e.g. "2 / 4" */}
      <div className={styles.carouselSnap} aria-live="polite">
        {selectedIndex + 1} / {HERO_SLIDES.length}
      </div>
    </div>
  );
};

// ─── Welcome Page ────────────────────────────────────────────────────────────
const WelcomePage: NextPage = () => {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { isAdmin, checking } = useIsAdmin();

  useEffect(() => {
    if (!loading && !checking && user) {
      if (isAdmin) {
        router.push('/admin');
      } else {
        router.push('/home');
      }
    }
  }, [user, loading, checking, isAdmin, router]);

  if (loading || checking) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingInner}>
          <div className={styles.penLoader}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path
                stroke="#6FA8DC"
                strokeDasharray="60"
                strokeDashoffset="60"
                d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
                className={styles.penPath}
              />
            </svg>
          </div>
          <p className={styles.loadingText}>Opening your nook…</p>
        </div>
      </div>
    );
  }

  if (user) return null;

  return (
    <div className={styles.welcomePage} suppressHydrationWarning>

      {/* ── Header ── */}
<header className={styles.header} suppressHydrationWarning>
  <div className={styles.headerBrand} onClick={() => router.push('/')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px' }}>
    <Image 
      src="/logo.png" 
      alt="NOOK Logo" 
      width={40} 
      height={40} 
      priority 
    />
    <div className={styles.headerTitle} suppressHydrationWarning>NOOK</div>
  </div>
  
  <div className={styles.authButtons} suppressHydrationWarning>
    <button className={styles.loginBtn} onClick={() => router.push('/login')}>
      Log In
    </button>
    <button className={styles.signupBtn} onClick={() => router.push('/register')}>
      Sign Up
    </button>
  </div>
</header>

      <main className={styles.main} suppressHydrationWarning>

        {/* ── Hero — carousel sits behind the text content ── */}
        <section className={styles.hero} suppressHydrationWarning>

          {/* Carousel fills the entire hero section */}
          <HeroCarousel />

          {/* Hero text content — floats above carousel via z-index */}
          <div className={styles.heroContent}>
            <span className={styles.eyebrow}>
              ✦ Your cozy corner of the internet
            </span>

            <h1 className={styles.title} suppressHydrationWarning>
              A Place to Write,{' '}
              <em className={styles.titleItalic}>Wander,</em>
              {' '}&amp; Remember
            </h1>

            <p className={styles.subtitle} suppressHydrationWarning>
              A cozy corner of the internet for your thoughts, journals, and mini blogs.
            </p>

            <button
              className={styles.ctaButton}
              onClick={() => router.push('/register')}
            >
              Get Started for Free
            </button>
          </div>

          {/* Scroll hint */}
          <div className={styles.scrollHint} aria-hidden="true">
            <div className={styles.scrollLine} />
            <span className={styles.scrollLabel}>Scroll</span>
          </div>
        </section>

        {/* ── Features ── */}
        <section className={styles.features} suppressHydrationWarning>
          <span className={styles.featuresLabel}>What&apos;s inside</span>
          <h2 className={styles.featuresTitle}>
            Features to Help You Get Started
          </h2>

          <div className={styles.featuresGrid} suppressHydrationWarning>

            <div className={`${styles.featureCard} ${styles.cardBlue}`} suppressHydrationWarning>
              <div className={styles.iconBlob}>
                <svg className={styles.blobBg} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <ellipse cx="32" cy="32" rx="28" ry="28" />
                </svg>
                <svg className={styles.iconInner} width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className={styles.cardTitle}>Customizable Blogs</h3>
              <p className={styles.cardBody}>Create unique posts with rich text, images, and tags.</p>
              <p className={styles.cardQuote}>&ldquo;Words deserve a beautiful home.&rdquo;</p>
            </div>

            <div className={`${styles.featureCard} ${styles.cardNavy}`} suppressHydrationWarning>
              <div className={styles.iconBlob}>
                <svg className={styles.blobBg} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <ellipse cx="32" cy="32" rx="28" ry="28" />
                </svg>
                <svg className={styles.iconInner} width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className={styles.cardTitle}>Easy to Use</h3>
              <p className={styles.cardBody}>Intuitive interface designed for seamless writing.</p>
              <p className={styles.cardQuote}>&ldquo;No friction, just flow.&rdquo;</p>
            </div>

            <div className={`${styles.featureCard} ${styles.cardOrange}`} suppressHydrationWarning>
              <div className={styles.iconBlob}>
                <svg className={styles.blobBg} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <ellipse cx="32" cy="32" rx="28" ry="28" />
                </svg>
                <svg className={styles.iconInner} width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className={styles.cardTitle}>Join the Community</h3>
              <p className={styles.cardBody}>Connect with other writers and readers.</p>
              <p className={styles.cardQuote}>&ldquo;Every reader is a friend waiting.&rdquo;</p>
            </div>

          </div>
        </section>

        {/* ── Testimonial ── */}
        <section className={styles.testimonial} suppressHydrationWarning>
          <span className={styles.ornament} aria-hidden="true">&ldquo;</span>
          <blockquote className={styles.quote}>
            Nook gave me a place to put all the little thoughts I never knew what to do with.
          </blockquote>
          <cite className={styles.cite}>— a happy writer</cite>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className={styles.footer} suppressHydrationWarning>
        <div className={styles.footerContent} suppressHydrationWarning>

          <div className={styles.footerColumn} suppressHydrationWarning>
            <h4 className={styles.footerBrand}>NOOK</h4>
            <p className={styles.footerTagline}>Your cozy corner of the internet.</p>
            <p className={styles.footerContact}>hello@nook.com</p>
            <p className={styles.footerContact}>+62 123 456 7890</p>
          </div>

          <div className={styles.footerColumn} suppressHydrationWarning>
            <h4>Solution</h4>
            <ul>
              <li><a href="#">Why NOOK</a></li>
              <li><a href="#">Customers</a></li>
              <li><a href="#">Procurement</a></li>
            </ul>
          </div>

          <div className={styles.footerColumn} suppressHydrationWarning>
            <h4>Resources</h4>
            <ul>
              <li><a href="#">Pricing</a></li>
              <li><a href="#">Contact Sales</a></li>
              <li><a href="#">Changelog *</a></li>
              <li><a href="#">Blog</a></li>
            </ul>
          </div>

          <div className={styles.footerColumn} suppressHydrationWarning>
            <h4>Features</h4>
            <ul>
              <li><a href="#">OpenAI</a></li>
              <li><a href="#">Technology</a></li>
              <li><a href="#">Security</a></li>
            </ul>
          </div>

          <div className={styles.footerColumn} suppressHydrationWarning>
            <h4>Enterprise</h4>
            <ul>
              <li><a href="#">Overview</a></li>
              <li><a href="#">Contact</a></li>
            </ul>
          </div>

        </div>

        <div className={styles.footerCopyright} suppressHydrationWarning>
          © Copyright 2024 NOOK. All rights reserved.
        </div>
      </footer>

    </div>
  );
};

export default WelcomePage;