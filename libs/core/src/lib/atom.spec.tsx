import { cleanup } from '@testing-library/react';
import { act, renderHook } from '@testing-library/react-hooks';
import { atom } from './atom';
import { StateRoot, useAtom } from './core';

describe('rx-recoil atom functionality', () => {
  afterEach(() => {
    cleanup();
  });

  it('should provide access to the initial value of an atom', async () => {
    const testAtom = atom('test', {
      debugKey: 'testAtom',
    });

    const { result } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
    });

    expect(result.current[0]).toBe('test');
  });

  it('should provide access to the initial value of an atom with lazy initialization', async () => {
    const testAtom = atom(() => 'test', {
      debugKey: 'testAtom',
    });

    const { result } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
    });

    expect(result.current[0]).toBe('test');
  });

  it('should provide access to the update function for tha atom state, and return the updated value', async () => {
    const testAtom = atom('test', {
      debugKey: 'testAtom',
    });

    const { result } = renderHook(() => useAtom(testAtom), {
      wrapper: StateRoot,
    });

    act(() => {
      result.current[1]('updated value');
    });
    expect(result.current[0]).toBe('updated value');
  });
});
