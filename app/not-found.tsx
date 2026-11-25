import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-slate-100 p-4">
      <h2 className="text-2xl font-bold mb-2">404 - Page Not Found</h2>
      <p className="text-slate-400 mb-4">The requested page could not be found.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm transition-colors"
      >
        Return to Traffic Control Dashboard
      </Link>
    </div>
  );
}
