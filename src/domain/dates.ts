export function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Gebruik een geldige datum (JJJJ-MM-DD).');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error('Deze datum bestaat niet.');
  }
}

export function quarterForDate(date: string): string {
  validateDate(date);
  return `${date.slice(0, 4)}-Q${Math.ceil(Number(date.slice(5, 7)) / 3)}`;
}

export function dueDate(invoiceDate: string, days: number): string {
  validateDate(invoiceDate);
  if (!Number.isInteger(days) || days < 0 || days > 365) throw new Error('Ongeldige betalingstermijn.');
  const date = new Date(`${invoiceDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
