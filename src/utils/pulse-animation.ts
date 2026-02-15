import { signal, effect, Signal } from '@angular/core';

export function usePulseAnimation(
  triggerSignal: Signal<number>,
  shouldAnimate: () => boolean,
) {
  const pulseClass = signal('');
  let lastPulseCount = -1;
  let usePulseA = true;

  effect(() => {
    const p = triggerSignal();

    if (lastPulseCount === -1) {
      lastPulseCount = p;
      return;
    }

    if (p !== lastPulseCount) {
      lastPulseCount = p;

      if (shouldAnimate()) {
        pulseClass.set(usePulseA ? 'pulse-trigger-a' : 'pulse-trigger-b');
        usePulseA = !usePulseA;
      }
    }
  });

  const onAnimationEnd = () => {
    pulseClass.set('');
  };

  return { pulseClass, onAnimationEnd };
}
