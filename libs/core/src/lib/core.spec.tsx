import { render, cleanup } from '@testing-library/react';
import React from 'react';
import { atom } from './atom';
import { createStateContextValue, StateRoot, useAtom } from './core';
import { selector } from './selector';
describe('rx-recoil core functionality', () => {
  beforeEach(() => {
    cleanup();
  });
  afterEach(() => {
    cleanup();
  });

  it('should provide access to the initial value of an atom', async () => {
    const testAtom = atom('test', {
      debugKey: 'testAtom',
    });
    const TestComponent = () => {
      const [value] = useAtom(testAtom);

      expect(value).toBe('test');

      return <div data-testid="1">{value}</div>;
    };

    render(
      <StateRoot>
        <TestComponent />
      </StateRoot>
    );
  });

  it('should register the state in the context', async () => {
    const testAtom = atom('test');

    const stateRootValue = createStateContextValue();

    const TestComponent = () => {
      const [value] = useAtom(testAtom);

      return <div data-testid="1">{value}</div>;
    };

    render(
      <StateRoot context={stateRootValue}>
        <TestComponent />
      </StateRoot>
    );

    expect(stateRootValue.stateMap.size).toBe(1);
  });
  it('should cleanup the state from context when it is not rendered anymore', async () => {
    const testAtom = atom('test');

    const stateRootValue = createStateContextValue();

    const TestComponent = () => {
      const [value] = useAtom(testAtom);

      return <div data-testid="1">{value}</div>;
    };

    const { rerender } = render(
      <StateRoot context={stateRootValue}>
        <TestComponent />
      </StateRoot>
    );
    rerender(<StateRoot context={stateRootValue}></StateRoot>);

    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should provide derived value from a selector', async () => {
    const testAtom = atom('test');
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const TestComponent = () => {
      const [value] = useAtom(testSelector);

      expect(value).toBe('testSelector');

      return <div data-testid="1">{value}</div>;
    };

    render(
      <StateRoot>
        <TestComponent />
      </StateRoot>
    );
  });

  it('should cleanup selector state when it is not used anymore', async () => {
    const testAtom = atom('test', { debugKey: 'test atom for selector' });
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');

    const stateRootValue = createStateContextValue();

    const TestComponent = () => {
      const [value] = useAtom(testSelector);

      expect(value).toBe('testSelector');

      return <div data-testid="1">{value}</div>;
    };

    const { rerender } = render(
      <StateRoot context={stateRootValue}>
        <TestComponent />
      </StateRoot>
    );
    rerender(<StateRoot context={stateRootValue}></StateRoot>);

    expect(stateRootValue.stateMap.size).toBe(0);
  });

  it('should cleanup selector state when it is not used anymore for deep dependencies', async () => {
    const testAtom = atom('test', { debugKey: 'test atom for selector' });
    const testSelector = selector(({ get }) => get(testAtom) + 'Selector');
    const testSelector2 = selector(({ get }) => get(testSelector) + 'Selector');
    const testSelector3 = selector(
      ({ get }) => get(testSelector2) + 'Selector'
    );

    const stateRootValue = createStateContextValue();

    const TestComponent = () => {
      const [value] = useAtom(testSelector3);

      expect(value).toBe('testSelectorSelectorSelector');

      return <div data-testid="1">{value}</div>;
    };

    const { rerender } = render(
      <StateRoot context={stateRootValue}>
        <TestComponent />
      </StateRoot>
    );
    rerender(<StateRoot context={stateRootValue}></StateRoot>);

    expect(stateRootValue.stateMap.size).toBe(0);
  });
});
