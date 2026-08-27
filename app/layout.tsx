import type { Metadata } from 'next'
import Footer from '@/app/components/Footer'
import './globals.css'

export const metadata: Metadata = {
  title: 'MU Sites | Pantheon',
  description: 'Per-site staging & deployment timeline across the MU managed-update pipeline',
}

// No auth in the local-first milestone — the top bar the sibling apps host UserMenu
// in is intentionally omitted here until mu-sites earns its own service + auth.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
        <Footer />
      </body>
    </html>
  )
}
