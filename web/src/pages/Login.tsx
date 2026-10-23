import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  FlaskConical,
  Info,
  Loader2,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Button, Input, useToast } from '../components/ui';

interface DemoAccount {
  id: number;
  fullName: string;
  email: string;
  role: string;
  roleLabel: string;
  designation: string | null;
  department: string | null;
}

const ROLE_BADGE: Record<string, string> = {
  ADMINISTRATOR: 'bg-brand-100 text-brand-700',
  RESEARCHER: 'bg-emerald-100 text-emerald-700',
  IPR_OFFICER: 'bg-violet-100 text-violet-700',
  APPROVAL_MEMBER: 'bg-amber-100 text-amber-700',
  INCUBATION_MANAGER: 'bg-sky-100 text-sky-700',
  MENTOR: 'bg-rose-100 text-rose-700',
};

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [demoPassword, setDemoPassword] = useState('demo1234');
  const [demoNotice, setDemoNotice] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ accounts: DemoAccount[]; password: string; notice: string }>('/auth/demo-accounts')
      .then((res) => {
        if (cancelled) return;
        setAccounts(res.accounts ?? []);
        setDemoPassword(res.password ?? 'demo1234');
        setDemoNotice(res.notice ?? '');
      })
      .catch(() => {
        if (!cancelled) setDemoNotice('Demo account list is unavailable.');
      })
      .finally(() => {
        if (!cancelled) setLoadingAccounts(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== '/login' ? from : '/'} replace />;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      toast.success('Signed in', 'Welcome to the Research & Innovation Hub.');
      navigate('/', { replace: true });
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Unable to sign in. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const pickAccount = (acc: DemoAccount) => {
    setEmail(acc.email);
    setPassword(demoPassword);
    setError(null);
  };

  return (
    <div className="flex min-h-screen bg-white">
      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-brand-900 p-12 lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'radial-gradient(60rem 40rem at 10% -10%, rgba(51,102,242,0.55), transparent 60%), radial-gradient(45rem 35rem at 110% 110%, rgba(26,57,180,0.75), transparent 65%)',
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
              <FlaskConical className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Northgate University</p>
              <p className="text-xs text-brand-200">Research &amp; Innovation Hub</p>
            </div>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-white">
            One workspace for research, IPR, approvals and startup incubation.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-brand-100">
            Plan projects, protect intellectual property, route approvals, mentor ventures and track
            funding — with role-based access and a traceable decision history on every record.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { icon: FlaskConical, label: 'Research projects', value: '14 tracked' },
              { icon: ShieldCheck, label: 'IPR records', value: '10 registered' },
              { icon: Sparkles, label: 'Startups incubated', value: '6 active' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-white/10 p-4 ring-1 ring-white/15">
                <item.icon className="h-5 w-5 text-brand-200" />
                <p className="mt-3 text-lg font-bold text-white">{item.value}</p>
                <p className="text-[11px] uppercase tracking-wide text-brand-200">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-brand-200/80">
          Fictional demonstration environment. All institutions, people and records are sample data.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-1/2">
        <div className="mx-auto w-full max-w-md">
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white">
              <FlaskConical className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-ink-900">Research &amp; Innovation Hub</p>
              <p className="text-xs text-ink-500">Northgate University</p>
            </div>
          </div>

          <h2 className="mt-8 text-2xl font-bold tracking-tight text-ink-900 lg:mt-0">
            Sign in to your workspace
          </h2>
          <p className="mt-1.5 text-sm text-ink-500">
            Use a demo account below, or your institutional credentials.
          </p>

          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-800">
              <span className="font-semibold">Demo mode.</span> Accounts are seeded sample records for
              evaluation. This is not production authentication and must not be treated as secure.
            </p>
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              label="Email address"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@northgate.edu"
            />
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <Button type="submit" size="lg" loading={submitting} className="w-full justify-center">
              {submitting ? 'Signing in…' : 'Sign in'}
              {!submitting ? <ArrowRight className="h-4 w-4" /> : null}
            </Button>
          </form>

          <div className="mt-8">
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-ink-200" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                Demo accounts
              </span>
              <span className="h-px flex-1 bg-ink-200" />
            </div>

            <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-500">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-400" />
              {demoNotice ||
                'Select an account to pre-fill the form. Every seeded account uses the same demo password.'}
            </p>

            {loadingAccounts ? (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-3.5 py-3 text-sm text-ink-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading demo accounts…
              </div>
            ) : (
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                {accounts.map((acc) => (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => pickAccount(acc)}
                    className="flex w-full items-center gap-3 rounded-lg border border-ink-200 bg-white px-3 py-2.5 text-left transition hover:border-brand-300 hover:bg-brand-50/40"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
                      <Users className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink-900">
                          {acc.fullName}
                        </span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            ROLE_BADGE[acc.role] ?? 'bg-ink-100 text-ink-600'
                          }`}
                        >
                          {acc.roleLabel}
                        </span>
                      </span>
                      <span className="block truncate text-xs text-ink-500">{acc.email}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {accounts.length > 0 ? (
              <p className="mt-3 text-xs text-ink-500">
                Shared demo password:{' '}
                <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-700">
                  {demoPassword}
                </code>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
