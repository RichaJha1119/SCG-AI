import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Building2, Check, ChevronDown, ChevronRight, ShoppingCart } from 'lucide-react';
import { LogoFull, LogoMark } from '../components/Logo';

type Mode = 'login' | 'signup';

const FEATURES = [
  {
    title: 'AI-driven Generation',
    description:
      'Create Salesforce-ready components with built-in architecture guidance and faster first drafts for your team.',
    badgeTitle: 'Fast onboarding',
    badgeText: 'From prompt to deployable package in minutes.',
    accent: 'text-[#3b82f6]',
    border: 'border-black/8',
  },
  {
    title: 'Expert-guided Workflow',
    description:
      'Blend generated output with practical deployment steps, dependencies, and governor limit notes in one flow.',
    badgeTitle: 'Production focus',
    badgeText: 'Built for real org constraints and team delivery.',
    accent: 'text-[#7c3aed]',
    border: 'border-black/8',
  },
  {
    title: 'Collaboration Ready',
    description:
      'Save, version, and refine generated assets so developers and admins can iterate together without losing context.',
    badgeTitle: 'Shared library',
    badgeText: 'Reusable outputs for every sprint.',
    accent: 'text-[#8b5cf6]',
    border: 'border-black/8',
  },
];

const CASE_STUDIES = [
  {
    icon: Building2,
    title: 'FinTech Design Overhaul',
    description:
      'A distributed team standardized generation prompts and cut component rework across multiple Salesforce clouds.',
    tags: ['40% faster delivery', 'Consistent handoffs'],
    accent: 'text-[#7c3aed]',
  },
  {
    icon: ShoppingCart,
    title: 'E-commerce Scale-Up',
    description:
      'An integration-heavy org unified trigger/class generation patterns and reduced deployment friction release over release.',
    tags: ['Fewer regressions', 'Stronger deployment quality'],
    accent: 'text-[#3b82f6]',
  },
];

const TESTIMONIALS = [
  {
    name: 'Sarah Chen',
    role: 'Design Systems Lead',
    quote:
      'SCG-AI helped our team validate ideas faster and align design and engineering before implementation started.',
  },
  {
    name: 'Marcus Johnson',
    role: 'Frontend Lead',
    quote:
      'The generated structure and deployment notes saved us repeated back-and-forth during sprint reviews.',
  },
  {
    name: 'Elena Rodriguez',
    role: 'Consultant',
    quote:
      'It is practical, fast, and surprisingly reliable for building reusable assets with real delivery constraints.',
  },
];

const PLANS = [
  {
    name: 'Starter',
    price: 'Free',
    period: '',
    description: 'For individual contributors exploring the workflow.',
    features: ['Prompt-based generation', 'Local component library', 'Basic packaging'],
    cta: 'Get Started',
    highlighted: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    description: 'For teams building and shipping consistently.',
    features: ['Advanced generation context', 'Metadata-aware workflows', 'Priority support'],
    cta: 'Start Trial',
    highlighted: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with governance requirements.',
    features: ['Custom policy controls', 'SSO and org-level support', 'Dedicated success manager'],
    cta: 'Contact Sales',
    highlighted: false,
  },
];

const FAQS = [
  {
    question: 'What exactly is SCG-AI?',
    answer:
      'SCG-AI is an AI-assisted platform for generating Salesforce implementation assets, with deployment-focused outputs and reusable component history.',
  },
  {
    question: 'Can my team use this without deep Salesforce expertise?',
    answer:
      'Yes. The app includes generated summaries, dependency lists, and deployment steps to make output easier to review and execute.',
  },
  {
    question: 'How is authentication handled right now?',
    answer:
      'For the current MVP, user accounts and sessions are stored in a local lowdb database and validated through API auth routes.',
  },
  {
    question: 'What happens after login?',
    answer:
      'Authenticated users are redirected to the requested protected route and can immediately access the generator workspace.',
  },
];

export default function Home() {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const animationHostRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const batchCardRef = useRef<HTMLDivElement | null>(null);
  const batchLineRef = useRef<SVGLineElement | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [showAuthCard, setShowAuthCard] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const openAuthCard = (nextMode: Mode = 'login') => {
    setMode(nextMode);
    setError(null);
    setShowAuthCard(true);
    window.setTimeout(() => {
      document.getElementById('auth-card')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  };

  useEffect(() => {
    const host = animationHostRef.current;
    if (!host) return;

    const cards = Array.from(host.querySelectorAll<HTMLDivElement>('.floating-card'));

    const animate = () => {
      const time = Date.now() * 0.0008;
      cards.forEach((card, i) => {
        const offset = i * 1.1;
        const x = Math.sin(time + offset) * 18;
        const y = Math.cos(time + offset * 1.3) * 12;
        const rX = Math.sin(time + offset) * 6;
        const rY = Math.cos(time + offset * 0.7) * 10;
        card.style.transform = `translate3d(${x}px, ${y}px, 0) rotateX(${rX}deg) rotateY(${rY}deg)`;
      });

      if (host && batchCardRef.current && batchLineRef.current) {
        const hostRect = host.getBoundingClientRect();
        const batchRect = batchCardRef.current.getBoundingClientRect();
        const centerX = ((batchRect.left + batchRect.width / 2 - hostRect.left) / hostRect.width) * 100;
        const centerY = ((batchRect.top + batchRect.height / 2 - hostRect.top) / hostRect.height) * 100;
        batchLineRef.current.setAttribute('x2', `${centerX}%`);
        batchLineRef.current.setAttribute('y2', `${centerY}%`);
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/app';
  const authTitle = useMemo(() => (mode === 'signup' ? 'Create your account' : 'Welcome back'), [mode]);

  if (user) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'signup') {
        await signup(name.trim(), email.trim(), password);
      } else {
        await login(email.trim(), password);
      }
      navigate(from, { replace: true });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Authentication failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f8f8fb] text-[#09090b]">
      <header className="sticky top-0 z-40 border-b border-black/8 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-3">
            <LogoFull size={32} />
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm text-[#717182]">
            <a href="#features" className="hover:text-[#09090b] transition-colors">Features</a>
            <a href="#case-studies" className="hover:text-[#09090b] transition-colors">Case Studies</a>
            <a href="#pricing" className="hover:text-[#09090b] transition-colors">Pricing</a>
            <a href="#faq" className="hover:text-[#09090b] transition-colors">FAQ</a>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openAuthCard('login')}
              className="hidden sm:inline-flex px-3 py-2 rounded-lg text-sm text-[#717182] hover:text-[#09090b] hover:bg-black/5"
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => openAuthCard('signup')}
              className="inline-flex px-4 py-2 rounded-lg text-sm font-semibold bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90"
            >
              Sign up
            </button>
          </div>
        </div>
      </header>

      <section id="home" className="relative overflow-hidden border-b border-black/8 bg-white">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(124,58,237,0.12),transparent_52%)]" />
        <div
          className={`relative mx-auto max-w-6xl px-4 sm:px-6 py-12 md:py-24 grid gap-8 md:gap-10 items-start ${
            showAuthCard ? 'lg:grid-cols-[1.2fr_0.8fr]' : 'grid-cols-1'
          }`}
        >
          <div className={showAuthCard ? '' : 'text-center'}>
            <h1 className="text-3xl sm:text-4xl md:text-6xl font-extrabold leading-tight tracking-tight mb-6">
              <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
                Design System SaaS
              </span>
              <br />
              <span>for Salesforce Teams</span>
            </h1>
            <p className="max-w-4xl mx-auto text-center text-[#717182] text-sm sm:text-base md:text-lg leading-relaxed mb-8">
              Build, refine, and deploy high-quality Salesforce components faster with structured AI output, deployment guidance,
              and a reusable component library.
            </p>

            <div className={`flex flex-wrap gap-3 mb-10 ${showAuthCard ? '' : 'justify-center'}`}>
              <button
                type="button"
                onClick={() => openAuthCard('login')}
                className="px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-violet-500 to-blue-500 hover:opacity-90"
              >
                Get Started
              </button>
              <a href="#demo-video" className="px-6 py-3 rounded-xl font-medium border border-black/15 hover:border-black/30 hover:bg-black/5 text-[#717182] hover:text-[#09090b]">
                See how it works
              </a>
            </div>

            <div
              ref={animationHostRef}
              className={`relative h-[220px] sm:h-[280px] md:h-[320px] max-w-3xl bg-white/50 overflow-hidden rounded-xl ${showAuthCard ? '' : 'mx-auto'}`}
              style={{ perspective: '1000px' }}
            >
              <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.75 }}>
                <defs>
                  <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
                    <stop offset="50%" stopColor="#7c3aed" stopOpacity="1" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.28" />
                  </linearGradient>
                </defs>
                <line x1="50%" y1="50%" x2="16%" y2="22%" stroke="url(#lg1)" strokeWidth="2" />
                <line x1="50%" y1="50%" x2="82%" y2="20%" stroke="url(#lg1)" strokeWidth="2" />
                <line x1="50%" y1="50%" x2="20%" y2="78%" stroke="url(#lg1)" strokeWidth="2" />
                <line x1="50%" y1="50%" x2="80%" y2="75%" stroke="url(#lg1)" strokeWidth="2" />
                <line ref={batchLineRef} x1="50%" y1="50%" x2="50%" y2="16%" stroke="url(#lg1)" strokeWidth="2.2" />
              </svg>

              <div className="absolute inset-0">
                <div className="floating-card absolute left-[6%] top-[12%] w-32 sm:w-44 rounded-2xl border border-black/10 bg-white shadow-lg p-3">
                  <p className="text-[11px] font-semibold text-violet-500 mb-2">Light Weight Component</p>
                  <div className="space-y-1.5">
                    <div className="h-2 rounded bg-violet-200" />
                    <div className="h-2 rounded bg-violet-100 w-4/5" />
                    <div className="h-2 rounded bg-violet-100/80 w-2/3" />
                  </div>
                </div>

                <div className="hidden sm:block floating-card absolute right-[8%] top-[14%] w-44 rounded-2xl border border-black/10 bg-white shadow-lg p-3">
                  <p className="text-[11px] font-semibold text-blue-500 mb-2">Apex</p>
                  <div className="h-4 rounded-md bg-blue-200 mb-2" />
                  <div className="h-3 rounded bg-blue-100 w-4/5" />
                </div>

                <div ref={batchCardRef} className="floating-card absolute left-1/2 top-[6%] -translate-x-1/2 w-32 sm:w-44 rounded-2xl border border-black/10 bg-white shadow-lg p-3">
                  <p className="text-[11px] font-semibold text-violet-500 mb-2">Batch Apex</p>
                  <div className="space-y-1.5">
                    <div className="h-2 rounded bg-emerald-200" />
                    <div className="h-2 rounded bg-emerald-100 w-5/6" />
                  </div>
                </div>

                <div className="floating-card absolute left-[12%] bottom-[12%] w-32 sm:w-44 rounded-2xl border border-black/10 bg-white shadow-lg p-3">
                  <p className="text-[11px] font-semibold text-violet-500 mb-2">REST API</p>
                  <div className="h-2 rounded bg-rose-400 mb-1.5" />
                  <div className="h-2 rounded bg-rose-300 w-4/5 mb-1.5" />
                  <div className="h-2 rounded bg-rose-200 w-2/3" />
                </div>

                <div className="hidden sm:block floating-card absolute right-[8%] bottom-[16%] w-44 rounded-2xl border border-black/10 bg-white shadow-lg p-3">
                  <p className="text-[11px] font-semibold text-blue-500 mb-2">Integration Service</p>
                  <div className="grid grid-cols-6 gap-1">
                    {Array.from({ length: 12 }).map((_, index) => (
                      <span
                        key={index}
                        className={`h-4 rounded ${
                          index % 4 === 0
                            ? 'bg-cyan-200'
                            : index % 4 === 1
                            ? 'bg-indigo-200'
                            : index % 4 === 2
                            ? 'bg-sky-200'
                            : 'bg-blue-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
                <LogoMark size={46} />
              </div>

              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 16 }).map((_, i) => (
                  <span
                    key={i}
                    className="absolute w-1 h-1 rounded-full bg-violet-400/60"
                    style={{
                      left: `${(i * 17 + 7) % 95}%`,
                      top: `${(i * 23 + 11) % 90}%`,
                      animation: `scgPulse ${2 + (i % 3)}s ease-in-out infinite`,
                      animationDelay: `${(i * 0.4) % 3}s`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {showAuthCard && (
            <div id="auth-card" className="rounded-2xl border border-black/10 bg-white p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                <div>
                  <h2 className="text-2xl font-semibold text-[#09090b]">{authTitle}</h2>
                  <p className="text-[#717182] text-sm mt-1">
                    {mode === 'signup' ? 'Create your account to continue.' : 'Sign in to access your workspace.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowAuthCard(false);
                    setError(null);
                  }}
                  className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 text-white shadow-md shadow-violet-300/50 hover:opacity-90 transition-opacity self-start"
                  aria-label="Close auth panel"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-5 bg-[#f9f9fb] p-1 rounded-lg border border-black/8">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                  }}
                  className={`rounded-md py-2 text-sm font-medium transition ${
                    mode === 'login' ? 'bg-blue-600 text-white' : 'text-[#717182] hover:bg-black/5'
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('signup');
                    setError(null);
                  }}
                  className={`rounded-md py-2 text-sm font-medium transition ${
                    mode === 'signup' ? 'bg-blue-600 text-white' : 'text-[#717182] hover:bg-black/5'
                  }`}
                >
                  Signup
                </button>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm text-[#3f3f46] mb-1" htmlFor="name">
                      Name
                    </label>
                    <input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                      placeholder="Your name"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm text-[#3f3f46] mb-1" htmlFor="email">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm text-[#3f3f46] mb-1" htmlFor="password">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500"
                    placeholder="••••••••"
                  />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-70 text-white py-2.5 text-sm font-medium"
                >
                  {submitting ? 'Please wait...' : mode === 'signup' ? 'Create account' : 'Login'}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>

      <section id="features" className="py-16 md:py-20 px-4 sm:px-6 border-b border-black/8 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-violet-400 via-blue-400 to-violet-400 bg-clip-text text-transparent">
              The Design System of Tomorrow
            </h3>
            <p className="text-[#717182] mt-3">AI speed plus practical delivery workflows for real product teams.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => (
              <article key={feature.title} className={`rounded-2xl border bg-white p-6 ${feature.border}`}>
                <h4 className={`text-lg font-semibold mb-3 ${feature.accent}`}>{feature.title}</h4>
                <p className="text-[#717182] text-sm leading-relaxed mb-5">{feature.description}</p>
                <div className="rounded-xl border border-black/8 bg-[#f9f9fb] p-4">
                  <p className="text-sm font-semibold text-[#09090b] mb-1">{feature.badgeTitle}</p>
                  <p className="text-xs text-[#717182]">{feature.badgeText}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="demo-video" className="py-16 md:py-20 px-4 sm:px-6 border-b border-black/8 bg-[#f9f9fb]">
        <div className="mx-auto max-w-5xl">
          <div className="text-center mb-10">
            <h3 className="text-3xl md:text-4xl font-extrabold">See how it works</h3>
            <p className="text-[#717182] mt-3">Watch a quick product walkthrough demo.</p>
          </div>

          <div className="rounded-2xl border border-black/10 bg-white p-3 md:p-4 shadow-lg">
            <video
              className="w-full rounded-xl border border-black/8 bg-black/5"
              controls
              preload="metadata"
            >
              <source src="/demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </section>

      <section id="case-studies" className="py-16 md:py-20 px-4 sm:px-6 bg-[#f9f9fb] border-b border-black/8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-extrabold">Real Results, Real Impact</h3>
            <p className="text-[#717182] mt-3">How teams use SCG-AI to speed up quality delivery.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {CASE_STUDIES.map((item) => (
              <article key={item.title} className="rounded-2xl border border-black/8 bg-white p-7">
                <div className="flex items-start gap-4">
                  <div className="h-11 w-11 rounded-xl bg-[#f9f9fb] border border-black/8 grid place-items-center">
                    <item.icon className={item.accent} size={20} />
                  </div>
                  <div>
                    <h4 className="text-xl font-semibold mb-2">{item.title}</h4>
                    <p className="text-sm text-[#717182] leading-relaxed">{item.description}</p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {item.tags.map((tag) => (
                    <span key={tag} className="text-xs rounded-full border border-black/10 bg-[#f9f9fb] px-3 py-1.5 text-[#717182]">
                      {tag}
                    </span>
                  ))}
                </div>
                <button type="button" className={`mt-4 inline-flex items-center gap-1 text-sm font-semibold ${item.accent}`}>
                  Read case study <ChevronRight size={15} />
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="testimonials" className="py-16 md:py-20 px-4 sm:px-6 border-b border-black/8 bg-white">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-10">
            <h3 className="text-3xl md:text-4xl font-extrabold">Loved by Product Teams</h3>
            <p className="text-[#717182] mt-3">Feedback from teams using SCG-AI in real delivery workflows.</p>
          </div>
          <div className="grid gap-5 md:grid-cols-3">
            {TESTIMONIALS.map((item) => (
              <article key={item.name} className="rounded-2xl border border-black/8 bg-white p-6">
                <div className="text-violet-500 text-sm mb-2">★★★★★</div>
                <p className="text-[#52525b] text-sm leading-relaxed italic">“{item.quote}”</p>
                <div className="mt-5">
                  <p className="font-semibold">{item.name}</p>
                  <p className="text-xs text-[#717182]">{item.role}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-16 md:py-20 px-4 sm:px-6 bg-[#f9f9fb] border-b border-black/8">
        <div className="mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h3 className="text-3xl md:text-4xl font-extrabold">Simple, Transparent Pricing</h3>
            <p className="text-[#717182] mt-3">Start free, then scale as your team grows.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.name}
                className={`rounded-2xl border p-6 flex flex-col ${
                  plan.highlighted
                    ? 'relative border-violet-400/60 bg-white shadow-xl shadow-violet-300/40 ring-2 ring-violet-200/50 scale-[1.02]'
                    : 'border-black/8 bg-white'
                }`}
              >
                {plan.highlighted && (
                  <span className="absolute -top-3 right-4 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 px-3 py-1 text-[10px] font-semibold tracking-wide text-white shadow-sm">
                    Most Popular
                  </span>
                )}
                <h4 className="text-lg font-semibold">{plan.name}</h4>
                <p className="text-xs text-[#717182] mt-1">{plan.description}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-3xl font-extrabold">{plan.price}</span>
                  {plan.period && <span className="text-[#717182]">{plan.period}</span>}
                </div>
                <ul className="mt-6 space-y-3 flex-1">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-[#52525b]">
                      <span className="mt-0.5 h-4 w-4 rounded-full bg-blue-100 grid place-items-center">
                        <Check size={11} className="text-blue-600" />
                      </span>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`mt-6 rounded-xl py-2.5 text-sm font-semibold ${
                    plan.highlighted
                      ? 'bg-gradient-to-r from-violet-500 to-blue-500 text-white hover:opacity-90'
                      : 'border border-black/15 text-[#09090b] hover:border-black/30 bg-white'
                  }`}
                >
                  {plan.cta}
                </button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="faq" className="py-16 md:py-20 px-4 sm:px-6 bg-white">
        <div className="mx-auto max-w-3xl">
          <div className="text-center mb-10">
            <h3 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
              Frequently Asked Questions
            </h3>
          </div>
          <div className="space-y-3">
            {FAQS.map((item, index) => {
              const isOpen = openFaqIndex === index;
              return (
                <div key={item.question} className="rounded-xl border border-black/10 bg-white overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaqIndex(isOpen ? null : index)}
                    className="w-full flex items-center justify-between p-5 text-left"
                  >
                    <span className="font-medium">{item.question}</span>
                    <ChevronDown
                      size={18}
                      className={`transition-transform ${isOpen ? 'rotate-180 text-violet-500' : 'text-[#717182]'}`}
                    />
                  </button>
                  {isOpen && <p className="px-5 pb-5 text-sm text-[#52525b] leading-relaxed">{item.answer}</p>}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="border-t border-black/8 bg-white px-4 sm:px-6 py-12 md:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-10 mb-12">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3">
                <LogoFull size={32} />
              </div>

              <p className="text-[#717182] text-lg sm:text-2xl md:text-[28px] mt-4 mb-6 max-w-md leading-relaxed">
                The complete AI-powered platform for building, maintaining, and scaling design systems that help teams ship consistent experiences faster.
              </p>

              <div className="flex gap-3">
                {['x', 'in', '⌂'].map((icon) => (
                  <a
                    key={icon}
                    href="#"
                    className="w-9 h-9 bg-[#f9f9fb] border border-black/8 rounded-lg flex items-center justify-center text-[#717182] hover:text-[#7c3aed] hover:border-violet-300/50 transition-colors text-sm"
                  >
                    {icon}
                  </a>
                ))}
              </div>
            </div>

            {[
              { title: 'Product', links: ['Features', 'Pricing', 'Changelog', 'Roadmap', 'Status'] },
              { title: 'Resources', links: ['Documentation', 'Guides', 'Templates', 'Blog', 'Community'] },
              { title: 'Company', links: ['About', 'Careers', 'Contact', 'Privacy', 'Terms'] },
            ].map((group) => (
              <div key={group.title}>
                <h5 className="text-[#09090b] text-sm mb-4 font-semibold">{group.title}</h5>
                <ul className="space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link}>
                      <a href="#" className="text-[#717182] text-sm hover:text-[#09090b] transition-colors">
                        {link}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-black/8 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-[#c4c4cc] text-xs">© 2026 SCG-AI. All rights reserved.</p>
            <div className="flex gap-6">
              {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((link) => (
                <a key={link} href="#" className="text-[#c4c4cc] text-xs hover:text-[#717182] transition-colors">
                  {link}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
