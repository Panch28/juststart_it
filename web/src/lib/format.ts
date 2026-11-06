export function formatCurrency(value: number | null | undefined, compact = false): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '₹???';
  if (compact && Math.abs(value) >= 1_000_000) {
    if (Math.abs(value) >= 10_000_000) {
      const crores = value / 10_000_000;
      return `₹${crores.toFixed(crores % 1 === 0 ? 0 : 2)}Cr`;
    }
    return `₹${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 2)}M`;
  }
  if (compact && Math.abs(value) >= 1_000) {
    if (Math.abs(value) >= 100_000) {
      const lakhs = value / 100_000;
      return `₹${lakhs.toFixed(lakhs % 1 === 0 ? 0 : 2)}L`;
    }
    return `₹${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '???';
  return new Intl.NumberFormat('en-IN').format(value);
}

export function formatDate(value?: string | null): string {
  if (!value) return '???';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '???';
  const d = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function relativeTime(value?: string | null): string {
  if (!value) return '???';
  const d = new Date(value.replace(' ', 'T')).getTime();
  if (Number.isNaN(d)) return value;
  const diff = Date.now() - d;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export function truncate(value?: string | null, length = 60): string {
  if (!value) return '';
  if (value.length <= length) return value;
  return `${value.slice(0, length).trim()}...`;
}

export function daysRemainingLabel(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(days)) return 'No deadline';
  if (days < 0) return `${Math.abs(days)} day(s) overdue`;
  if (days === 0) return 'Due today';
  return `${days} day(s) remaining`;
}

