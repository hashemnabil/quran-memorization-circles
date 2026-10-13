import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.qurancircles.app',
  appName: 'حلقات تحفيظ السوسي',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
