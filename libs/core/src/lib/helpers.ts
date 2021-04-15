import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { BehaviorSubject, Subscribable } from 'rxjs';
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect';

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

export function useObservableValue<Value>(
  source$: BehaviorSubject<Value>,
  onError: (error: unknown, fallbackMessage: string) => void,
) {
  const [state, setState] = useState(() => source$.value);

  useIsomorphicLayoutEffect(() => {
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

function useForceUpdate(): () => void {
  const [, dispatch] = useState<unknown>(Object.create(null));

  // Turn dispatch(required_parameter) into dispatch().
  const memoizedDispatch = useCallback((): void => {
    dispatch(Object.create(null));
  }, [dispatch]);
  return memoizedDispatch;
}

export function createUseValueHook<Value>(
  stateId: symbol,
  value$: BehaviorSubject<Value>,
  onError: (error: Error) => void,
) {
  const listeners = new Set<(change: Value) => void>();

  const subscription = value$.subscribe(
    (value) => {
      for (const listener of listeners) {
        listener(value);
      }
    },
    (error) => onError(error),
  );

  function useValue() {
    const forceUpdate = useForceUpdate();
    const stateRef = useRef<symbol | null>(null);
    const mounted = useRef(false);
    const listener = useRef<((change: Value) => void) | null>(null);

    const snapshot = useRef(value$.value);

    if (stateId !== stateRef.current) {
      stateRef.current = stateId;
      snapshot.current = value$.value;
      if (listener.current) {
        listeners.delete(listener.current);
      }
      listener.current = (update: Value) => {
        if (update !== snapshot.current) {
          snapshot.current = update;
        }
        if (mounted.current) {
          forceUpdate();
        }
      };
      listeners.add(listener.current);
    }

    useLayoutEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
        if (listener.current) {
          listeners.delete(listener.current);
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [listeners, forceUpdate]);

    return snapshot.current;
  }

  return { useValue, subscription };
}
