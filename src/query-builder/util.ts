export function getAlias(originalName: string, alias?: string): string {
  return originalName.includes('*') ? originalName : alias ?? originalName.replace('.', '_');
}
