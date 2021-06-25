import React, {
  createContext,
  ReactNode,
  useContext,
  useRef,
  useState,
  useEffect,
} from 'react';
import { createAtom } from './atom';
import { ErrorReporter } from './reportError';
import { createSelector } from './selector';
import { createPublicStateWriteAccess } from './stateAccess';
import {
  AtomDefinition,
  EMPTY_TYPE,
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
  SubscribableOrPromise,
  UsageKey,
} from './types';

function cleanupUsage({
  rootState,
  usageId,
  stateMap,
  stateSleepCache,
}: {
  stateSleepCache: Map<StateKey, unknown>;
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
        stateSleepCache,
      });
    }
  }

  if (!rootState.state.volatile) {
    stateSleepCache.set(rootState.state.key, rootState.state.value$.value);
  }

  if (rootState.refs.size === 0) {
    rootState.onUnmount?.();
    stateMap.delete(rootState.state.key);
  }
}

function registerStateUsage(
  stateObject: InternalRegisteredState<unknown, unknown>,
  usageId?: UsageKey,
) {
  if (usageId !== undefined && usageId !== stateObject.state.key) {
    stateObject.refs.add(usageId);
  }
}

function getStateObject<Value, UpdateEvent>(
  stateMap: Map<StateKey, InternalRegisteredState<unknown, unknown>>,
  stateSleepCache: Map<StateKey, unknown>,
  definition: StateDefinition<Value, UpdateEvent>,
  createStateObject: () => InternalRegisteredState<Value, UpdateEvent>,
  stateAcces: InternalStateAccess,
): InternalRegisteredState<Value, UpdateEvent> {
  let state = stateMap.get(definition.key);

  if (!state) {
    state = createStateObject();
    stateMap.set(definition.key, state);

    if (definition.onMount) {
      const publicStateAccess = createPublicStateWriteAccess(
        stateAcces,
        definition.key,
      );
      const cleanUp = definition.onMount?.(publicStateAccess);

      const sharedStateObject = stateMap.get(definition.key);
      const originalOnUnmount = sharedStateObject?.onUnmount;

      if (sharedStateObject) {
        sharedStateObject.onUnmount = () => {
          sharedStateObject.onUnmount = undefined;
          cleanupUsage({
            rootState: sharedStateObject,
            usageId: sharedStateObject.state.key,
            stateMap,
            stateSleepCache,
          });
          if (cleanUp) {
            Promise.all([cleanUp]).then(([mountingCleanup]) => {
              if (mountingCleanup) mountingCleanup();
            });
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
  stateSleepCache: Map<StateKey, unknown>,
  stateAcces: InternalStateAccess,
  report?: ErrorReporter,
) {
  function getState<Value, UpdateEvent>(
    definition: StateDefinition<Value, UpdateEvent>,
    usageId?: UsageKey,
  ): InternalRegisteredState<Value, UpdateEvent> {
    switch (definition.type) {
      case StateType.Atom: {
        const atom = getStateObject(
          stateMap,
          stateSleepCache,
          definition,
          () => createAtom(definition, stateSleepCache, report),
          stateAcces,
        );
        registerStateUsage(atom, usageId);
        return atom;
      }
      case StateType.Selector:
      case StateType.MutatableSelector: {
        const selector = getStateObject(
          stateMap,
          stateSleepCache,
          definition,
          () => createSelector(definition, stateSleepCache, stateAcces, report),
          stateAcces,
        );

        registerStateUsage(selector, usageId);
        return selector as InternalRegisteredState<Value, UpdateEvent>;
      }
    }
  }

  getState.stateMap = stateMap;
  getState.stateSleepCache = stateSleepCache;

  return getState;
}

export function createStateContextValue(report?: ErrorReporter) {
  const stateMap = new Map<
    StateKey,
    InternalRegisteredState<unknown, unknown>
  >();
  const stateSleepCache = new Map<StateKey, unknown>();

  const internalStateAcces: InternalStateAccess = {
    getStateObject: function getStateObject<Value>(
      definition: StateDefinition<Value, unknown>,
      usageId: UsageKey,
    ) {
      const state = contextGetter<Value, unknown>(definition, usageId);
      return state;
    },
    get: function get<Value>(
      definition: StateDefinition<Value, unknown>,
      usageId: UsageKey,
    ) {
      const { state } = contextGetter<Value, unknown>(definition, usageId);
      return (state as ReadOnlyState<Value>).value$.value;
    },
    set: function set<Value, UpdateEvent>(
      definition: MutatableStateDefinition<Value, UpdateEvent>,
      usageId: UsageKey,
      change: UpdateEvent,
    ) {
      const { state } = contextGetter(definition, usageId);
      (state as MutatableState<Value, UpdateEvent>).dispatchUpdate(change);
    },
  };

  const contextGetter = createGetState(
    stateMap,
    stateSleepCache,
    internalStateAcces,
    report,
  );

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
    () => context ?? createStateContextValue(report),
  );
  return (
    <stateContext.Provider value={context ?? fallbackContextValue}>
      {children}
    </stateContext.Provider>
  );
}

type UnpackedAsyncValue<T> = T extends SubscribableOrPromise<infer U>
  ? U | EMPTY_TYPE
  : T;

export function useAtomicState<Value>(
  identifier: SelectorDefinition<Value>,
): ReadOnlyState<UnpackedAsyncValue<Value>>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: MutatableSelectorDefinition<Value, UpdateEvent>,
): MutatableState<UnpackedAsyncValue<Value>, UpdateEvent>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: AtomDefinition<Value, UpdateEvent>,
): MutatableState<Value, UpdateEvent>;
export function useAtomicState<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>,
) {
  const stateReference = useAtomicStateInternal(
    identifier as AtomDefinition<Value, UpdateEvent>,
  );

  return stateReference.state;
}

function useAtomicStateInternal<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>,
) {
  const getStateObject = useContext(stateContext);
  if (!getStateObject) {
    throw new Error('rx-recoil StateRoot context is missing');
  }
  const usageId = useRef(Symbol(`usage:${identifier.debugKey}`));
  const stateReference = useRef<InternalRegisteredState<Value, UpdateEvent>>();
  const registered = useRef(false);

  if (
    !stateReference.current ||
    stateReference.current.state.key !== identifier.key
  ) {
    stateReference.current = getStateObject(identifier, usageId.current);
    registered.current = false;
  }

  if (!registered.current) {
    stateReference.current?.refs.delete(usageId.current);
  }

  const registeredStateObject = stateReference.current;

  useEffect(() => {
    registerStateUsage(registeredStateObject, usageId.current);
    registered.current = true;

    return () => {
      cleanupUsage({
        rootState: registeredStateObject,
        usageId: usageId.current,
        stateMap: getStateObject.stateMap,
        stateSleepCache: getStateObject.stateSleepCache,
      });
    };
  }, [
    getStateObject.stateMap,
    getStateObject.stateSleepCache,
    registeredStateObject,
    registeredStateObject.state.key,
  ]);

  return stateReference.current;
}

export function useAtom<Value>(
  identifier: SelectorDefinition<Value>,
  options?: { sync?: boolean },
): [value: Exclude<UnpackedAsyncValue<Value>, EMPTY_TYPE>, _: never];
export function useAtom<Value, UpdateEvent>(
  identifier: MutatableSelectorDefinition<Value, UpdateEvent>,
  options?: { sync?: boolean },
): [
  value: Exclude<UnpackedAsyncValue<Value>, EMPTY_TYPE>,
  dispatchUpdate: (value: UpdateEvent) => void,
];
export function useAtom<Value, UpdateEvent>(
  identifier: AtomDefinition<Value, UpdateEvent>,
  options?: { sync?: boolean },
): [
  value: Exclude<Value, EMPTY_TYPE>,
  dispatchUpdate: (value: UpdateEvent) => void,
];
export function useAtom<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>,
  { sync }: { sync?: boolean } = {},
) {
  const stateReference = useAtomicStateInternal(
    identifier as AtomDefinition<Value | EMPTY_TYPE, UpdateEvent>,
  );

  const value = stateReference.state.useValue(sync);

  return [
    value,
    (stateReference.state as MutatableState<Value, UpdateEvent>).dispatchUpdate,
  ] as const;
}

export function useAtomRaw<Value>(
  identifier: SelectorDefinition<Value>,
  options?: { sync?: boolean },
): [value: UnpackedAsyncValue<Value>, _: never];
export function useAtomRaw<Value, UpdateEvent>(
  identifier: MutatableSelectorDefinition<Value, UpdateEvent>,
  options?: { sync?: boolean },
): [
  value: UnpackedAsyncValue<Value>,
  dispatchUpdate: (value: UpdateEvent) => void,
];
export function useAtomRaw<Value, UpdateEvent>(
  identifier: AtomDefinition<Value, UpdateEvent>,
  options?: { sync?: boolean },
): [value: Value, dispatchUpdate: (value: UpdateEvent) => void];
export function useAtomRaw<Value, UpdateEvent>(
  identifier: StateDefinition<Value, UpdateEvent>,
  { sync }: { sync?: boolean } = {},
) {
  const { useValueRaw, dispatchUpdate } = useAtomicState(
    identifier as AtomDefinition<Value, UpdateEvent>,
  );

  const value = useValueRaw(sync);

  return [value, dispatchUpdate] as const;
}
