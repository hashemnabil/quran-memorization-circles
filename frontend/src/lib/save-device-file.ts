import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** Local download in browsers; native file/share sheet in Capacitor WebViews. */
export async function saveDeviceFile(blob: Blob, filename: string) {
  if (Capacitor.isNativePlatform()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 16384) binary += String.fromCharCode(...bytes.subarray(offset, offset + 16384));
    const file = await Filesystem.writeFile({ path: `exports/${filename}`, data: btoa(binary), directory: Directory.Cache, recursive: true });
    await Share.share({ title: 'تصدير الجدول', url: file.uri, dialogTitle: 'حفظ أو مشاركة ملف Excel' });
    return;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
