import toast from 'react-hot-toast';
type ToastMessage = Parameters<typeof toast.success>[0];
type ToastOptions = Parameters<typeof toast.success>[1];
/** Local persistence is acknowledged separately from server acceptance. */
export function notifyWriteSuccess(result: unknown, message: ToastMessage, options?: ToastOptions) {
  const pending = (value: any): boolean => Array.isArray(value) ? value.some(pending) : (value?.data ?? value)?.synced === 0;
  if (pending(result)) return toast('حُفظت التغييرات على الجهاز، بانتظار المزامنة وتأكيد الخادم', options);
  return toast.success(message, options);
}
