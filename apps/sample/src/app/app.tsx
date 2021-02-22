import React, { useState } from 'react';

import styles from './app.module.css';
import { Counter } from './Counter';
import { Temperature } from './Temperature';

export function App() {
  const [visibleSample, setVisibleSample] = useState('counter');

  return (
    <div className={styles.app}>
      <header className="flex">
        <h1>Welcome to rx-recoil!</h1>
      </header>
      <main>
        <section>
          <label>
            <input
              type="radio"
              checked={visibleSample === 'counter'}
              onChange={(e) => {
                setVisibleSample((e.target as HTMLInputElement).value);
              }}
              value="counter"
              name="sample"
            />{' '}
            Counter
          </label>
          <label>
            <input
              type="radio"
              checked={visibleSample === 'temperature'}
              onChange={(e) => {
                setVisibleSample((e.target as HTMLInputElement).value);
              }}
              value="temperature"
              name="sample"
            />{' '}
            Temperature
          </label>
        </section>
        {visibleSample === 'counter' && <Counter />}
        {visibleSample === 'temperature' && <Temperature />}
      </main>
    </div>
  );
}

export default App;
