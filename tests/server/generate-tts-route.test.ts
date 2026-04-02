import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/generate/tts/route';

describe('/api/generate/tts', () => {
  it('keeps browser-native TTS on the client side', async () => {
    const request = new Request('http://localhost/api/generate/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Hello from browser TTS',
        audioId: 'preview',
        ttsProviderId: 'browser-native-tts',
        ttsVoice: 'default',
      }),
    });

    const response = await POST(request as never);
    const body = (await response.json()) as { success: boolean; errorCode?: string };

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.errorCode).toBe('INVALID_REQUEST');
  });
});
