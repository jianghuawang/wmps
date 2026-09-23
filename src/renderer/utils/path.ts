export function basename(path: string) { return path.replaceAll('\\', '/').split('/').filter(Boolean).pop() ?? path; }
