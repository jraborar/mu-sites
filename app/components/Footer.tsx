// Shared MU footer. Mirrors the other apps.

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-700/60">
      <div className="mx-auto max-w-5xl space-y-1 px-6 py-5">
        <p className="font-mono text-xs text-white">
          Powered by <span className="text-pantheon-yellow">Next.js 16</span>
          {' · '}<span className="text-pantheon-yellow">Supabase</span>
          {' · '}<span className="text-pantheon-yellow">Tailwind v4</span>
          {' · '}<span className="text-pantheon-yellow">Pantheon Platform</span>
        </p>
        <p className="font-mono text-xs text-white">
          Created by and for <span className="text-pantheon-yellow">PS MU Team</span>
          {' · '}© 2026
        </p>
      </div>
    </footer>
  )
}
