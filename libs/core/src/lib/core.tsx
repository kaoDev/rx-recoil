import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import type { Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { createAtom } from './atom';
import { ErrorReporter } from './reportError';
import {
  createAsyncSelector,
  createMutableSelector,
  createSelector,
} from './selector';
import { createPublicStateWriteAccess } from './stateAccess';
import {
  AsyncSelector,
  AsyncSelectorDefinition,
  Atom,
  AtomDefinition,
  EMPTY_TYPE,
  EMPTY_VALUE,
  InternalStateAccess,
  MutatableSelector,
  MutatableSelectorDefinition,
  MutatableState,
  MutatableStateDefinition,
  ReadOnlyAsyncState,
  ReadOnlyState,
  RegisteredState,
  Selector,
  SelectorDefinition,
  StateDefinition,
  StateType,
  SyncStateDefinition,
} from './types';

function cleanupStateObject(
  stateMap: Map<symbol, SharedState>,
  usageMap: Map<symbol, Set<symbol>>,
  stateKey: symbol,
  useId: symbol
) {
  const state = stateMap.get(stateKey);
  const dependencies = usageMap.get(stateKey);

  if (state && dependencies) {
    dependencies.delete(useId);

    if (dependencies.size === 0) {
      state.onUnmount?.();
      stateMap.delete(stateKey);
    }
  }
}

function addStateObject<StateObject extends RegisteredState<any, any>>(
  stateMap: Map<symbol, SharedState>,
  stateKey: symbol,
  createStateObject: () => StateObject,
  onMount?: () => void
) {
  let state = stateMap.get(stateKey);

  if (!state) {
    state = {
      state: createStateObject(),
    };

    stateMap.set(stateKey, state);

    onMount?.();
  }

  return state.state as StateObject;
}

function registerStateUsage(
  usageMap: Map<symbol, Set<symbol>>,
  stateKey: symbol,
  usageId: symbol
) {
  let dependencies = usageMap.get(stateKey);
  if (!dependencies) {
    dependencies = new Set();
    usageMap.set(stateKey, dependencies);
  }
  dependencies.add(usageId);
}

function createAddState(
  stateMap: Map<symbol, SharedState>,
  usageMap: Map<symbol, Set<symbol>>,
  stateAcces: InternalStateAccess,
  report?: ErrorReporter
) {
  function addState<Value, UpdateEvent>(
    definition: StateDefinition<Value, UpdateEvent>,
    useId: symbol
  ) {
    switch (definition.type) {
      case StateType.Atom: {
        const onMount = definition.onMount
          ? () => {
              const publicStateAccess = createPublicStateWriteAccess(
                stateAcces,
                definition.key
              );
              const cleanUp = definition.onMount?.(publicStateAccess);
              const sharedStateObject = stateMap.get(definition.key);
              if (sharedStateObject) {
                sharedStateObject.onUnmount = async () => {
                  sharedStateObject.onUnmount = undefined;
                  cleanupStateObject(
                    stateMap,
                    usageMap,
                    definition.key,
                    definition.key
                  );
                  if (cleanUp) {
                    const mountingCleanup = await cleanUp;
                    if (mountingCleanup) mountingCleanup();
                  }
                };
              }
            }
          : undefined;
        const atom = addStateObject(
          stateMap,
          definition.key,
          () => createAtom(definition, report),
          onMount
        );

        return atom;
      }
      case StateType.Selector: {
        const selector = addStateObject(stateMap, definition.key, () =>
          createSelector(definition, stateAcces, useId, report)
        );

        return selector;
      }
      case StateType.AsyncSelector: {
        const selector = addStateObject(stateMap, definition.key, () =>
          createAsyncSelector(definition, stateAcces, useId, report)
        );

        return selector;
      }
      case StateType.MutatableSelector: {
        const selector = addStateObject(stateMap, definition.key, () =>
          createMutableSelector(definition, stateAcces, useId, report)
        );

        return selector;
      }
    }
  }

  addState.stateMap = stateMap;
  addState.usageMap = usageMap;

  return addState;
}

interface SharedState {
  state: RegisteredState<any, any>;
  onUnmount?: () => void;
}

export function createStateContextValue(report?: ErrorReporter) {
  const stateMap = new Map<symbol, SharedState>();
  const usageMap = new Map<symbol, Set<symbol>>();

  function getSource<Value>(
    definition: SyncStateDefinition<Value, unknown>,
    useId: symbol
  ) {
    const state = contextGetter<Value, unknown>(
      definition,
      useId
    ) as ReadOnlyState<Value>;
    return state.value$;
  }

  const internalStateAcces: InternalStateAccess = {
    getSource,
    getFull: function getFull<Value>(
      definition: StateDefinition<Value, unknown>,
      useId: symbol
    ) {
      const state = contextGetter<Value, unknown>(definition, useId) as
        | ReadOnlyState<Value>
        | ReadOnlyAsyncState<Value>;
      return state;
    },
    get: function get<Value>(
      definition: SyncStateDefinition<Value, unknown>,
      useId: symbol
    ) {
      const value$ = getSource(definition, useId);
      return value$.value;
    },
    set: function set<Value, UpdateEvent>(
      definition: MutatableStateDefinition<Value, UpdateEvent>,
      useId: symbol,
      change: UpdateEvent
    ) {
      const state = contextGetter(definition, useId) as MutatableState<
        Value,
        UpdateEvent
      >;
      state.dispatchUpdate(change);
    },
  };

  const contextGetter = createAddState(
    stateMap,
    usageMap,
    internalStateAcces,
    report
  );

  return contextGetter;
}

export const stateContext = createContext(createStateContextValue());

export function StateRoot({
  children,
  report,
  context,
}: {
  children?: ReactNode;
  report?: ErrorReporter;
  context?: ReturnType<typeof createStateContextValue>;
}) {
  const [contextValue] = useState(
    () => context ?? createStateContextValue(report)
  );

  return (
    <stateContext.Provider value={contextValue}>
      {children}
    </stateContext.Provider>
  );
}

let c = 0;

export function useAtomicState<Value>(
  identifier: SelectorDefinition<Value>
): Selector<Value>;
export function useAtomicState<Value>(
  identifier: AsyncSelectorDefinition<Value>
): AsyncSelector<Value>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: MutatableSelectorDefinition<Value, UpdateEvent>
): MutatableSelector<Value, UpdateEvent>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: AtomDefinition<Value, UpdateEvent>
): Atom<Value, UpdateEvent>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>
) {
  const getStateObject = useContext(stateContext);
  const usageId = useRef(Symbol(`${identifier.debugKey}:${c++}`));

  useEffect(() => {
    const usageId = Symbol(`${identifier.debugKey}:${c++}`);
    registerStateUsage(getStateObject.usageMap, identifier.key, usageId);

    return () => {
      cleanupStateObject(
        getStateObject.stateMap,
        getStateObject.usageMap,
        identifier.key,
        usageId
      );
    };
  }, [getStateObject, identifier, usageId]);

  return getStateObject(identifier, usageId.current);
}

export function useMutableState<Value, UpdateEvent>(
  identifier:
    | AtomDefinition<Value, UpdateEvent>
    | MutatableSelectorDefinition<Value, UpdateEvent>
) {
  const { useState } = useAtomicState(
    identifier as AtomDefinition<Value, UpdateEvent>
  );

  return useState();
}

export function useAtomicValue<Value>(
  identifier: AtomDefinition<Value, any>
): Value;
export function useAtomicValue<Value>(
  identifier: SelectorDefinition<Value>
): Value;
export function useAtomicValue<Value>(
  identifier: AsyncSelectorDefinition<Value>
): Value | EMPTY_TYPE;
export function useAtomicValue<Value>(
  identifier:
    | AtomDefinition<Value, any>
    | SelectorDefinition<Value>
    | AsyncSelectorDefinition<Value>
) {
  const { useValue } = useAtomicState(
    identifier as AtomDefinition<Value, unknown>
  );

  return useValue();
}

export function useSuspendedAtomicValue<Value>(
  identifier: AtomDefinition<Value | EMPTY_TYPE, any>
): Value;
export function useSuspendedAtomicValue<Value>(
  identifier: SelectorDefinition<Value | EMPTY_TYPE>
): Value;
export function useSuspendedAtomicValue<Value>(
  identifier: AsyncSelectorDefinition<Value | EMPTY_TYPE>
): Value | EMPTY_TYPE;
export function useSuspendedAtomicValue<Value>(
  identifier:
    | AtomDefinition<Value | EMPTY_TYPE, any>
    | SelectorDefinition<Value | EMPTY_TYPE>
    | AsyncSelectorDefinition<Value | EMPTY_TYPE>
) {
  const { value$, useValue } = useAtomicState(
    identifier as AtomDefinition<Value | EMPTY_TYPE, any>
  );

  const value = useValue();

  if (value === EMPTY_VALUE) {
    throw (value$ as Observable<Value | EMPTY_TYPE>)
      .pipe(
        filter((val): val is Value => val !== EMPTY_VALUE),
        take(1)
      )
      .toPromise();
  }

  return value;
}

export function useSuspendedMutableState<Value, UpdateEvent>(
  identifier:
    | AtomDefinition<Value | EMPTY_TYPE, UpdateEvent>
    | MutatableSelectorDefinition<Value | EMPTY_TYPE, UpdateEvent>
) {
  const { value$, useValue, dispatchUpdate } = useAtomicState(
    identifier as AtomDefinition<Value | EMPTY_TYPE, UpdateEvent>
  );

  const value = useValue();

  if (value === EMPTY_VALUE) {
    throw (value$ as Observable<Value | EMPTY_TYPE>)
      .pipe(
        filter((val): val is Value => val !== EMPTY_VALUE),
        take(1)
      )
      .toPromise();
  }

  return [value, dispatchUpdate] as const;
}
