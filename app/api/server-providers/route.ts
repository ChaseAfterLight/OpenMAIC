import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { getPublicProviderConfigSnapshot } from '@/lib/server/provider-config-repository';

const log = createLogger('ServerProviders');

export async function GET() {
  try {
    const snapshot = await getPublicProviderConfigSnapshot();
    return apiSuccess({
      providers: snapshot.providers,
      tts: snapshot.tts,
      asr: snapshot.asr,
      pdf: snapshot.pdf,
      image: snapshot.image,
      video: snapshot.video,
      webSearch: snapshot.webSearch,
    });
  } catch (error) {
    log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      error instanceof Error ? error.message : 'Unknown error',
    );
  }
}
