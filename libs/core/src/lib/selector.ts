import {
  BehaviorSubject,
  from,
  isObservable,
  merge,
  Observable,
  of,
} from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { isPromise, useObservablueValue } from './helpers';
import { ErrorReporter, reportError } from './reportError';
import {
  createPublicStateReadAccess,
  createPublicStateWriteAccess,
} from './stateAccess';
import {
  AtomDefinition,
  EMPTY_TYPE,
  EMPTY_VALUE,
  InternalRegisteredState,
  InternalStateAccess,
  MutatableSelectorDefinition,
  ReadOnlyStateDefinition,
  SelectorDefinition,
  StateKey,
  StateReadAccess,
  StateType,
  StateWriteAccess,
} from './types';

interface SelectorOptions {
  debugKey?: string;
  volatile?: boolean;
}

// read-only selector
export function selector<Value>(
  read: (stateAccess: StateReadAccess) => Value,
  options?: SelectorOptions,
): SelectorDefinition<Value>;
export function selector<Value>(
  read: (stateAccess: StateReadAccess) => Promise<Value> | Observable<Value>,
  options?: SelectorOptions,
): SelectorDefinition<Value | EMPTY_TYPE>;
// writable derived selector
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => Value,
  write: (stateAccess: StateWriteAccess, update: Update) => void,
  options?: SelectorOptions,
): MutatableSelectorDefinition<Value, Update>;
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => Promise<Value> | Observable<Value>,
  write: (stateAccess: StateWriteAccess, update: Update) => void,
  options?: SelectorOptions,
): MutatableSelectorDefinition<Value | EMPTY_TYPE, Update>;
export function selector<Value, Update>(
  read: (
    stateAccess: StateReadAccess,
  ) => Value | Promise<Value> | Observable<Value>,
  write?:
    | ((stateAccess: StateWriteAccess, update: Update) => void)
    | SelectorOptions,
  options?: SelectorOptions,
): SelectorDefinition<Value> | MutatableSelectorDefinition<Value, Update> {
  if (typeof write === 'object') {
    options = write;
    write = undefined;
  }

  if (write) {
    return {
      key: Symbol(),
      type: StateType.MutatableSelector,
      read,
      write,
      volatile: options?.volatile,
      debugKey: options?.debugKey,
    };
  }
  return {
    key: Symbol(),
    type: StateType.Selector,
    read,
    volatile: options?.volatile,
    debugKey: options?.debugKey,
  };
}

export function createSelector<Value, Update>(
  selectorDefinition:
    | SelectorDefinition<Value>
    | MutatableSelectorDefinition<Value, Update>,
  stateSleepCache: Map<StateKey, unknown>,
  stateAccess: InternalStateAccess,
  report?: ErrorReporter,
): InternalRegisteredState<Value | EMPTY_TYPE, Update> {
  const initialValueFromSleep = stateSleepCache.get(selectorDefinition.key) as
    | Value
    | undefined;
  const dependencies = new Set<InternalRegisteredState<unknown, unknown>>();

  function getStateSubscribing<Value>(
    definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>,
  ) {
    const state = stateAccess.getStateObject(
      definition,
      selectorDefinition.key,
      true,
    );
    if (!dependencies.has(state)) {
      dependencies.add(state);
    }
    return state.state;
  }

  const subscribingStateAccess: StateReadAccess = {
    getStateObject: function getStateObject<Value>(
      definition: ReadOnlyStateDefinition<Value>,
    ) {
      return getStateSubscribing(definition);
    },
    get: function get<Value>(
      definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>,
    ) {
      const state = getStateSubscribing(definition);
      return state.value$.value;
    },
  };

  const publicStateAccess = createPublicStateReadAccess(
    stateAccess,
    selectorDefinition.key,
  );

  const initialValue = selectorDefinition.read(subscribingStateAccess);

  const value$ = new BehaviorSubject(
    initialValueFromSleep ??
      (isPromise(initialValue) || isObservable(initialValue)
        ? EMPTY_VALUE
        : initialValue),
  );
  const onError = reportError(report);

  const subscription =
    //  merge(
    //   ...Array.from(dependencies).map(({ state }) => state.value$),
    // )
    // eslint-disable-next-line prefer-spread
    merge
      .apply(
        null,
        Array.from(dependencies).map(({ state }) => state.value$),
      )
      .pipe(
        map(() => selectorDefinition.read(publicStateAccess)),
        mergeMap((value) => {
          if (isObservable(value)) {
            return value;
          }
          if (isPromise(value)) {
            return from(value);
          }
          return of(value as Value);
        }),
      )
      .subscribe(
        (nextValue: Value) => {
          value$.next(nextValue);
        },
        (error) =>
          reportError(report)(error, `Exception in selector value stream`),
      );

  function onUnmount() {
    subscription.unsubscribe();
  }

  function useValue() {
    return useObservablueValue(value$, onError);
  }

  let dispatchUpdate: undefined | ((change: Update) => void) = undefined;

  if (Object.prototype.hasOwnProperty.call(selectorDefinition, 'write')) {
    const publicStateAccess = createPublicStateWriteAccess(
      stateAccess,
      selectorDefinition.key,
    );

    dispatchUpdate = function dispatchUpdate(change: Update) {
      (selectorDefinition as MutatableSelectorDefinition<Value, Update>).write(
        publicStateAccess,
        change,
      );
    };

    return {
      state: {
        useValue,
        value$,
        key: selectorDefinition.key,
        dispatchUpdate,
        debugKey: selectorDefinition.debugKey,
        volatile: selectorDefinition.volatile,
      },
      dependencies,
      onUnmount,
      refs: new Set(),
    };
  }

  return {
    state: {
      useValue,
      value$,
      key: selectorDefinition.key,
      debugKey: selectorDefinition.debugKey,
      volatile: selectorDefinition.volatile,
    },
    dependencies,
    onUnmount,
    refs: new Set(),
  };
}
