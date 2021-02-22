import React, { Suspense, useCallback, useEffect } from 'react';
import { interval } from 'rxjs';
import { filter, withLatestFrom } from 'rxjs/operators';
import {
  EMPTY_VALUE,
  useAtomicState,
  useSuspendedMutableState,
} from '@rx-recoil/core';
import { persistedAtom } from '@rx-recoil/persistence';

const countState = persistedAtom({
  key: 'count',
  storage: localStorage,
  version: 0,
  fallbackValue: 0,
  debugKey: 'count',
});

function CounterAutoIncrementEffect() {
  const { dispatchUpdate, value$ } = useAtomicState(countState);

  useEffect(() => {
    const sub = interval(1000)
      .pipe(
        withLatestFrom(value$, (_, count) => count),
        filter((count): count is number => count !== EMPTY_VALUE)
      )
      .subscribe((count) => {
        dispatchUpdate(count + 1);
      });

    return () => sub.unsubscribe();
  }, [dispatchUpdate, value$]);

  return null;
}

function ResetButton() {
  const { dispatchUpdate } = useAtomicState(countState);
  const reset = useCallback(() => {
    dispatchUpdate(0);
  }, [dispatchUpdate]);

  return (
    <p>
      <button onClick={reset}>reset</button>
    </p>
  );
}

function ManualCounter() {
  const [count, setCount] = useSuspendedMutableState(countState);
  const increment = () => {
    setCount(count + 1);
  };

  return (
    <>
      <p>{count}</p>
      <button onClick={increment}>+ 1</button>
    </>
  );
}

export function Counter() {
  return (
    <section>
      <h2>persisted counter state example</h2>
      <Suspense fallback={<div>loading</div>}>
        <ManualCounter />
      </Suspense>
      <ResetButton />
      <CounterAutoIncrementEffect />
    </section>
  );
}
