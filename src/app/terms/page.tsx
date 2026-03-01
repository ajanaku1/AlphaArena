export default function TermsPage() {
  return (
      <div className="container max-w-3xl py-16">
        <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <p>Last updated: February 2025</p>

          <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p>
            By accessing and using AlphaArena, you accept and agree to be bound by these Terms of Service.
            AlphaArena is a gamified copy-trading simulation platform built on the Pacifica ecosystem.
          </p>

          <h2 className="text-lg font-semibold text-foreground">2. Platform Description</h2>
          <p>
            AlphaArena provides a simulated copy-trading environment where users can browse trader performance data,
            participate in competitions, and track portfolio performance. The platform integrates with the Pacifica
            decentralized exchange for trader data.
          </p>

          <h2 className="text-lg font-semibold text-foreground">3. Risk Disclaimer</h2>
          <p>
            Trading cryptocurrency derivatives involves substantial risk of loss. Past performance of any trader
            does not guarantee future results. Users should not invest more than they can afford to lose.
            AlphaArena is a simulation platform and does not provide financial advice.
          </p>

          <h2 className="text-lg font-semibold text-foreground">4. User Accounts</h2>
          <p>
            Users may connect their wallet to access personalized features. You are responsible for
            maintaining the security of your wallet and account credentials.
          </p>

          <h2 className="text-lg font-semibold text-foreground">5. Competitions</h2>
          <p>
            Trading Royale competitions are subject to the rules posted for each event. Prize distribution
            is at the sole discretion of the AlphaArena team. Competition results are determined by simulated
            copy-trading performance.
          </p>

          <h2 className="text-lg font-semibold text-foreground">6. Contact</h2>
          <p>
            For questions about these terms, reach out via our community channels.
          </p>
        </div>
      </div>
  );
}
