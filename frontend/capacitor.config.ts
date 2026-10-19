import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.qurancircles.app',
  appName: 'انضباط',
  webDir: 'dist',
  plugins: { PushNotifications: { presentationOptions: ['badge', 'sound', 'alert'] } },
  server: { androidScheme: 'https' },
  android: { allowMixedContent: false },
};

export default config;
