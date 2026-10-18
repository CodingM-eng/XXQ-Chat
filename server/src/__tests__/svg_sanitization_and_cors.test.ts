import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app';
import { sanitizeSvg, normalizeAndSanitizeImageUrl } from '../utils/sanitizeSvg';

describe('Server SVG Sanitization and CORP Headers', () => {
  it('configures Cross-Origin-Resource-Policy as cross-origin on app', async () => {
    const res = await request(app)
      .get('/health')
      .set('Origin', 'https://xxq-chat-frontend.onrender.com');
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['access-control-allow-origin']).toBe('https://xxq-chat-frontend.onrender.com');
  });

  describe('sanitizeSvg', () => {
    it('strips <script> tags from SVG markup', () => {
      const malicious = '<svg viewBox="0 0 100 100"><script>alert("xss")</script><circle cx="50" cy="50" r="40"/></svg>';
      const cleaned = sanitizeSvg(malicious);
      expect(cleaned).not.toContain('<script');
      expect(cleaned).not.toContain('alert');
      expect(cleaned).toContain('<circle cx="50" cy="50" r="40"/>');
    });

    it('strips inline on* event handlers', () => {
      const malicious = '<svg onload="alert(1)" onclick="steal()"><rect width="100" height="100" onmouseover="bad()"/></svg>';
      const cleaned = sanitizeSvg(malicious);
      expect(cleaned).not.toContain('onload');
      expect(cleaned).not.toContain('onclick');
      expect(cleaned).not.toContain('onmouseover');
      expect(cleaned).toContain('<rect width="100" height="100"');
    });

    it('strips javascript: and vbscript: URLs', () => {
      const malicious = '<svg><a href="javascript:alert(1)"><text>Click</text></a></svg>';
      const cleaned = sanitizeSvg(malicious);
      expect(cleaned).not.toContain('javascript:');
    });

    it('strips foreignObject and iframe tags', () => {
      const malicious = '<svg><foreignObject><iframe src="evil.com"></iframe></foreignObject></svg>';
      const cleaned = sanitizeSvg(malicious);
      expect(cleaned).not.toContain('<foreignObject');
      expect(cleaned).not.toContain('<iframe');
    });

    it('returns empty string if SVG does not contain valid tags', () => {
      expect(sanitizeSvg('just random text')).toBe('');
      expect(sanitizeSvg('svg')).toBe('');
    });
  });

  describe('normalizeAndSanitizeImageUrl', () => {
    it('rejects literal word "svg" or "svg.png"', () => {
      expect(normalizeAndSanitizeImageUrl('svg')).toBeNull();
      expect(normalizeAndSanitizeImageUrl('svg.png')).toBeNull();
      expect(normalizeAndSanitizeImageUrl('<svg>')).toBeNull();
    });

    it('converts valid raw SVG string to safe data URI', () => {
      const svg = '<svg viewBox="0 0 24 24"><path d="M12 2L2 22h20L12 2z"/></svg>';
      const result = normalizeAndSanitizeImageUrl(svg);
      expect(result).toBeDefined();
      expect(result).toMatch(/^data:image\/svg\+xml;utf8,/);
      expect(decodeURIComponent(result!)).toContain('<svg');
    });

    it('passes through safe https image URLs', () => {
      const httpsUrl = 'https://example.com/avatar.jpg';
      expect(normalizeAndSanitizeImageUrl(httpsUrl)).toBe(httpsUrl);
    });

    it('returns null for empty or invalid inputs', () => {
      expect(normalizeAndSanitizeImageUrl('')).toBeNull();
      expect(normalizeAndSanitizeImageUrl(null)).toBeNull();
      expect(normalizeAndSanitizeImageUrl(undefined)).toBeNull();
    });
  });
});
