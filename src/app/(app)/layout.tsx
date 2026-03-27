import { AppShell } from "@/components/app-shell"
import { MobileGate } from "@/components/mobile-gate"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileGate>
      <AppShell>{children}</AppShell>
    </MobileGate>
  )
}
