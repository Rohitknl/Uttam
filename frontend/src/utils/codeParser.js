export function parseHerbName(nameStr) {
  const raw = String(nameStr || '').trim();
  if (!raw) return { cleanName: '', rawName: '', number: '' };

  const match = raw.match(/^(.*?)(?:[\s._-]+)?(\d+)$/);
  if (match && match[2]) {
    const clean = (match[1] || '').replace(/[\s._-]+$/, '').trim();
    return {
      cleanName: clean,
      rawName: raw,
      number: match[2],
    };
  }

  return { cleanName: raw, rawName: raw, number: '' };
}

export function parseHerbCode(codeStr) {
  return parseHerbName(codeStr);
}
