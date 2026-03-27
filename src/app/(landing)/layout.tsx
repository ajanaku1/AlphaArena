import { MobileGate } from "@/components/mobile-gate"

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileGate>
      {children}
    </MobileGate>
  )
}
