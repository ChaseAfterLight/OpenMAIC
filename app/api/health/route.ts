import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

export async function GET() {
  const [webSearchProviders, imageProviders, videoProviders, ttsProviders] = await Promise.all([
    getServerWebSearchProviders(),
    getServerImageProviders(),
    getServerVideoProviders(),
    getServerTTSProviders(),
  ]);
  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      webSearch: Object.keys(webSearchProviders).length > 0,
      imageGeneration: Object.keys(imageProviders).length > 0,
      videoGeneration: Object.keys(videoProviders).length > 0,
      tts: Object.keys(ttsProviders).length > 0,
    },
  });
}
