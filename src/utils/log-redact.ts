export function maskContact(value: string | null | undefined): string {
  if (!value) return 'unknown';

  const atIndex = value.lastIndexOf('@');
  const raw = atIndex === -1 ? value : value.slice(0, atIndex);
  const suffix = atIndex === -1 ? '' : value.slice(atIndex);

  const tail = raw.replace(/\D/g, '').slice(-4);

  return `${tail ? `***${tail}` : '***'}${suffix}`;
}
