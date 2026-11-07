import { useLayoutEffect, type RefObject } from 'react';

/** Keep the composer inside the visual viewport, including Android/iOS keyboards. */
export function useChatViewport(container: RefObject<HTMLDivElement>, conversation?: string) {
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const viewport = window.visualViewport;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = element.getBoundingClientRect().top;
        const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
        const keyboard = !!viewport && window.innerHeight - viewport.height > 140;
        const navigation = document.querySelector<HTMLElement>('.mobile-navigation');
        const clearance = keyboard ? 8 : navigation ? navigation.getBoundingClientRect().height + 12 : 16;
        element.style.setProperty('--chat-height', Math.max(160, bottom - Math.max(top, viewport?.offsetTop || 0) - clearance) + 'px');
        document.documentElement.classList.toggle('chat-keyboard-open', keyboard);
        if (keyboard && document.activeElement?.tagName === 'TEXTAREA') {
          const messages = element.querySelector<HTMLElement>('.chat-messages');
          if (messages) messages.scrollTop = messages.scrollHeight;
        }
      });
    };
    const observer = new ResizeObserver(update);
    if (element.previousElementSibling) observer.observe(element.previousElementSibling);
    window.addEventListener('resize', update);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    update();
    return () => { cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener('resize', update); viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update); document.documentElement.classList.remove('chat-keyboard-open'); };
  }, [container, conversation]);
}
