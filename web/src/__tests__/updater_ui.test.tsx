import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  UpdateModalView,
  formatBytes,
  UpdateData,
} from '../components/common/UpdateNotificationModal';

describe('UpdateNotificationModal UI Suite', () => {
  const sampleUpdateData: UpdateData = {
    latestVersion: '1.2.0',
    releaseNotes: '• Otomatik güncelleme desteği eklendi\n• Performans iyileştirmeleri yapıldı',
    releaseDate: '2026-10-21',
    artifact: {
      fileName: 'XXQ-Chat-Setup.exe',
      fileSize: 85000000,
      sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
      downloadUrl: 'https://github.com/CodingM-eng/XXQ-Chat/releases/download/v1.2.0/XXQ-Chat-Setup.exe',
      installType: 'nsis',
    },
    githubReleaseUrl: 'https://github.com/CodingM-eng/XXQ-Chat/releases/tag/v1.2.0',
  };

  const renderClean = (component: React.ReactElement): string => {
    return renderToString(component).replace(/<!--.*?-->/g, '');
  };

  it('formats byte sizes into readable MB values', () => {
    expect(formatBytes(0)).toBe('0 MB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(85000000)).toBe('81.1 MB');
  });

  it('renders nothing when closed or when updateData is null', () => {
    const htmlClosed = renderClean(
      <UpdateModalView
        isOpen={false}
        updateData={sampleUpdateData}
        status="available"
        downloadProgress={0}
        downloadStats={{ transferred: 0, total: 0 }}
        onClose={() => {}}
        onStartDownload={() => {}}
        onInstallAndRestart={() => {}}
        onCancelDownload={() => {}}
      />
    );
    expect(htmlClosed).toBe('');

    const htmlNullData = renderClean(
      <UpdateModalView
        isOpen={true}
        updateData={null}
        status="available"
        downloadProgress={0}
        downloadStats={{ transferred: 0, total: 0 }}
        onClose={() => {}}
        onStartDownload={() => {}}
        onInstallAndRestart={() => {}}
        onCancelDownload={() => {}}
      />
    );
    expect(htmlNullData).toBe('');
  });

  it('renders Turkish update prompt with release notes, artifact size, and SHA-256 when update is available', () => {
    const html = renderClean(
      <UpdateModalView
        isOpen={true}
        updateData={sampleUpdateData}
        status="available"
        downloadProgress={0}
        downloadStats={{ transferred: 0, total: 0 }}
        onClose={() => {}}
        onStartDownload={() => {}}
        onInstallAndRestart={() => {}}
        onCancelDownload={() => {}}
      />
    );

    expect(html).toContain('Yeni bir güncelleme var: v1.2.0');
    expect(html).toContain('Kararlı Sürüm');
    expect(html).toContain('Sürüm Yenilikleri');
    expect(html).toContain('Otomatik güncelleme desteği eklendi');
    expect(html).toContain('XXQ-Chat-Setup.exe');
    expect(html).toContain('81.1 MB');
    expect(html).toContain('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    expect(html).toContain('İndir');
    expect(html).toContain('Daha Sonra');
    expect(html).toContain('GitHub Sürümü');
  });

  it('displays download progress bar in Turkish when downloading', () => {
    const html = renderClean(
      <UpdateModalView
        isOpen={true}
        updateData={sampleUpdateData}
        status="downloading"
        downloadProgress={64}
        downloadStats={{ transferred: 67108864, total: 104857600 }}
        onClose={() => {}}
        onStartDownload={() => {}}
        onInstallAndRestart={() => {}}
        onCancelDownload={() => {}}
      />
    );

    expect(html).toContain('Güncelleme indiriliyor...');
    expect(html).toContain('%64');
    expect(html).toContain('64.0 MB');
    expect(html).toContain('100.0 MB');
    expect(html).toContain('İptal Et');
  });

  it('displays success message and "Yeniden Başlat ve Güncelle" button when download completes', () => {
    const html = renderClean(
      <UpdateModalView
        isOpen={true}
        updateData={sampleUpdateData}
        status="downloaded"
        downloadProgress={100}
        downloadStats={{ transferred: 104857600, total: 104857600 }}
        onClose={() => {}}
        onStartDownload={() => {}}
        onInstallAndRestart={() => {}}
        onCancelDownload={() => {}}
      />
    );

    expect(html).toContain('Güncelleme paketi başarıyla indirildi ve doğrulandı!');
    expect(html).toContain('Oturumunuz ve sohbet verileriniz korunur.');
    expect(html).toContain('Yeniden Başlat ve Güncelle');
    expect(html).toContain('Daha Sonra');
  });

  it('displays Turkish error alert when updater reports a failure', () => {
    const html = renderClean(
      <UpdateModalView
        isOpen={true}
        updateData={sampleUpdateData}
        status="error"
        downloadProgress={0}
        downloadStats={{ transferred: 0, total: 0 }}
        errorMessage="İndirilen güncelleme dosyasının SHA-256 sağlama toplamı eşleşmiyor."
        onClose={() => {}}
        onStartDownload={() => {}}
        onInstallAndRestart={() => {}}
        onCancelDownload={() => {}}
      />
    );

    expect(html).toContain('Güncelleme Hatası');
    expect(html).toContain('İndirilen güncelleme dosyasının SHA-256 sağlama toplamı eşleşmiyor.');
  });
});
