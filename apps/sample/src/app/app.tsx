import { createStateContextValue, StateRoot } from '@rx-recoil/core';
import React, { useEffect, useState } from 'react';
import styles from './app.module.css';
import { Counter } from './Counter';
import { Temperature } from './Temperature';
import { TodoQuery } from './TodoQuery';

function ExampleOption({
  label,
  value,
  visibleSample,
  setVisibleSample,
}: {
  label: string;
  value: string;
  visibleSample: string;
  setVisibleSample: (name: string) => void;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label>
        <input
          type="radio"
          checked={visibleSample === value}
          onChange={(e) => {
            setVisibleSample((e.target as HTMLInputElement).value);
          }}
          value={value}
          name="sample"
        />
        {label}
      </label>
    </div>
  );
}

const stateContext = createStateContextValue();

export function App() {
  const [visibleSample, setVisibleSample] = useState('temperature');

  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log('stateContext.stateMap', stateContext.stateMap);
  }, [visibleSample]);

  return (
    <StateRoot context={stateContext}>
      <div className={styles.app}>
        <header className="flex">
          <h1>Welcome to rx-recoil!</h1>
        </header>
        <main>
          <section>
            <ExampleOption
              {...{ setVisibleSample, visibleSample }}
              value="temperature"
              label="Mutable selector"
            />
            <ExampleOption
              {...{ setVisibleSample, visibleSample }}
              value="counter"
              label="Persisted state"
            />
            <ExampleOption
              {...{ setVisibleSample, visibleSample }}
              value="todoQuery"
              label="Load remote data with useQuery"
            />
          </section>
          {visibleSample === 'temperature' && <Temperature />}
          {visibleSample === 'counter' && <Counter />}
          {visibleSample === 'todoQuery' && <TodoQuery />}
        </main>
      </div>
    </StateRoot>
  );
}

export default App;
