import React, { Suspense, useEffect } from 'react';
import { interval } from 'rxjs';
import { filter, withLatestFrom } from 'rxjs/operators';
import {
  EMPTY_VALUE,
  useAtomicState,
  useAtom,
  AtomDefinition,
} from '@rx-recoil/core';
import { persistedAtom } from '@rx-recoil/persistence';

const counters = Array.from({ length: 1000 }).map((_, i) =>
  persistedAtom({
    key: `count ${i}`,
    storage: localStorage,
    version: 0,
    fallbackValue: 0,
    debugKey: `count ${i}`,
  }),
);

function ChangingCounter({
  atom,
}: {
  atom: AtomDefinition<number | typeof EMPTY_VALUE, number>;
}) {
  const { dispatchUpdate, value$ } = useAtomicState(atom);
  const [count] = useAtom(atom);

  useEffect(() => {
    const sub = interval(Math.max(Math.random() * 2000, 750))
      .pipe(
        withLatestFrom(value$, (_, count) => count),
        filter((count): count is number => count !== EMPTY_VALUE),
      )
      .subscribe((count) => {
        dispatchUpdate(count + 1);
      });

    return () => sub.unsubscribe();
  }, [dispatchUpdate, value$]);

  return <p>{count}</p>;
}

export function CounterBenchmark() {
  return (
    <section>
      <h2>
        1000 persisted counter atoms all counting in a random speed between
        750ms to 2s
      </h2>
      <Suspense fallback={<div>loading</div>}>
        {counters.map((atom, i) => (
          <ChangingCounter key={i} atom={atom} />
        ))}
      </Suspense>
    </section>
  );
}
