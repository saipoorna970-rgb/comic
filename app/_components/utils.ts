export const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  const rounded = value >= 10 || i === 0 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${sizes[i]}`;
};
