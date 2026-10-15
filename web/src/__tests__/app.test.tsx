import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { BrandLogo } from '../components/common/BrandLogo';
import { EmptyState } from '../components/chat/EmptyState';

describe('XXQ Chat Web Component Suite', () => {
  it('renders BrandLogo with bespoke SVG and styling', () => {
    const html = renderToString(<BrandLogo size={40} showText={true} />);
    expect(html).toContain('XXQ');
    expect(html).toContain('Chat');
    expect(html).toContain('Quantum Secure');
    expect(html).toContain('<svg');
  });

  it('renders EmptyState with welcome text and platform features', () => {
    const html = renderToString(<EmptyState onOpenNewChat={() => {}} />);
    expect(html).toContain('Welcome to');
    expect(html).toContain('XXQ Chat');
    expect(html).toContain('Start a New Conversation');
    expect(html).toContain('Real-Time');
    expect(html).toContain('Whitelist');
  });
});
