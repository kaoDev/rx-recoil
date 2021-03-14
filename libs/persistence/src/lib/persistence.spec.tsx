import { StateRoot, useAtom } from '@rx-recoil/core';
import { fireEvent, render, waitFor } from '@testing-library/react';
import React, { Suspense } from 'react';
import { persistedAtom, Storage } from './persistence';

describe('Persistence atom', () => {
  it('should start with the fallback value if no value is stored', async () => {
    const storage: Storage = {
      getItem: jest.fn(() => null),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const deserialize = jest.fn(
      (serialized: string, _version: number) => serialized
    );

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
      deserialize,
    });
    const TestComponent = () => {
      const [value] = useAtom(persistedState);

      return <div>{value}</div>;
    };

    const { baseElement, rerender } = render(
      <StateRoot>
        <Suspense fallback={'loading'}>
          <TestComponent />
        </Suspense>
      </StateRoot>
    );
    expect(baseElement).toBeTruthy();

    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(deserialize).not.toHaveBeenCalled());

    rerender(
      <StateRoot>
        <Suspense fallback={'loading'}>
          <TestComponent />
        </Suspense>
      </StateRoot>
    );

    expect(baseElement).toMatchInlineSnapshot(`
      <body>
        <div>
          <div>
            fallbackValue
          </div>
        </div>
      </body>
    `);
  });

  it('should restore state from storage', async () => {
    const storage: Storage = {
      getItem: jest.fn(() =>
        JSON.stringify({ version: 0, value: 'valueFromStore' })
      ),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const deserialize = jest.fn(
      (serialized: string, _version: number) => serialized
    );

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
      deserialize,
    });
    const TestComponent = () => {
      const [value] = useAtom(persistedState);

      return <div>{value}</div>;
    };

    const { baseElement, rerender } = render(
      <StateRoot>
        <Suspense fallback={'loading'}>
          <TestComponent />
        </Suspense>
      </StateRoot>
    );
    expect(baseElement).toBeTruthy();

    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(deserialize).toHaveBeenCalledTimes(1));

    expect(deserialize).toHaveBeenCalledWith('valueFromStore', 0);

    rerender(
      <StateRoot>
        <Suspense fallback={'loading'}>
          <TestComponent />
        </Suspense>
      </StateRoot>
    );

    expect(baseElement).toMatchInlineSnapshot(`
      <body>
        <div>
          <div>
            valueFromStore
          </div>
        </div>
      </body>
    `);
  });

  it('should update the value stored in storage when shared state changes', async () => {
    const storage: Storage = {
      getItem: jest.fn(() =>
        JSON.stringify({ version: 0, value: 'valueFromStore' })
      ),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const serialize = jest.fn((value: string) => value);

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
      serialize,
    });
    const TestComponent = () => {
      const [, setValue] = useAtom(persistedState);

      return (
        <button onClick={() => setValue('changed state')}>change state</button>
      );
    };

    const { baseElement, findByText } = render(
      <StateRoot>
        <Suspense fallback={'loading'}>
          <TestComponent />
        </Suspense>
      </StateRoot>
    );
    expect(baseElement).toBeTruthy();
    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));

    const button = await findByText('change state');
    fireEvent.click(button);

    await waitFor(() => expect(serialize).toBeCalledTimes(1));
    await waitFor(() => expect(serialize).toBeCalledWith('changed state'));
    expect(storage.setItem).toBeCalledWith(
      '__RX_RECOIL_STATE:test',
      JSON.stringify({ version: 0, value: 'changed state' })
    );
  });
});
