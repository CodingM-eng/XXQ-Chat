import { resolveBackendBaseUrl } from '../config/appConfig';

export interface WakeupProgress {
  state: 'checking' | 'waking' | 'online' | 'offline' | 'timeout' | 'error' | 'aborted';
  attempt: number;
  maxAttempts: number;
  message: string;
  delayMs?: number;
}

export class ConnectionError extends Error {
  code: 'OFFLINE' | 'COLD_START_TIMEOUT' | 'SERVER_UNAVAILABLE' | 'ABORTED' | 'NETWORK_ERROR';
  status?: number;

  constructor(code: 'OFFLINE' | 'COLD_START_TIMEOUT' | 'SERVER_UNAVAILABLE' | 'ABORTED' | 'NETWORK_ERROR', message: string, status?: number) {
    super(message);
    this.name = 'ConnectionError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Bounded health probe with capped exponential backoff for sleeping Render Free services.
 * Renders clear Turkish feedback ("Sunucu uyandırılıyor..."), supports AbortSignal cancellation,
 * and halts after maxAttempts (approx 45-50 seconds).
 */
export async function probeBackendWithWakeup(options?: {
  maxAttempts?: number;
  onProgress?: (progress: WakeupProgress) => void;
  signal?: AbortSignal;
}): Promise<{ success: boolean; attempts: number; durationMs: number }> {
  const maxAttempts = options?.maxAttempts ?? 6;
  const baseUrl = resolveBackendBaseUrl();
  const startTime = Date.now();

  // Fast offline check
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const errorMsg = 'İnternet bağlantınız kesilmiş görünüyor. Lütfen ağ bağlantınızı kontrol edin.';
    options?.onProgress?.({
      state: 'offline',
      attempt: 0,
      maxAttempts,
      message: errorMsg,
    });
    throw new ConnectionError('OFFLINE', errorMsg);
  }

  // Capped backoff delays between attempts (in milliseconds): 2s, 3s, 5s, 8s, 8s, 8s
  const backoffDelays = [2000, 3000, 5000, 8000, 8000, 8000];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options?.signal?.aborted) {
      options?.onProgress?.({
        state: 'aborted',
        attempt,
        maxAttempts,
        message: 'Sunucu bağlantısı kullanıcı tarafından iptal edildi.',
      });
      throw new ConnectionError('ABORTED', 'Sunucu bağlantısı kullanıcı tarafından iptal edildi.');
    }

    const isFirst = attempt === 1;
    const progressMessage = isFirst
      ? 'Sunucu durumu kontrol ediliyor...'
      : `Sunucu uyandırılıyor... (Deneme ${attempt}/${maxAttempts} - Render Free uyku modu ~30-50 sn)`;

    options?.onProgress?.({
      state: isFirst ? 'checking' : 'waking',
      attempt,
      maxAttempts,
      message: progressMessage,
    });

    try {
      const probeController = new AbortController();
      const timeoutId = setTimeout(() => probeController.abort(), 8000); // 8s per probe timeout

      const abortListener = () => probeController.abort();
      options?.signal?.addEventListener('abort', abortListener);

      const response = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: probeController.signal,
      }).finally(() => {
        clearTimeout(timeoutId);
        options?.signal?.removeEventListener('abort', abortListener);
      });

      if (response.ok) {
        options?.onProgress?.({
          state: 'online',
          attempt,
          maxAttempts,
          message: 'Sunucu çevrim içi ve hazır.',
        });
        return {
          success: true,
          attempts: attempt,
          durationMs: Date.now() - startTime,
        };
      }
    } catch {
      if (options?.signal?.aborted) {
        options?.onProgress?.({
          state: 'aborted',
          attempt,
          maxAttempts,
          message: 'Sunucu bağlantısı kullanıcı tarafından iptal edildi.',
        });
        throw new ConnectionError('ABORTED', 'Sunucu bağlantısı kullanıcı tarafından iptal edildi.');
      }
      // Failure to fetch indicates server cold start or temporary spin-up delay
    }

    // If not final attempt, wait before retrying
    if (attempt < maxAttempts) {
      const delay = backoffDelays[attempt - 1] || 8000;
      options?.onProgress?.({
        state: 'waking',
        attempt,
        maxAttempts,
        message: `Sunucu uyandırılıyor... (Render Free uyanış bekleniyor, ${Math.round(delay / 1000)} sn sonra tekrar denenecek)`,
        delayMs: delay,
      });

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        if (options?.signal) {
          options.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer);
              options.onProgress?.({
                state: 'aborted',
                attempt,
                maxAttempts,
                message: 'Sunucu bağlantısı kullanıcı tarafından iptal edildi.',
              });
              reject(new ConnectionError('ABORTED', 'Sunucu bağlantısı kullanıcı tarafından iptal edildi.'));
            },
            { once: true }
          );
        }
      });
    }
  }

  const timeoutMsg =
    'Sunucu 50 saniye içinde yanıt vermedi. Render Free servisleri uyku modundan uyanırken gecikme yaşanabilir. Lütfen internet bağlantınızı kontrol edip "Yeniden Dene" butonuna tıklayın.';
  options?.onProgress?.({
    state: 'timeout',
    attempt: maxAttempts,
    maxAttempts,
    message: timeoutMsg,
  });
  throw new ConnectionError('COLD_START_TIMEOUT', timeoutMsg);
}
