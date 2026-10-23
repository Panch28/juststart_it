import { Link } from 'react-router-dom';
import { ArrowLeft, Lock, SearchX } from 'lucide-react';

/**
 * Shared "nothing here" screen.
 *
 * It doubles as the access-denied screen: `App.tsx` renders `<NotFound restricted />`
 * when the signed-in role does not include the module that was requested.
 */
export default function NotFound({ restricted = false }: { restricted?: boolean }) {
  const Icon = restricted ? Lock : SearchX;

  return (
    <div className="flex min-h-[60vh] items-center justify-center py-10">
      <div className="card w-full max-w-lg px-6 py-10 text-center sm:px-10">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <Icon className="h-7 w-7" aria-hidden />
        </div>

        {restricted ? (
          <>
            <p className="mt-5 text-3xl font-bold tracking-tight text-ink-900">Restricted</p>
            <h1 className="mt-2 text-base font-semibold text-ink-800">
              You do not have access to this module
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
              The role assigned to your account does not include this part of the Research,
              Innovation, IPR &amp; Startup Management System. Ask an administrator if you believe
              this is an error.
            </p>
          </>
        ) : (
          <>
            <p className="mt-5 text-3xl font-bold tracking-tight text-ink-900">404</p>
            <h1 className="mt-2 text-base font-semibold text-ink-800">Page not found</h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-500">
              The page you are looking for does not exist, has been moved, or the address was typed
              incorrectly.
            </p>
          </>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Link
            to="/"
            className="inline-flex h-9.5 items-center gap-2 rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back to dashboard
          </Link>
          <Link
            to="/notifications"
            className="inline-flex h-9.5 items-center gap-2 rounded-lg border border-ink-300 bg-white px-3.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-50 hover:border-ink-400"
          >
            Go to notifications
          </Link>
        </div>
      </div>
    </div>
  );
}
