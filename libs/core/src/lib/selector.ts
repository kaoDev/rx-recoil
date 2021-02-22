import { useEffect, useState } from 'react';
import { BehaviorSubject, from, merge } from 'rxjs';
import { startWith } from 'rxjs/operators';
import { ErrorReporter, reportError } from './reportError';
import {
  createPublicAsyncStateReadAccess,
  createPublicStateWriteAccess,
  createPublicSyncStateReadAccess,
} from './stateAccess';
import {
  AsyncSelector,
  AsyncSelectorDefinition,
  AtomDefinition,
  EMPTY_TYPE,
  EMPTY_VALUE,
  InternalStateAccess,
  MutatableSelector,
  MutatableSelectorDefinition,
  ReadonlyAsyncStateValue,
  Selector,
  SelectorDefinition,
  StateType,
  SyncStateReadAccess,
} from './types';

export function selector<Value>(
  get: SelectorDefinition<Value>['get']
): SelectorDefinition<Value> {
  return {
    key: Symbol(),
    type: StateType.Selector,
    get,
  };
}

export function mutableSelector<Value, UpdateEvent>(
  get: MutatableSelectorDefinition<Value, UpdateEvent>['get'],
  set: MutatableSelectorDefinition<Value, UpdateEvent>['set']
): MutatableSelectorDefinition<Value, UpdateEvent> {
  return {
    key: Symbol(),
    type: StateType.MutatableSelector,
    get,
    set,
  };
}

export function asyncSelector<Value>(
  get: AsyncSelectorDefinition<Value>['get']
): AsyncSelectorDefinition<Value> {
  return {
    key: Symbol(),
    type: StateType.AsyncSelector,
    get,
  };
}

export function createSelector<Value>(
  selectorDefinition: SelectorDefinition<Value>,
  stateAccess: InternalStateAccess,
  useId: symbol,
  report?: ErrorReporter
): Selector<Value> {
  const dependencies = new Set<ReadonlyAsyncStateValue<any>>();

  function getSourceSubscribing<Value>(
    definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>
  ) {
    const value$ = stateAccess.getSource(definition, useId);
    if (!dependencies.has(value$)) {
      dependencies.add(value$);
    }
    return value$;
  }

  const subscribingStateAccess: SyncStateReadAccess = {
    getSource: getSourceSubscribing,
    get: function get<Value>(
      definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>
    ) {
      const value$ = getSourceSubscribing(definition);
      return value$.value;
    },
  };

  const publicStateAccess = createPublicSyncStateReadAccess(stateAccess, useId);

  const initialValue = selectorDefinition.get(subscribingStateAccess);

  const value$ = new BehaviorSubject(initialValue);

  function useValue() {
    const [state, setState] = useState(() => value$.value);

    useEffect(() => {
      const subscription = merge(...dependencies).subscribe(
        () => {
          const nextValue = selectorDefinition.get(publicStateAccess);
          setState(nextValue);
        },
        (error) =>
          reportError(report)(error, `Exception in selector value stream`)
      );

      return () => subscription.unsubscribe();
    }, []);

    return state;
  }

  return {
    useValue,
    value$,
    type: StateType.Selector,
    key: selectorDefinition.key,
  };
}

export function createMutableSelector<Value, UpdateEvent>(
  selectorDefinition: MutatableSelectorDefinition<Value, UpdateEvent>,
  stateAccess: InternalStateAccess,
  useId: symbol,
  report?: ErrorReporter
): MutatableSelector<Value, UpdateEvent> {
  const selector = createSelector(
    {
      ...selectorDefinition,
      type: StateType.Selector,
    },
    stateAccess,
    useId,
    report
  );

  const publicStateAccess = createPublicStateWriteAccess(stateAccess, useId);

  function dispatchUpdate(change: UpdateEvent) {
    selectorDefinition.set(publicStateAccess, change);
  }

  function useState() {
    const value = selector.useValue();
    return [value, dispatchUpdate] as const;
  }

  return {
    ...selector,
    type: StateType.MutatableSelector,
    dispatchUpdate,
    useState,
  };
}

export function createAsyncSelector<Value>(
  selectorDefinition: AsyncSelectorDefinition<Value>,
  stateAccess: InternalStateAccess,
  useId: symbol,
  report?: ErrorReporter
): AsyncSelector<Value> {
  const publicStateAccess = createPublicAsyncStateReadAccess(
    stateAccess,
    useId
  );

  const value$ = from(selectorDefinition.get(publicStateAccess)).pipe(
    startWith(EMPTY_VALUE)
  );

  function useValue() {
    const [state, setState] = useState<Value | EMPTY_TYPE>(() => EMPTY_VALUE);

    useEffect(() => {
      const subscription = value$.subscribe(
        (nextValue) => {
          setState(nextValue);
        },
        (error) =>
          reportError(report)(error, `Exception in selector  value stream`)
      );

      return () => subscription.unsubscribe();
    }, []);

    return state;
  }

  return {
    useValue,
    value$,
    type: StateType.AsyncSelector,
    key: selectorDefinition.key,
  };
}
