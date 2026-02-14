export function generateCategoryColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash % 360);
  const s = 75 + (Math.abs(hash) % 25);
  const l = 35 + (Math.abs(hash) % 15);
  return `${h}, ${s}%, ${l}%`;
}
