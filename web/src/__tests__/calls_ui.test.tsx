import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { IncomingCallModal, IncomingCallData } from '../components/chat/IncomingCallModal';

describe('XXQ Chat Call UI Suite', () => {
  it('renders IncomingCallModal with Sesli Arama badge and Turkish actions', () => {
    const incomingCall: IncomingCallData = {
      conversationId: 'conv_123',
      callerId: 'user_456',
      callerName: 'Ayşe Yılmaz',
      callerAvatar: null,
      mode: 'audio',
      createdAt: new Date().toISOString(),
    };

    const html = renderToString(
      <IncomingCallModal
        incomingCall={incomingCall}
        onAccept={() => {}}
        onReject={() => {}}
      />
    );

    expect(html).toContain('Ayşe Yılmaz');
    expect(html).toContain('Sesli Arama');
    expect(html).toContain('Sizi arıyor...');
    expect(html).toContain('Yanıtla');
    expect(html).toContain('Reddet');
  });

  it('renders IncomingCallModal with Görüntülü Arama badge', () => {
    const incomingCall: IncomingCallData = {
      conversationId: 'conv_123',
      callerId: 'user_456',
      callerName: 'Mehmet Demir',
      callerAvatar: null,
      mode: 'video',
      createdAt: new Date().toISOString(),
    };

    const html = renderToString(
      <IncomingCallModal
        incomingCall={incomingCall}
        onAccept={() => {}}
        onReject={() => {}}
      />
    );

    expect(html).toContain('Mehmet Demir');
    expect(html).toContain('Görüntülü Arama');
    expect(html).toContain('Yanıtla');
    expect(html).toContain('Reddet');
  });

  it('renders IncomingCallModal with Ekran Paylaşımı Araması badge', () => {
    const incomingCall: IncomingCallData = {
      conversationId: 'conv_123',
      callerId: 'user_456',
      callerName: 'Zeynep Kaya',
      callerAvatar: null,
      mode: 'screen',
      createdAt: new Date().toISOString(),
    };

    const html = renderToString(
      <IncomingCallModal
        incomingCall={incomingCall}
        onAccept={() => {}}
        onReject={() => {}}
      />
    );

    expect(html).toContain('Zeynep Kaya');
    expect(html).toContain('Ekran Paylaşımı Araması');
    expect(html).toContain('Yanıtla');
    expect(html).toContain('Reddet');
  });
});
