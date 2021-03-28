import {
  createStateContextValue,
  StateRoot,
  useAtom,
  useAtomRaw,
} from '@rx-recoil/core';
import { cleanup, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { act } from 'react-dom/test-utils';
import { persistedAtom, StorageAccess } from './persistence';

async function tick() {
  await new Promise((res) => setTimeout(res));
}

describe('Persistence atom', () => {
  afterEach(() => {
    cleanup();
  });

  it('should start with the fallback value if no value is stored', async () => {
    const storage: StorageAccess = {
      getItem: jest.fn(() => null),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
    });
    const { result } = renderHook(() => useAtom(persistedState), {
      wrapper: StateRoot,
    });
    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    await tick();

    expect(result.current[0]).toBe('fallbackValue');
  });

  it('should restore state from storage', async () => {
    const storage: StorageAccess = {
      getItem: jest.fn(() =>
        JSON.stringify({ version: 0, value: 'valueFromStore' }),
      ),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const deserialize = jest.fn(
      (serialized: string, _version: number) => serialized,
    );

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
      deserialize,
    });

    const { result } = renderHook(() => useAtom(persistedState), {
      wrapper: StateRoot,
    });
    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    await tick();
    expect(result.current[0]).toBe('valueFromStore');
  });

  it('should update the value stored in storage when shared state changes', async () => {
    const storage: StorageAccess = {
      getItem: jest.fn(() =>
        JSON.stringify({ version: 0, value: 'valueFromStore' }),
      ),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
    });

    const { result } = renderHook(() => useAtom(persistedState), {
      wrapper: StateRoot,
    });
    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    await tick();

    act(() => {
      result.current[1]('changed state');
    });

    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));

    expect(storage.setItem).toBeCalledWith(
      '__RX_RECOIL_STATE:test',
      JSON.stringify({ version: 0, value: JSON.stringify('changed state') }),
    );
  });

  it('should be completely unmounted when no hook is using persisted state', async () => {
    const storage: StorageAccess = {
      getItem: jest.fn(() =>
        JSON.stringify({ version: 0, value: 'valueFromStore' }),
      ),
      removeItem: jest.fn(),
      setItem: jest.fn(),
    };

    const persistedState = persistedAtom({
      key: 'test',
      storage,
      fallbackValue: 'fallbackValue',
      version: 0,
      debugKey: 'DEBUG',
    });

    const stateContext = createStateContextValue();

    const { result, unmount } = renderHook(() => useAtomRaw(persistedState), {
      wrapper: StateRoot,
      initialProps: { context: stateContext },
    });
    await waitFor(() => expect(storage.getItem).toHaveBeenCalledTimes(1));
    await tick();

    act(() => {
      result.current[1]('changed state');
    });

    await waitFor(() => expect(storage.setItem).toHaveBeenCalledTimes(1));

    expect(storage.setItem).toBeCalledWith(
      '__RX_RECOIL_STATE:test',
      JSON.stringify({ version: 0, value: JSON.stringify('changed state') }),
    );

    unmount();

    await tick();
    expect(stateContext.stateMap.get(persistedState.key)).toMatchInlineSnapshot(
      `undefined`,
    );
    expect(stateContext.stateMap.size).toBe(0);
  });
});
