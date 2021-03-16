import React, {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { Observable } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { createAtom } from './atom';
import { ErrorReporter } from './reportError';
import { createSelector } from './selector';
import { createPublicStateWriteAccess } from './stateAccess';
import {
  AtomDefinition,
  EMPTY_TYPE,
  EMPTY_VALUE,
  InternalRegisteredState,
  InternalStateAccess,
  MutatableSelectorDefinition,
  MutatableState,
  MutatableStateDefinition,
  ReadOnlyState,
  SelectorDefinition,
  StateDefinition,
  StateKey,
  StateType,
  UsageKey,
} from './types';

function cleanupUsage({
  rootState,
  usageId,
  stateMap,
}: {
  rootState: InternalRegisteredState<unknown, unknown>;
  stateMap: Map<StateKey, InternalRegisteredState<unknown, unknown>>;
  usageId: UsageKey;
}) {
  rootState.refs.delete(usageId);

  if (rootState.refs.size === 0 && rootState.dependencies) {
    for (const dependency of rootState.dependencies) {
      cleanupUsage({
        rootState: dependency,
        usageId: rootState.state.key,
        stateMap,
      });
    }
  }

  if (rootState.refs.size === 0) {
    rootState.onUnmount?.();
    stateMap.delete(rootState.state.key);
  }
}

function registerStateUsage(
  stateObject: InternalRegisteredState<unknown, unknown>,
  usageId: UsageKey
) {
  if (usageId !== stateObject.state.key) {
    stateObject.refs.add(usageId);
  }
}

function getStateObject<Value, UpdateEvent>(
  stateMap: Map<StateKey, InternalRegisteredState<unknown, unknown>>,
  definition: StateDefinition<Value, UpdateEvent>,
  createStateObject: () => InternalRegisteredState<Value, UpdateEvent>,
  stateAcces: InternalStateAccess
): InternalRegisteredState<Value, UpdateEvent> {
  let state = stateMap.get(definition.key);

  if (!state) {
    state = createStateObject();
    stateMap.set(definition.key, state);

    if (definition.onMount) {
      const publicStateAccess = createPublicStateWriteAccess(
        stateAcces,
        state.state.key
      );
      const cleanUp = definition.onMount?.(publicStateAccess);

      const sharedStateObject = stateMap.get(definition.key);
      const originalOnUnmount = sharedStateObject?.onUnmount;

      if (sharedStateObject) {
        sharedStateObject.onUnmount = async () => {
          sharedStateObject.onUnmount = undefined;
          cleanupUsage({
            rootState: sharedStateObject,
            usageId: sharedStateObject.state.key,
            stateMap,
          });
          if (cleanUp) {
            const mountingCleanup = await cleanUp;
            if (mountingCleanup) mountingCleanup();
          }
          originalOnUnmount?.();
        };
      }
    }
  }

  return state as InternalRegisteredState<Value, UpdateEvent>;
}

function createGetState(
  stateMap: Map<StateKey, InternalRegisteredState<unknown, unknown>>,
  stateAcces: InternalStateAccess,
  report?: ErrorReporter
) {
  function getState<Value, UpdateEvent>(
    definition: StateDefinition<Value, UpdateEvent>,
    usageId: UsageKey,
    internal: boolean
  ): InternalRegisteredState<Value, UpdateEvent> {
    switch (definition.type) {
      case StateType.Atom: {
        const atom = getStateObject(
          stateMap,
          definition,
          () => createAtom(definition, report),
          stateAcces
        );
        if (internal) registerStateUsage(atom, usageId);
        return atom;
      }
      case StateType.Selector:
      case StateType.MutatableSelector: {
        const selector = getStateObject(
          stateMap,
          definition,
          () => createSelector(definition, stateAcces, report),
          stateAcces
        );

        if (internal) registerStateUsage(selector, usageId);
        return selector as InternalRegisteredState<Value, UpdateEvent>;
      }
    }
  }

  getState.stateMap = stateMap;

  return getState;
}

export function createStateContextValue(report?: ErrorReporter) {
  const stateMap = new Map<
    StateKey,
    InternalRegisteredState<unknown, unknown>
  >();

  const internalStateAcces: InternalStateAccess = {
    getStateObject: function getStateObject<Value>(
      definition: StateDefinition<Value, unknown>,
      usageId: UsageKey,
      internal: boolean
    ) {
      const state = contextGetter<Value, unknown>(
        definition,
        usageId,
        internal
      );
      return state;
    },
    get: function get<Value>(
      definition: StateDefinition<Value, unknown>,
      usageId: UsageKey,
      internal: boolean
    ) {
      const { state } = contextGetter<Value, unknown>(
        definition,
        usageId,
        internal
      );
      return (state as ReadOnlyState<Value>).value$.value;
    },
    set: function set<Value, UpdateEvent>(
      definition: MutatableStateDefinition<Value, UpdateEvent>,
      usageId: UsageKey,
      change: UpdateEvent,
      internal: boolean
    ) {
      const { state } = contextGetter(definition, usageId, internal);
      (state as MutatableState<Value, UpdateEvent>).dispatchUpdate(change);
    },
  };

  const contextGetter = createGetState(stateMap, internalStateAcces, report);

  return contextGetter;
}

type StateRootContextValueType = ReturnType<typeof createStateContextValue>;

// initialize with null to enforce usage of StateRoot provider with controlled context
// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
const stateContext = createContext(null! as StateRootContextValueType);

export function StateRoot({
  children,
  report,
  context,
}: {
  children?: ReactNode;
  report?: ErrorReporter;
  context?: ReturnType<typeof createStateContextValue>;
}) {
  const [fallbackContextValue] = useState(
    () => context ?? createStateContextValue(report)
  );

  return (
    <stateContext.Provider value={context ?? fallbackContextValue}>
      {children}
    </stateContext.Provider>
  );
}

export function useAtomicState<Value>(
  identifier: SelectorDefinition<Value>
): ReadOnlyState<Value>;
export function useAtomicState<Value, UpdateEvent>(
  identifier:
    | AtomDefinition<Value, UpdateEvent>
    | MutatableSelectorDefinition<Value, UpdateEvent>
): MutatableState<Value, UpdateEvent>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>
) {
  const getStateObject = useContext(stateContext);
  if (!getStateObject) {
    throw new Error('rx-recoil StateRoot context is missing');
  }
  const [usageId] = useState(() => Symbol(`usage:${identifier.debugKey}`));

  const [stateReference, setStateReference] = useState(() =>
    getStateObject(identifier, usageId, false)
  );

  useEffect(() => {
    const registeredStateObject = getStateObject(identifier, usageId, false);
    registerStateUsage(registeredStateObject, usageId);

    if (registeredStateObject !== stateReference) {
      setStateReference(stateReference);
    }

    return () => {
      cleanupUsage({
        rootState: registeredStateObject,
        usageId,
        stateMap: getStateObject.stateMap,
      });
    };
  }, [getStateObject, identifier, usageId, stateReference]);

  return stateReference.state;
}

export function useAtom<Value>(
  identifier: SelectorDefinition<Value>
): [value: Exclude<Value, EMPTY_TYPE>, _: never];
export function useAtom<Value, UpdateEvent>(
  identifier:
    | MutatableSelectorDefinition<Value, UpdateEvent>
    | AtomDefinition<Value, UpdateEvent>
): [
  value: Exclude<Value, EMPTY_TYPE>,
  dispatchUpdate: (value: UpdateEvent) => void
];
export function useAtom<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>
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

export function useAtomRaw<Value>(
  identifier: SelectorDefinition<Value>
): [value: Value, _: never];
export function useAtomRaw<Value, UpdateEvent>(
  identifier:
    | MutatableSelectorDefinition<Value, UpdateEvent>
    | AtomDefinition<Value, UpdateEvent>
): [value: Value, dispatchUpdate: (value: UpdateEvent) => void];
export function useAtomRaw<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>
) {
  const { useValue, dispatchUpdate } = useAtomicState(
    identifier as AtomDefinition<Value, UpdateEvent>
  );

  const value = useValue();

  return [value, dispatchUpdate] as const;
}
