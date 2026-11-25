import type {Metadata} from 'next';
import './globals.css'; // Global styles

export const metadata: Metadata = {
  title: 'Smart City Traffic Management & Signal Optimization',
  description: 'Intelligent 3D Smart City Traffic Management and Signal Optimization System using Greedy Algorithm and Dynamic Programming.',
  openGraph: {
    title: 'Smart City Traffic Management & Signal Optimization',
    description: 'Intelligent 3D Smart City Traffic Management and Signal Optimization System using Greedy Algorithm and Dynamic Programming.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Smart City Traffic Management & Signal Optimization',
    description: 'Intelligent 3D Smart City Traffic Management and Signal Optimization System using Greedy Algorithm and Dynamic Programming.',
  },
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
