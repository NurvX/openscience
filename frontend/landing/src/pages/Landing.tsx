import { useState } from "react"

const GITHUB = "https://github.com/synthetic-sciences/openscience"
const DOCS = "https://openscience.sh/docs"
const APP = "https://app.syntheticsciences.ai"
const INSTALL = "npm i -g @synsci/openscience"

function Mark({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6.6" stroke="currentColor" />
      <ellipse cx="8" cy="8" rx="6.6" ry="2.6" stroke="currentColor" opacity="0.45" transform="rotate(-24 8 8)" />
      <circle cx="8" cy="8" r="1.35" fill="currentColor" />
      <circle cx="13.35" cy="4.6" r="1.45" fill="hsl(var(--accent-coral))" />
    </svg>
  )
}

function Arrow() {
  return (
    <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden>
      <path d="M0 5h12M8.5 1 13 5l-4.5 4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  )
}

function Button({
  children,
  href,
  secondary = false,
  external = false,
}: {
  children: React.ReactNode
  href: string
  secondary?: boolean
  external?: boolean
}) {
  return (
    <a
      href={href}
      className={`inline-flex min-h-11 items-center justify-center gap-2.5 px-5 text-[14px] ${
        secondary
          ? "border border-foreground/25 text-foreground/90 transition-colors duration-200 hover:border-foreground/55 hover:bg-foreground/[0.04]"
          : "btn-primary"
      }`}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      {children}
      <Arrow />
    </a>
  )
}

function Command() {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(INSTALL).catch(() => {})
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      className="inline-flex min-h-11 max-w-full items-center gap-3 border border-border/80 bg-background/70 px-4 font-terminal text-[13px] text-foreground/80 transition-colors duration-200 hover:border-foreground/40 hover:text-foreground"
      aria-label={`Copy ${INSTALL}`}
    >
      <span className="text-foreground/40">$</span>
      <span className="truncate">{INSTALL}</span>
      <span className="ml-auto text-[11px] text-foreground/45">{copied ? "copied" : "copy"}</span>
    </button>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-4 text-[13px] tracking-[0.06em] text-[hsl(var(--accent-coral))]">{children}</p>
}

type Feature = {
  title: string
  detail?: string
}

function Check({ feature }: { feature: Feature }) {
  return (
    <li className="flex gap-3 text-[14px] leading-6">
      <span className="mt-[9px] h-1.5 w-1.5 shrink-0 bg-[hsl(var(--accent-coral))]" aria-hidden />
      <span className="min-w-0">
        <strong className="font-bold text-foreground/92">{feature.title}</strong>
        {feature.detail ? (
          <span className="block text-[13px] leading-5 text-foreground/52">{feature.detail}</span>
        ) : null}
      </span>
    </li>
  )
}

type PlanProps = {
  name: string
  price: string
  description: string
  features: Feature[]
  href: string
  cadence?: string
  credits?: string
  priceNote?: string
  featured?: boolean
  label?: string
}

function Plan({
  name,
  price,
  cadence,
  credits,
  priceNote,
  description,
  features,
  href,
  featured = false,
  label,
}: PlanProps) {
  return (
    <article
      className={`relative flex h-full flex-col overflow-hidden rounded-lg border p-6 shadow-[0_24px_70px_-48px_hsl(var(--foreground)/0.35)] sm:p-7 ${
        featured
          ? "border-[hsl(var(--accent-coral)/0.72)] bg-[linear-gradient(155deg,hsl(var(--accent-coral)/0.10),hsl(var(--background))_42%)]"
          : "border-border/90 bg-background/55"
      }`}
    >
      {featured ? <span className="absolute inset-x-0 top-0 h-0.5 bg-[hsl(var(--accent-coral))]" aria-hidden /> : null}
      <div className="flex min-h-6 items-start justify-between gap-3">
        <h3 className="text-[25px] font-bold leading-none tracking-[-0.02em]">{name}</h3>
        {label ? (
          <span className="rounded-sm border border-[hsl(var(--accent-coral)/0.55)] bg-[hsl(var(--accent-coral)/0.08)] px-2 py-1 font-terminal text-[9px] font-bold tracking-[0.08em] text-[hsl(var(--accent-coral))]">
            {label}
          </span>
        ) : null}
      </div>
      <div className="mt-7 flex items-end gap-2">
        <p className="font-terminal text-[34px] font-bold leading-none tabular-nums text-foreground">{price}</p>
        {cadence ? <span className="pb-0.5 text-[13px] text-foreground/48">{cadence}</span> : null}
      </div>
      {priceNote ? (
        <p className="mt-2 min-h-5 font-terminal text-[11px] tabular-nums text-foreground/52">{priceNote}</p>
      ) : null}
      <p className="mt-5 min-h-[88px] text-[14px] leading-6 text-foreground/66">{description}</p>
      {credits ? (
        <div className="mt-1 rounded-md border border-border/80 bg-foreground/[0.035] px-4 py-3.5">
          <p className="text-[18px] font-bold leading-5 text-foreground">{credits}</p>
          <p className="mt-1 text-[12px] text-foreground/48">included every month</p>
        </div>
      ) : null}
      <ul className="mt-6 space-y-3 border-t border-border/70 pt-6">
        {features.map((feature, index) => (
          <Check key={index} feature={feature} />
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <Button href={href} secondary={!featured} external={href.startsWith("http")}>
          {name === "Free" ? "Install OpenScience" : name === "Teams" ? "Contact us" : `Start ${name}`}
        </Button>
      </div>
    </article>
  )
}

function Faq({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-border/75 py-5 last:border-b">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-6 text-[17px] text-foreground/90">
        {question}
        <span className="text-foreground/40 transition-transform duration-200 group-open:rotate-45" aria-hidden>
          +
        </span>
      </summary>
      <div className="max-w-[70ch] pb-1 pt-4 text-[14px] leading-7 text-foreground/65">{children}</div>
    </details>
  )
}

export default function Landing({
  analyticsEnabled,
  onAnalyticsToggle,
}: {
  analyticsEnabled: boolean
  onAnalyticsToggle: () => void
}) {
  return (
    <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/88 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center px-5 sm:px-8">
          <a href="#top" className="flex min-h-11 items-center gap-2.5 text-[15px]" aria-label="OpenScience home">
            <Mark />
            <span>OpenScience</span>
          </a>
          <nav
            className="ml-auto hidden items-center gap-7 text-[13px] text-foreground/65 sm:flex"
            aria-label="Primary navigation"
          >
            <a href="#product" className="transition-colors duration-200 hover:text-foreground">
              Product
            </a>
            <a href="#pricing" className="transition-colors duration-200 hover:text-foreground">
              Pricing
            </a>
            <a href={DOCS} className="transition-colors duration-200 hover:text-foreground">
              Docs
            </a>
            <a href={GITHUB} className="transition-colors duration-200 hover:text-foreground">
              GitHub
            </a>
          </nav>
          <a
            href={APP}
            className="ml-5 inline-flex min-h-10 items-center border border-foreground/25 px-4 text-[13px] transition-colors duration-200 hover:border-foreground/55"
          >
            Sign in
          </a>
        </div>
      </header>

      <section id="top" className="relative border-b border-border/70">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_78%_14%,hsl(var(--accent-coral)/0.10),transparent_34%)]" />
        <div className="relative mx-auto max-w-[1180px] px-5 pb-20 pt-20 sm:px-8 sm:pb-24 sm:pt-28">
          <div className="rise max-w-[820px]">
            <Eyebrow>OPEN SOURCE RESEARCH AGENT</Eyebrow>
            <h1 className="text-balance text-[clamp(44px,6vw,76px)] leading-[1.01] tracking-[-0.03em]">
              Do the work. Keep the evidence.
            </h1>
            <p className="mt-7 max-w-[58ch] text-[17px] leading-8 text-foreground/68 sm:text-[18px]">
              OpenScience gives researchers one workspace for agents, code, papers, data, Python, R, and durable
              research graphs. Run it locally with your own providers, or add the managed Gateway when you want hosted
              credits and search.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Command />
              <Button href="#pricing" secondary>
                See plans
              </Button>
            </div>
            <p className="mt-4 text-[12px] leading-5 text-foreground/45">
              macOS, Linux, and Windows. The desktop and local runtime remain free.
            </p>
          </div>
        </div>
      </section>

      <section id="product" className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
        <div className="max-w-[760px]">
          <Eyebrow>ONE WORKSPACE</Eyebrow>
          <h2 className="text-balance text-[clamp(32px,4vw,52px)] leading-[1.05] tracking-[-0.025em]">
            Local by default. Managed when useful.
          </h2>
          <p className="mt-5 max-w-[62ch] text-[16px] leading-8 text-foreground/65">
            Your research does not become dependent on a subscription. Free, BYOK, local-model, and ChatGPT-backed
            workflows keep working without Ace.
          </p>
        </div>
        <div className="mt-12 grid gap-px bg-border/80 md:grid-cols-3">
          {[
            [
              "Work with real tools",
              "Warm Python and R sessions, shell, notebooks, files, literature, and scientific databases in one conversation.",
            ],
            [
              "Build private graphs",
              "Capture claims, runs, evidence, decisions, and code state. Install the Gateway and keep graphs private to owners and explicit collaborators.",
            ],
            [
              "Choose your provider",
              "Use local models, your own API keys, eligible ChatGPT access, or managed Ace credits. Content sharing is a separate opt-in.",
            ],
          ].map(([title, copy], index) => (
            <article key={title} className="min-h-[230px] bg-background p-7">
              <span className="font-terminal text-[11px] text-foreground/35">0{index + 1}</span>
              <h3 className="mt-8 text-[23px] leading-tight">{title}</h3>
              <p className="mt-4 text-[14px] leading-7 text-foreground/62">{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="pricing" className="border-y border-border/70 bg-secondary/20">
        <div className="mx-auto max-w-[1180px] px-5 py-20 sm:px-8 sm:py-28">
          <div className="max-w-[780px]">
            <Eyebrow>PRICING</Eyebrow>
            <h2 className="text-balance text-[clamp(32px,4vw,52px)] leading-[1.05] tracking-[-0.025em]">
              Start free. Add managed capacity when the work gets serious.
            </h2>
            <p className="mt-5 max-w-[66ch] text-[16px] leading-8 text-foreground/65">
              Paid plans bundle managed model credits, research capacity, and Synthetic Scientists access. Auto-reload
              is enabled by default to keep work moving and can be turned off at any time.
            </p>
          </div>
          <div className="mt-12 grid max-w-[1060px] gap-5 lg:grid-cols-2">
            <Plan
              name="Free"
              price="$0"
              priceNote="Free to install and use locally"
              description="The full local research workspace. Bring your own providers and keep complete control of every workflow."
              features={[
                { title: "Desktop app and CLI" },
                { title: "Local models, BYOK, and eligible ChatGPT access" },
                { title: "Python, R, notebooks, files, and core tools" },
                { title: "Private graphs with your own infrastructure" },
              ]}
              href="#install"
            />
            <Plan
              name="Ace"
              price="$20"
              cadence="per month"
              credits="20 credits"
              priceNote="Verified .edu: $10 for the first month"
              description="A simple managed plan for researchers who want less setup and more uninterrupted time on the work."
              features={[
                { title: "Generous research quota" },
                { title: "Synthetic Scientists access" },
                { title: "Auto-reload enabled by default" },
                { title: "Standard support" },
                { title: "Managed web workspace", detail: "Coming soon" },
              ]}
              href={`${APP}/billing?plan=ace`}
              featured
              label="MOST POPULAR"
            />
            <Plan
              name="Ace+"
              price="$100"
              cadence="per month"
              credits="150 credits"
              priceNote="Verified .edu: $50 for the first month"
              description="More managed capacity for researchers and small teams running deeper, sustained investigations."
              features={[
                { title: "3x research quota" },
                { title: "Synthetic Scientists access" },
                { title: "Auto-reload enabled by default" },
                { title: "Priority support and early access" },
                { title: "Collaboration and managed web workspace", detail: "Coming soon" },
              ]}
              href={`${APP}/billing?plan=ace_plus`}
              label="MORE CAPACITY"
            />
            <Plan
              name="Teams"
              price="Custom"
              priceNote="Talk with our team"
              description="Bring OpenScience to a research group with the controls, integrations, and support your environment requires."
              features={[
                { title: "Multi-user accounts and admin controls" },
                { title: "Private data and cluster integrations" },
                { title: "Dedicated engineering support" },
                { title: "SSO, on-prem, ZDR, and compliance options", detail: "Coming soon" },
              ]}
              href="mailto:hello@syntheticsciences.ai?subject=OpenScience%20Teams"
            />
          </div>
          <p className="mt-7 text-[13px] leading-6 text-foreground/50">
            Eligible .edu accounts receive 50% off their first month. Card processing is included in the plan price with
            no additional checkout fee.
          </p>
        </div>
      </section>

      <section
        id="install"
        className="mx-auto grid max-w-[1180px] gap-10 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:items-center"
      >
        <div>
          <Eyebrow>INSTALL</Eyebrow>
          <h2 className="text-[clamp(32px,4vw,50px)] leading-[1.06] tracking-[-0.025em]">
            Your machine. Your providers. Your work.
          </h2>
          <p className="mt-5 text-[16px] leading-8 text-foreground/65">
            Install the CLI, open a project, and start working. Connect the Gateway only if you want synced private
            graphs, managed research, or credits.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href={DOCS}>Read the docs</Button>
            <Button href={GITHUB} secondary external>
              View source
            </Button>
          </div>
        </div>
        <div className="border border-border/85 bg-[#11100f] p-5 font-terminal text-[13px] leading-7 text-foreground/72 sm:p-7">
          <p>
            <span className="text-foreground/35">$</span> {INSTALL}
          </p>
          <p>
            <span className="text-foreground/35">$</span> openscience
          </p>
          <p className="mt-4 text-[hsl(86_30%_60%)]">ready · local workspace · sandboxed tools</p>
        </div>
      </section>

      <section className="border-t border-border/70">
        <div className="mx-auto max-w-[900px] px-5 py-20 sm:px-8 sm:py-28">
          <Eyebrow>QUESTIONS</Eyebrow>
          <h2 className="mb-10 text-[clamp(30px,3.8vw,46px)] leading-tight tracking-[-0.02em]">
            The important details.
          </h2>
          <Faq question="Do I need Ace to use OpenScience?">
            No. OpenScience, the desktop app, local execution, BYOK providers, and eligible ChatGPT-backed use remain
            available without an Ace plan. Ace is the optional managed Gateway plan.
          </Faq>
          <Faq question="What is a credit?">
            Credits power managed model usage through Synthetic Sciences. Your current credit balance and usage are
            always visible in Billing.
          </Faq>
          <Faq question="How does auto reload work?">
            Auto-reload is enabled by default for new Ace subscriptions. The reload amount, threshold, and monthly cap
            are shown before payment, and you can turn it off during checkout or anytime in Billing.
          </Faq>
          <Faq question="What data does OpenScience collect?">
            Content-free product telemetry is on by default and can be disabled in Settings. It records operational
            events and usage totals, not prompts, responses, file contents, notebook cells, or shell output. Research
            content is not collected or shared; there is no content-sharing setting in this release.
          </Faq>
          <Faq question="What happens if managed search is unavailable?">
            Local, BYOK, ChatGPT-backed, and existing open-web workflows keep working. The client explains the
            managed-search outage or exhausted allowance and offers the available fallback instead of breaking the
            research session.
          </Faq>
          <Faq question="Is the managed web workspace available now?">
            Not yet. It is marked coming soon and is not included in the current checkout promise. The desktop app
            remains the primary OpenScience workspace.
          </Faq>
        </div>
      </section>

      <footer className="border-t border-border/70">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-7 px-5 py-10 text-[13px] text-foreground/50 sm:flex-row sm:items-center sm:px-8">
          <div className="flex items-center gap-2.5 text-foreground/75">
            <Mark size={14} /> OpenScience
          </div>
          <nav className="flex flex-wrap gap-x-6 gap-y-3 sm:ml-auto" aria-label="Footer navigation">
            <a href={DOCS} className="hover:text-foreground">
              Docs
            </a>
            <a href={GITHUB} className="hover:text-foreground">
              GitHub
            </a>
            <a href={`${APP}/install`} className="hover:text-foreground">
              Gateway
            </a>
            <a href="mailto:hello@syntheticsciences.ai" className="hover:text-foreground">
              Contact
            </a>
            <button
              type="button"
              className="text-left hover:text-foreground"
              onClick={onAnalyticsToggle}
              aria-pressed={analyticsEnabled}
              title="Website analytics records page activity, never research content"
            >
              Website analytics: {analyticsEnabled ? "on" : "off"}
            </button>
          </nav>
          <span>© {new Date().getFullYear()} Synthetic Sciences</span>
        </div>
      </footer>
    </main>
  )
}
