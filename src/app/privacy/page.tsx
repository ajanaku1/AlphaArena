export default function PrivacyPage() {
  return (
      <div className="container max-w-3xl py-16">
        <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-muted-foreground">
          <p>Last updated: February 2025</p>

          <h2 className="text-lg font-semibold text-foreground">1. Information We Collect</h2>
          <p>
            When you connect your wallet, we collect your wallet address and any profile information
            you choose to provide (display name, email). We also collect usage data such as trading
            simulation activity and competition participation.
          </p>

          <h2 className="text-lg font-semibold text-foreground">2. How We Use Information</h2>
          <p>
            We use collected information to provide platform features including copy-trading simulation,
            competition leaderboards, referral tracking, and personalized portfolio views.
          </p>

          <h2 className="text-lg font-semibold text-foreground">3. Data from Pacifica</h2>
          <p>
            Trader performance data is sourced from the Pacifica decentralized exchange API.
            This data is publicly available on-chain. We aggregate and display it for user convenience.
          </p>

          <h2 className="text-lg font-semibold text-foreground">4. Data Security</h2>
          <p>
            We implement reasonable security measures to protect your information. However, no method
            of electronic storage is 100% secure.
          </p>

          <h2 className="text-lg font-semibold text-foreground">5. Third-Party Services</h2>
          <p>
            We use Privy for wallet authentication and Supabase for data storage. These services
            have their own privacy policies that govern their use of your data.
          </p>

          <h2 className="text-lg font-semibold text-foreground">6. Contact</h2>
          <p>
            For privacy-related inquiries, reach out via our community channels.
          </p>
        </div>
      </div>
  );
}
