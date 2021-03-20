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
  );
}

const stateContext = createStateContextValue();
export function App() {
  const [visibleSample, setVisibleSample] = useState('counter');

  useEffect(() => {
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
              value="counter"
              label="Counter"
            />
            <ExampleOption
              {...{ setVisibleSample, visibleSample }}
              value="temperature"
              label="Temperature"
            />
            <ExampleOption
              {...{ setVisibleSample, visibleSample }}
              value="todoQuery"
              label="Todo Query"
            />
          </section>
          {visibleSample === 'counter' && <Counter />}
          {visibleSample === 'temperature' && <Temperature />}
          {visibleSample === 'todoQuery' && <TodoQuery />}
        </main>
      </div>
    </StateRoot>
  );
}

export default App;
