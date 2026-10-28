import { createExclusiveAudioPreview } from './exclusive-audio-preview';
import { androidNotifications, SchoolNotifications } from './notification-sounds';
export const notificationPreview = createExclusiveAudioPreview({
  create(source) {
    const audio = new Audio(source);
    return { play: () => audio.play(), stop: () => { audio.pause(); audio.removeAttribute('src'); audio.load(); }, onEnd: callback => { audio.onended = callback; } };
  },
  async startDevice() {
    if (!androidNotifications()) throw new Error('معاينة نغمة الجهاز متاحة في تطبيق أندرويد؛ تُستخدم نغمة الهاتف الفعلية عند وصول الإشعارات.');
    await SchoolNotifications.previewDefault();
  },
  async stopDevice() { if (androidNotifications()) await SchoolNotifications.stopPreview(); },
});
