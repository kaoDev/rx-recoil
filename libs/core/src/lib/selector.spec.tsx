import { cleanup } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react-hooks';
import { Subject } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { atom } from './atom';
import {
  createStateContextValue,
  StateRoot,
  useAtom,
  useAtomRaw,
} from './core';
import { selector } from './selector';
import { EMPTY_VALUE } from './types';
describe.only('rx-recoil selector functionality', () => {
  afterEach(() => {
    cleanup();
  });

  it('should provide derived value from a selector', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
    });
    expect(result.current[0]).toBe('testSelector');
  });

  it('should be able to use a stat atom multiple times', async () => {
    const testAtom = atom('test');
    const testSelector = selector(
      ({ get }) => get(testAtom) + ' ' + get(testAtom),
    );

    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
    });
    expect(result.current[0]).toBe('test test');
  });

  it('should provide no update function for a readonly selector', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
    });
    expect(result.current[1]).toBe(undefined);
  });

  it('should provide a working update function for a mutable selector', async () => {
    const testAtom = atom('test');
    const testSelector = selector(
      ({ get }) => get(testAtom) + 'Selector',
      ({ set }, change: string) => {
        set(testAtom, change);
      },
    );

    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
    });
    act(() => result.current[1]('updated'));
    expect(result.current[0]).toBe('updatedSelector');
  });

  it('should create a readonly selector when second argument is a config object', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector', {
      debugKey: 'test debug',
      volatile: true,
    });

    expect(testSelector.debugKey).toBe('test debug');
    expect(testSelector.volatile).toBe(true);
  });

  it('should update a derived value, when the root values is changed', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const { result } = renderHook(
      () => {
        return { selector: useAtom(testSelector), atom: useAtom(testAtom) };
      },
      {
        wrapper: StateRoot,
      },
    );
    expect(result.current.selector[0]).toBe('testSelector');

    act(() => result.current.atom[1]('changedAtom'));

    expect(result.current.atom[0]).toBe('changedAtom');
    expect(result.current.selector[0]).toBe('changedAtomSelector');
  });

  it('should update a derived value, when the root values is changed', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const stateRootValue = createStateContextValue();

    const {
      result: {
        current: [, updateAtom],
      },
    } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    expect(result.current[0]).toBe('testSelector');

    act(() => updateAtom('changedAtom'));
    expect(result.current[0]).toBe('changedAtomSelector');
  });

  it('should provide access to async data via promises', async () => {
    const trigger = new Subject<string>();
    const selectorPromise = trigger.pipe(take(1)).toPromise();
    const testSelector = selector(() => selectorPromise);

    const { result } = renderHook(() => useAtomRaw(testSelector), {
      wrapper: StateRoot,
    });
    expect(result.current[0]).toBe(EMPTY_VALUE);
    await act(async () => {
      trigger.next('delayed');
      await selectorPromise;
    });
    expect(result.current[0]).toBe('delayed');
  });

  it('should provide access to async data via promises suspended', async () => {
    const trigger = new Subject<string>();
    const selectorPromise = trigger.pipe(take(1)).toPromise();
    const testSelector = selector(() => selectorPromise);

    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
    });
    expect(result.current).toBe(undefined);
    await act(async () => {
      trigger.next('delayed');
      await selectorPromise;
    });
    expect(result.current[0]).toBe('delayed');
  });

  it('should provide access to async data via observable', async () => {
    const trigger = new Subject<string>();
    const selectorPromise = trigger.pipe(take(1)).toPromise();
    const testSelector = selector(() => trigger);

    const { result } = renderHook(() => useAtomRaw(testSelector), {
      wrapper: StateRoot,
    });
    expect(result.current[0]).toBe(EMPTY_VALUE);
    await act(async () => {
      trigger.next('delayed');
      await selectorPromise;
    });
    expect(result.current[0]).toBe('delayed');
  });

  it('should provide access to async data via observable suspended', async () => {
    const trigger = new Subject<string>();
    const selectorPromise = trigger.pipe(take(1)).toPromise();
    const testSelector = selector(() => trigger);

    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
    });
    // suspended current value is undefined
    expect(result.current).toBe(undefined);
    await act(async () => {
      trigger.next('delayed');
      await selectorPromise;
    });
    expect(result.current[0]).toBe('delayed');
  });

  it('should provide access to complex async observable data', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ getStateObject }) => {
      return getStateObject(testAtom).value$.pipe(
        map((atomValue) => atomValue.length),
      );
    });

    const stateRootValue = createStateContextValue();

    const {
      result: {
        current: [, updateAtom],
      },
    } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(result.current[0]).toBe(4);

    await act(async () => {
      updateAtom('test test');
    });
    expect(result.current[0]).toBe(9);
  });

  it('should provide access to complex async promise data', async () => {
    const testAtom = atom(
      new Promise<string>((resolve) => resolve('test')),
    );
    const testSelector = selector(({ get }) => {
      return get(testAtom);
    });

    const stateRootValue = createStateContextValue();

    const {
      result: {
        current: [, updateAtom],
      },
    } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });
    const { result } = renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    expect(result.current).toBe(undefined);
    await new Promise((res) => setTimeout(res, 1));
    expect(result.current[0]).toBe('test');

    await act(async () => {
      const atomTrigger = new Subject<string>();
      const atomPromise = atomTrigger.toPromise();
      updateAtom(atomPromise);
      atomTrigger.next('delayed value');
      atomTrigger.complete();
      await atomPromise;
    });
    expect(result.current[0]).toBe('delayed value');
  });

  it('should report errors on initial selector values', async () => {
    const trigger = new Subject<string>();
    const selectorPromise = trigger.pipe(take(1)).toPromise();
    const testSelector = selector(() => selectorPromise);

    const report = jest.fn();
    const stateRootValue = createStateContextValue(report);

    renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    await act(async () => {
      trigger.error('crash');
    });
    expect(report).toBeCalledWith(
      Error('Exception reading intial value for selector'),
    );
  });

  it('should report errors on subsequent updates', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => {
      const shouldCrash = get(testAtom) === 'crash';

      if (shouldCrash) throw new Error('test crash');

      return get(testAtom);
    });

    const report = jest.fn();
    const stateRootValue = createStateContextValue(report);

    const {
      result: {
        current: [, updateAtom],
      },
    } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    renderHook(() => useAtom(testSelector), {
      wrapper: StateRoot,
      initialProps: { context: stateRootValue },
    });

    await act(async () => {
      updateAtom('crash');
    });

    expect(report).toBeCalledWith(Error('test crash'));
  });
});
