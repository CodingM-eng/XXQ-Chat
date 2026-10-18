import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SafeAvatar } from '../components/common/SafeAvatar';
import {
  isLiteralSvgWord,
  isRawSvg,
  sanitizeSvg,
  toSafeImageUrl,
} from '../utils/sanitizeSvg';

describe('Frontend SVG Sanitization and SafeAvatar Suite', () => {
  describe('isLiteralSvgWord', () => {
    it('detects literal "svg" string variants that mistakenly get rendered', () => {
      expect(isLiteralSvgWord('svg')).toBe(true);
      expect(isLiteralSvgWord('SVG')).toBe(true);
      expect(isLiteralSvgWord('svg.png')).toBe(true);
      expect(isLiteralSvgWord('<svg>')).toBe(true);
      expect(isLiteralSvgWord('</svg>')).toBe(true);
      expect(isLiteralSvgWord('image/svg+xml')).toBe(true);
      expect(isLiteralSvgWord('alice')).toBe(false);
      expect(isLiteralSvgWord('https://example.com/pic.png')).toBe(false);
    });
  });

  describe('isRawSvg', () => {
    it('identifies raw SVG markup', () => {
      expect(isRawSvg('<svg><circle/></svg>')).toBe(true);
      expect(isRawSvg('  <svg viewBox="0 0 10 10"></svg>  ')).toBe(true);
      expect(isRawSvg('https://example.com/pic.svg')).toBe(false);
      expect(isRawSvg('svg')).toBe(false);
    });
  });

  describe('sanitizeSvg', () => {
    it('removes scripts and on* event handlers', () => {
      const malicious = '<svg><script>alert(1)</script><rect onload="hack()" width="10"/></svg>';
      const cleaned = sanitizeSvg(malicious);
      expect(cleaned).not.toContain('<script');
      expect(cleaned).not.toContain('onload');
      expect(cleaned).toContain('<rect');
    });

    it('removes iframes and javascript links', () => {
      const malicious = '<svg><iframe src="xyz"/><a href="javascript:void(0)">link</a></svg>';
      const cleaned = sanitizeSvg(malicious);
      expect(cleaned).not.toContain('<iframe');
      expect(cleaned).not.toContain('javascript:');
    });
  });

  describe('toSafeImageUrl', () => {
    it('rejects literal word "svg" as null so avatar fallbacks are rendered', () => {
      expect(toSafeImageUrl('svg')).toBeNull();
      expect(toSafeImageUrl('SVG')).toBeNull();
      expect(toSafeImageUrl('svg.png')).toBeNull();
    });

    it('converts raw SVG into encoded data URI', () => {
      const raw = '<svg viewBox="0 0 10 10"><rect/></svg>';
      const uri = toSafeImageUrl(raw);
      expect(uri).toBeDefined();
      expect(uri).toMatch(/^data:image\/svg\+xml;utf8,/);
    });

    it('passes normal safe https URLs untouched', () => {
      const url = 'https://images.unsplash.com/photo-123';
      expect(toSafeImageUrl(url)).toBe(url);
    });
  });

  describe('SafeAvatar Component', () => {
    it('renders img with data URI when given valid raw SVG', () => {
      const svg = '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="10"/></svg>';
      const html = renderToString(<SafeAvatar src={svg} alt="Test Avatar" size={40} />);
      expect(html).toContain('<img');
      expect(html).toContain('data:image/svg+xml');
      expect(html).not.toContain('alert');
    });

    it('renders fallback initials when src is literal "svg"', () => {
      const html = renderToString(<SafeAvatar src="svg" fallbackText="Ahmet Yılmaz" size={40} />);
      // Should NOT render <img src="svg">
      expect(html).not.toContain('src="svg"');
      // Should render initials "AY"
      expect(html).toContain('AY');
    });

    it('does not display raw "svg" as initials when fallbackText is "svg"', () => {
      const html = renderToString(<SafeAvatar src={null} fallbackText="svg" size={40} />);
      // Should NOT render "svg" or "SV"
      expect(html).not.toContain('>svg<');
      expect(html).not.toContain('>SV<');
    });

    it('renders initials cleanly for regular user', () => {
      const html = renderToString(<SafeAvatar src={null} fallbackText="Zeynep Kaya" size={40} />);
      expect(html).toContain('ZK');
    });
  });
});
