import { cleanup } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import { act } from 'react-dom/test-utils';
import { Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { atom } from './atom';
import { createStateContextValue, StateRoot, useAtom } from './core';
import { selector } from './selector';

describe('rx-recoil core functionality', () => {
  afterEach(() => {
    cleanup();
  });

  it('should register the state in the context', async () => {
    const testAtom = atom('test');

    const stateRootValue = createStateContextValue();

    renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(stateRootValue.stateMap.size).toBe(1);
  });

  it('should cleanup the state from context when it is not rendered anymore', async () => {
    const testAtom = atom('test');

    const stateRootValue = createStateContextValue();

    const { unmount } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(stateRootValue.stateMap.size).toBe(1);
    unmount();
    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should cleanup selector state when it is not used anymore', async () => {
    const testAtom = atom('test', { debugKey: 'test atom for selector' });
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const stateRootValue = createStateContextValue();

    const { unmount } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(stateRootValue.stateMap.size).toBe(2);
    unmount();
    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should cleanup selector state when it is not used anymore with nested selector dependencies', async () => {
    const testAtom = atom('test', { debugKey: 'atom' });
    const testSelector1 = selector(({ get }) => get(testAtom) + 'Selector');
    const testSelector2 = selector(
      ({ get }) => get(testSelector1) + 'Selector',
    );
    const testSelector3 = selector(
      ({ get }) => get(testSelector2) + 'Selector',
    );

    const stateRootValue = createStateContextValue();

    const hook = renderHook(() => useAtom(testSelector3), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const hook2 = renderHook(() => useAtom(testSelector3), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(stateRootValue.stateMap.size).toBe(4);
    hook.unmount();
    expect(stateRootValue.stateMap.size).toBe(4);
    hook2.unmount();
    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should correctly register and cleanup state even when it gets interrupted by other suspense throws', async () => {
    const syncState = atom('test', { debugKey: 'atom' });
    const trigger = new Subject<string>();
    const selectorPromise = trigger.pipe(take(1)).toPromise();
    const asyncState = selector(() => selectorPromise);

    function useBothStates() {
      const [syncValue] = useAtom(syncState);
      const [asyncValue] = useAtom(asyncState);

      return { syncValue, asyncValue };
    }

    const stateRootValue = createStateContextValue();

    const hook = renderHook(() => useBothStates(), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(hook.result.current).toBe(undefined);
    // expect(stateRootValue.stateMap.size).toBe(0);
    await act(async () => {
      trigger.next('delayed');
      await selectorPromise;
      hook.rerender();
    });
    expect(hook.result.current).toEqual({
      syncValue: 'test',
      asyncValue: 'delayed',
    });
    expect(stateRootValue.stateMap.size).toBe(2);

    hook.unmount();
    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should cleanup selector states step by step', async () => {
    const testAtom = atom('test', { debugKey: 'atom' });
    const testSelector1 = selector(({ get }) => get(testAtom) + 'Selector');
    const testSelector2 = selector(
      ({ get }) => get(testSelector1) + 'Selector',
    );
    const testSelector3 = selector(
      ({ get }) => get(testSelector2) + 'Selector',
    );

    const stateRootValue = createStateContextValue();

    const hook3 = renderHook(() => useAtom(testSelector3), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const hook2 = renderHook(() => useAtom(testSelector2), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const hook1 = renderHook(() => useAtom(testSelector1), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const hook0 = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(stateRootValue.stateMap.size).toBe(4);
    hook3.unmount();
    expect(stateRootValue.stateMap.size).toBe(3);
    hook2.unmount();
    expect(stateRootValue.stateMap.size).toBe(2);
    hook1.unmount();
    expect(stateRootValue.stateMap.size).toBe(1);
    hook0.unmount();
    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should remount state with the last value before it was unmounted', async () => {
    const testAtom = atom('test');

    const stateRootValue = createStateContextValue();

    const { unmount, result, rerender } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(result.current[0]).toBe('test');
    act(() => {
      result.current[1]('changed value');
    });
    rerender();
    expect(result.current[0]).toBe('changed value');
    unmount();
    const { result: result2 } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    expect(result2.current[0]).toBe('changed value');
  });

  it('should remount state with the fresh initial value for volatile state', async () => {
    const testAtom = atom('test', { volatile: true });

    const stateRootValue = createStateContextValue();

    const { unmount, result, rerender } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(result.current[0]).toBe('test');
    act(() => {
      result.current[1]('changed value');
    });
    rerender();
    expect(result.current[0]).toBe('changed value');
    unmount();
    const { result: result2 } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    expect(result2.current[0]).toBe('test');
  });

  it('should change a state synchronously', async () => {
    const testAtom = atom('test', { volatile: true });

    const { result } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
    });

    expect(result.current[0]).toBe('test');
    act(() => {
      result.current[1]('changed value');
    });
    expect(result.current[0]).toBe('changed value');
  });

  it('should run the mounting callback for atoms if available', async () => {
    const testAtom = atom('test');
    testAtom.onMount = jest.fn();

    const stateRootValue = createStateContextValue();

    renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(testAtom.onMount).toBeCalledTimes(1);
  });

  it('should run the mounting cleanup when state is unmounted', async () => {
    const testAtom = atom('test');
    const cleanUp = jest.fn();
    testAtom.onMount = jest.fn(() => cleanUp);

    const stateRootValue = createStateContextValue();

    const { unmount } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(testAtom.onMount).toBeCalledTimes(1);
    unmount();
    await new Promise((res) => setTimeout(res, 0));
    expect(cleanUp).toBeCalledTimes(1);
  });

  it('should throw an error when used without rx-recoil StateRoot', async () => {
    const testAtom = atom('test');

    const { result } = renderHook(() => useAtom(testAtom));

    expect(result.error).toMatchInlineSnapshot(
      `[Error: rx-recoil StateRoot context is missing]`,
    );
  });
});
