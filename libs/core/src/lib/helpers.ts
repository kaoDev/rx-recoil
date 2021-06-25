import { useCallback, useEffect, useState } from 'react';
import {
  BehaviorSubject,
  Observable,
  isObservable as isObservableBase,
  firstValueFrom,
  asyncScheduler,
} from 'rxjs';
import { filter, observeOn, take } from 'rxjs/operators';
import { EMPTY_TYPE, EMPTY_VALUE } from './types';

export function isPromise(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    typeof (value as any).subscribe !== 'function' &&
    typeof (value as any).then === 'function'
  );
}

export function isObservable<T>(value: unknown): value is Observable<T> {
  return isObservableBase(value);
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
  value$: BehaviorSubject<Value>,
  onError: (error: Error) => void,
) {
  const listeners = new Set<() => void>();
  const asyncListeners = new Set<() => void>();

  let initialValuePromise: Promise<unknown> | null = null;
  function getInitialValuePromise() {
    if (!initialValuePromise) {
      initialValuePromise = firstValueFrom(
        (value$ as Observable<unknown>).pipe(
          filter((v) => v !== EMPTY_VALUE),
          take(1),
        ),
      );
    }

    return initialValuePromise;
  }

  const asyncStream = value$.pipe(observeOn(asyncScheduler));
  const subscription = value$.subscribe({
    error: (error) => onError(error),
    next: () => {
      for (const listener of listeners) {
        listener();
      }
    },
  });
  const asyncSubscription = asyncStream.subscribe({
    error: (error) => onError(error),
    next: () => {
      for (const listener of asyncListeners) {
        listener();
      }
    },
  });

  function unsubscribe() {
    subscription.unsubscribe();
    asyncSubscription.unsubscribe();
  }

  function useValue(synchronous = false): Exclude<Value, EMPTY_TYPE> {
    const forceUpdate = useForceUpdate();

    if ((value$.value as any) === EMPTY_VALUE) {
      throw getInitialValuePromise();
    }
    initialValuePromise = null;

    useEffect(() => {
      if (synchronous) {
        listeners.add(forceUpdate);
        return () => {
          listeners.delete(forceUpdate);
        };
      } else {
        asyncListeners.add(forceUpdate);
        return () => {
          asyncListeners.delete(forceUpdate);
        };
      }
    }, [forceUpdate, synchronous]);

    return value$.value as Exclude<Value, EMPTY_TYPE>;
  }

  function useValueRaw(synchronous = false) {
    const forceUpdate = useForceUpdate();

    useEffect(() => {
      if (synchronous) {
        listeners.add(forceUpdate);
        return () => {
          listeners.delete(forceUpdate);
        };
      } else {
        asyncListeners.add(forceUpdate);
        return () => {
          asyncListeners.delete(forceUpdate);
        };
      }
    }, [forceUpdate, synchronous]);

    return value$.value;
  }

  return { useValue, useValueRaw, unsubscribe };
}
