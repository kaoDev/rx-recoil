import { useCallback, useEffect, useState } from 'react';
import {
  BehaviorSubject,
  Observable,
  isObservable as isObservableBase,
} from 'rxjs';
import { filter, take } from 'rxjs/operators';
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

  let initialValuePromise: Promise<unknown> | null = null;
  function getInitialValuePromise() {
    if (!initialValuePromise) {
      initialValuePromise = (value$ as Observable<unknown>)
        .pipe(
          filter((v) => v !== EMPTY_VALUE),
          take(1),
        )
        .toPromise();
    }
    return initialValuePromise;
  }

  const subscription = value$.subscribe(
    () => {
      for (const listener of listeners) {
        listener();
      }
    },
    (error) => onError(error),
  );

  function useValue(): Exclude<Value, EMPTY_TYPE> {
    const forceUpdate = useForceUpdate();

    if ((value$.value as any) === EMPTY_VALUE) {
      throw getInitialValuePromise();
    }
    initialValuePromise = null;

    useEffect(() => {
      listeners.add(forceUpdate);
      return () => {
        listeners.delete(forceUpdate);
      };
    }, [forceUpdate]);

    return value$.value as Exclude<Value, EMPTY_TYPE>;
  }

  function useValueRaw() {
    const forceUpdate = useForceUpdate();

    useEffect(() => {
      listeners.add(forceUpdate);
      return () => {
        listeners.delete(forceUpdate);
      };
    }, [forceUpdate]);

    return value$.value;
  }

  return { useValue, useValueRaw, subscription };
}
