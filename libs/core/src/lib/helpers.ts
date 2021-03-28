import { useEffect, useState } from 'react';
import type { BehaviorSubject, Subscribable } from 'rxjs';

export function isPromise(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    typeof (value as any).subscribe !== 'function' &&
    typeof (value as any).then === 'function'
  );
}

export function isSubscribable<T>(value: unknown): value is Subscribable<T> {
  return !!value && typeof (value as any).subscribe === 'function';
}

export function useObservablueValue<Value>(
  source$: BehaviorSubject<Value>,
  onError: (error: unknown, fallbackMessage: string) => void,
) {
  const [state, setState] = useState(() => source$.value);

  useEffect(() => {
    const subscription = source$.subscribe(
      (value) => {
        setState(value);
      },
      (error) => onError(error, `Exception in atom value stream`),
    );

    return () => subscription.unsubscribe();
  }, [source$, onError]);

  return state;
}
