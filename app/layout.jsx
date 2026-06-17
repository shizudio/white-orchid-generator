import './globals.css';

export const metadata = {
  title: 'The White Orchid — Content Studio',
  description: 'Brand content generator for The White Orchid Preschool',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
