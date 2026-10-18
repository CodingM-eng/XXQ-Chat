/**
 * Safe SVG and Image URL handling for XXQ Chat Frontend
 * Prevents raw SVG markup leaks, strips malicious SVG tags/scripts,
 * prevents literal "svg" string leakage into the UI, and converts
 * valid SVG strings into safe data URIs for <img> tags.
 */

export function isLiteralSvgWord(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const lower = val.trim().toLowerCase();
  return lower === 'svg' || lower === 'svg.png' || lower === 'image/svg+xml' || lower === '<svg>' || lower === '</svg>';
}

export function isRawSvg(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  const trimmed = val.trim();
  return (trimmed.startsWith('<svg') || trimmed.includes('<svg')) && trimmed.includes('</svg>');
}

export function sanitizeSvg(svgContent: string): string {
  if (!svgContent || typeof svgContent !== 'string') return '';

  let sanitized = svgContent.trim();

  // Strip XML prolog or DOCTYPE
  sanitized = sanitized.replace(/<\?xml[\s\S]*?\?>/gi, '');
  sanitized = sanitized.replace(/<!DOCTYPE[\s\S]*?>/gi, '');

  // Strip dangerous tags: script, foreignObject, iframe, object, embed, style, meta, link
  const dangerousTags = ['script', 'foreignobject', 'iframe', 'object', 'embed', 'applet', 'meta', 'link', 'style'];
  for (const tag of dangerousTags) {
    const tagRegex = new RegExp(`<${tag}[\\s\\S]*?>[\\s\\S]*?<\\/${tag}>`, 'gi');
    sanitized = sanitized.replace(tagRegex, '');
    const selfClosingRegex = new RegExp(`<${tag}[\\s\\S]*?\\/?>`, 'gi');
    sanitized = sanitized.replace(selfClosingRegex, '');
  }

  // Strip all inline event handlers (onload, onerror, onclick, on*, etc.)
  sanitized = sanitized.replace(/\s+on[a-z0-9_-]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, '');

  // Strip javascript: / vbscript: protocols
  sanitized = sanitized.replace(/\s+(?:xlink:)?href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*"|javascript:[^\s>]+)/gi, '');
  sanitized = sanitized.replace(/\s+(?:xlink:)?href\s*=\s*(?:'vbscript:[^']*'|"vbscript:[^"]*"|vbscript:[^\s>]+)/gi, '');

  // Validate that SVG tags exist
  if (!sanitized.includes('<svg') || !sanitized.includes('</svg>')) {
    return '';
  }

  // Ensure standard SVG namespace if missing
  if (!sanitized.includes('xmlns=')) {
    sanitized = sanitized.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  return sanitized;
}

export function toSafeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();

  // If the string is literally "svg" or placeholder, treat as no image
  if (isLiteralSvgWord(trimmed)) {
    return null;
  }

  // If it's a raw SVG XML block, sanitize it and convert to a data URI
  if (isRawSvg(trimmed)) {
    const sanitized = sanitizeSvg(trimmed);
    if (!sanitized) return null;
    return `data:image/svg+xml;utf8,${encodeURIComponent(sanitized)}`;
  }

  // If it's already an SVG data URI, sanitize the payload
  if (trimmed.startsWith('data:image/svg+xml')) {
    try {
      const isBase64 = trimmed.includes(';base64,');
      const payload = isBase64 ? trimmed.split(';base64,')[1] : trimmed.split(',')[1];
      const decoded = isBase64 ? atob(payload) : decodeURIComponent(payload);
      const sanitized = sanitizeSvg(decoded);
      if (!sanitized) return null;
      return `data:image/svg+xml;utf8,${encodeURIComponent(sanitized)}`;
    } catch {
      return null;
    }
  }

  // Supported image URL protocols
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  return null;
}
