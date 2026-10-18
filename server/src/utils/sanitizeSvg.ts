/**
 * Server-side SVG and Image Sanitizer for XXQ Chat
 * Removes scripts, inline event handlers, foreignObject, iframe, and dangerous protocols.
 */

export function sanitizeSvg(svgContent: string): string {
  if (!svgContent || typeof svgContent !== 'string') return '';

  let sanitized = svgContent.trim();

  // Strip XML prolog or DOCTYPE
  sanitized = sanitized.replace(/<\?xml[\s\S]*?\?>/gi, '');
  sanitized = sanitized.replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  // Strip dangerous HTML/SVG tags
  const dangerousTags = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'applet', 'meta', 'link', 'style'];
  for (const tag of dangerousTags) {
    const tagRegex = new RegExp(`<${tag}[\\s\\S]*?>[\\s\\S]*?<\\/${tag}>`, 'gi');
    sanitized = sanitized.replace(tagRegex, '');
    const selfClosingRegex = new RegExp(`<${tag}[\\s\\S]*?\\/?>`, 'gi');
    sanitized = sanitized.replace(selfClosingRegex, '');
  }

  // Strip event handlers: onload, onerror, onclick, onmouseover, etc.
  sanitized = sanitized.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // Strip javascript: / vbscript: / data: (except image) protocols
  sanitized = sanitized.replace(/\s+(?:xlink:)?href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, '');
  sanitized = sanitized.replace(/\s+(?:xlink:)?href\s*=\s*(?:'vbscript:[^']*'|"vbscript:[^"]*"|vbscript:[^\s>]+)/gi, '');

  // Validate that SVG tags exist
  if (!sanitized.includes('<svg') || !sanitized.includes('</svg>')) {
    return '';
  }

  // Ensure standard SVG namespace
  if (!sanitized.includes('xmlns=')) {
    sanitized = sanitized.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return sanitized;
}

export function isRawSvg(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (trimmed.startsWith('<svg') || trimmed.includes('<svg')) && trimmed.includes('</svg>');
}

export function isLiteralSvgWord(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const lower = val.trim().toLowerCase();
  return lower === 'svg' || lower === 'svg.png' || lower === 'image/svg+xml';
}

export function normalizeAndSanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (isLiteralSvgWord(trimmed)) {
    return null;
  }
  if (isRawSvg(trimmed)) {
    const sanitized = sanitizeSvg(trimmed);
    if (!sanitized) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(sanitized)}`;
  }
  if (trimmed.startsWith('data:image/svg+xml')) {
    try {
      const isBase64 = trimmed.includes(';base64,');
      const payload = isBase64 ? trimmed.split(';base64,')[1] : trimmed.split(',')[1];
      const decoded = isBase64 ? Buffer.from(payload, 'base64').toString('utf8') : decodeURIComponent(payload);
      const sanitized = sanitizeSvg(decoded);
      if (!sanitized) return null;
      return `data:image/svg+xml;utf8,${encodeURIComponent(sanitized)}`;
    } catch {
      return null;
    }
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return null;
}

