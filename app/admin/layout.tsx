/**
 * app/admin/layout.tsx
 *
 * Administrative layout — wraps all /admin/* pages in AdminShell.
 * Uses fixed inset-0 z-[9999] to overlay the root layout (Navbar + Footer).
 *
 * Server Component — reads health snapshot synchronously for SSR hydration.
 */

import { runHealthCheck }      from '@/lib/ops'
import { buildOpsSnapshot }    from '@/lib/ops/workspace/realtime-engine'
import { AdminShell }          from '@/components/admin/AdminShell'

interface Props {
  children: React.ReactNode
}

export default function AdminLayout({ children }: Props) {
  // Fast synchronous reads — disk only, no network calls (<5ms each)
  const health   = runHealthCheck()
  const snapshot = buildOpsSnapshot()

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden">
      <AdminShell
        systemOk={health.status === 'ok'}
        healthScore={snapshot.healthScore}
        initialEvents={snapshot.recentEvents}
      >
        {children}
      </AdminShell>
    </div>
  )
}
