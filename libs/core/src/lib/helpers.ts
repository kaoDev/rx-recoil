import { useEffect, useState } from 'react';
import {
  asyncScheduler,
  BehaviorSubject,
  firstValueFrom,
  isObservable as isObservableBase,
  Observable,
} from 'rxjs';
import { filter, observeOn } from 'rxjs/operators';
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

export function useObservable<T>(
  value$: Observable<T>,
  initialValue: T,
  synchronous = false,
) {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    const subscription = (synchronous
      ? value$
      : value$.pipe(observeOn(asyncScheduler))
    ).subscribe((next) => {
      setState(next);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [value$, synchronous]);

  return state;
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
        (value$ as Observable<unknown>).pipe(filter((v) => v !== EMPTY_VALUE)),
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
    const currentValue = useObservable(value$, value$.value, synchronous);

    if ((currentValue as any) === EMPTY_VALUE) {
      throw getInitialValuePromise();
    }
    initialValuePromise = null;

    return currentValue as Exclude<Value, EMPTY_TYPE>;
  }

  function useValueRaw(synchronous = false) {
    const currentValue = useObservable(value$, value$.value, synchronous);

    return currentValue;
  }

  return { useValue, useValueRaw, unsubscribe };
}
