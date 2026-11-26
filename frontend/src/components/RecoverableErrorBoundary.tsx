import { Component, type ReactNode } from 'react';
import { IconAlert } from '@/components/ui/Icons';

export default class RecoverableErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <main dir="rtl" className="grid min-h-[100dvh] place-items-center bg-slate-50 p-6">
      <section role="alert" className="card w-full max-w-md p-8 text-center">
        <span className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary-700"><IconAlert size={28} /></span>
        <h1 className="text-xl font-extrabold text-slate-900">تعذر عرض الصفحة</h1>
        <p className="mt-3 text-sm leading-7 text-slate-600">أعد فتح الصفحة للمتابعة. لم نحذف بياناتك المحفوظة على الجهاز.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn-primary" onClick={() => window.location.reload()}>إعادة فتح الصفحة</button>
          <a className="btn-secondary" href="/">الرئيسية</a>
        </div>
      </section>
    </main>;
  }
}
