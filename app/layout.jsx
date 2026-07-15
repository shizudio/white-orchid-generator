import './globals.css';
import BrandProvider from '@/components/BrandProvider';

export const metadata = {
  title: 'The White Orchid — Content Studio',
  description: 'Brand content generator for The White Orchid Preschool',
};

// (Mobile audit 2026-07-15 #4) Next 14 App-Router viewport export. Without it Next
// ships only `width=device-width, initial-scale=1`, so `viewport-fit` is unset and
// every `env(safe-area-inset-*)` rule in globals.css resolves to 0 on notched iOS.
// `viewportFit:'cover'` lets the page paint under the notch/home-indicator and makes
// those insets report real values, which the export sheet, top-menu sheet, inspector
// sheet, and chat launcher padding all consume. width/initialScale keep the sane
// default; maximumScale/userScalable are intentionally NOT pinned (never trap zoom).
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <BrandProvider>{children}</BrandProvider>
      </body>
    </html>
  );
}
