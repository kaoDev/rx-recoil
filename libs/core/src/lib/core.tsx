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
  StateType,
} from './types';

function cleanupStateObject({
  stateMap,
  usageMap,
  usageId,
  stateKey,
}: {
  stateMap: Map<symbol, InternalRegisteredState<unknown, unknown>>;
  usageMap: Map<symbol, Set<symbol>>;
  stateKey: symbol;
  usageId: symbol;
}) {
  const stateObject = stateMap.get(stateKey);
  const dependencies = usageMap.get(stateKey);

  if (stateObject) {
    dependencies?.delete(usageId);
    if (stateObject.dependencies) {
      for (const dep of stateObject.dependencies) {
        cleanupStateObject({
          stateMap,
          usageMap,
          usageId,
          stateKey: dep.key,
        });
      }
    }

    if (dependencies === undefined || dependencies.size === 0) {
      stateObject.onUnmount?.();
      stateMap.delete(stateKey);
    }
  }
}

function addStateObject<
  StateObject extends InternalRegisteredState<unknown, unknown>
>(
  stateMap: Map<symbol, InternalRegisteredState<unknown, unknown>>,
  stateKey: symbol,
  createStateObject: () => StateObject,
  onMount?: () => void
) {
  let state = stateMap.get(stateKey);

  if (!state) {
    state = createStateObject();

    stateMap.set(stateKey, state);

    onMount?.();
  }

  return state as StateObject;
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
  stateMap: Map<symbol, InternalRegisteredState<unknown, unknown>>,
  usageMap: Map<symbol, Set<symbol>>,
  stateAcces: InternalStateAccess,
  report?: ErrorReporter
) {
  function addState<Value, UpdateEvent>(
    definition: StateDefinition<Value, UpdateEvent>,
    usageId: symbol
  ) {
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
              cleanupStateObject({
                stateMap,
                usageMap,
                usageId: definition.key,
                stateKey: definition.key,
              });
              if (cleanUp) {
                const mountingCleanup = await cleanUp;
                if (mountingCleanup) mountingCleanup();
              }
            };
          }
        }
      : undefined;
    switch (definition.type) {
      case StateType.Atom: {
        const atom = addStateObject(
          stateMap,
          definition.key,
          () => createAtom(definition, report),
          onMount
        );

        return atom;
      }
      case StateType.Selector:
      case StateType.MutatableSelector: {
        const selector = addStateObject(
          stateMap,
          definition.key,
          () => createSelector(definition, stateAcces, usageId, report),
          onMount
        );

        return selector;
      }
    }
  }

  addState.stateMap = stateMap;
  addState.usageMap = usageMap;

  return addState;
}

export function createStateContextValue(report?: ErrorReporter) {
  const stateMap = new Map<symbol, InternalRegisteredState<unknown, unknown>>();
  const usageMap = new Map<symbol, Set<symbol>>();

  const internalStateAcces: InternalStateAccess = {
    getStateObject: function getStateObject<Value>(
      definition: StateDefinition<Value, unknown>,
      usageId: symbol
    ) {
      const { state } = contextGetter<Value, unknown>(definition, usageId);
      return state as ReadOnlyState<Value>;
    },
    get: function get<Value>(
      definition: StateDefinition<Value, unknown>,
      usageId: symbol
    ) {
      const { state } = contextGetter<Value, unknown>(definition, usageId);
      return (state as ReadOnlyState<Value>).value$.value;
    },
    set: function set<Value, UpdateEvent>(
      definition: MutatableStateDefinition<Value, UpdateEvent>,
      usageId: symbol,
      change: UpdateEvent
    ) {
      const { state } = contextGetter(definition, usageId);
      (state as MutatableState<Value, UpdateEvent>).dispatchUpdate(change);
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
  const [fallbackContextValue] = useState(() =>
    createStateContextValue(report)
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
  const usageId = useRef(Symbol(`${identifier.debugKey}`));

  useEffect(() => {
    const currentUsageId = usageId.current;
    registerStateUsage(getStateObject.usageMap, identifier.key, currentUsageId);

    return () => {
      cleanupStateObject({
        stateMap: getStateObject.stateMap,
        usageMap: getStateObject.usageMap,
        stateKey: identifier.key,
        usageId: currentUsageId,
      });
    };
  }, [getStateObject, identifier, usageId]);

  return getStateObject(identifier, usageId.current).state;
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
