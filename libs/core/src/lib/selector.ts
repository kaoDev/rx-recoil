import { BehaviorSubject, from, merge, of, Unsubscribable } from 'rxjs';
import { map, mergeMap } from 'rxjs/operators';
import { createUseValueHook, isPromise, isSubscribable } from './helpers';
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
  SubscribableOrPromise,
} from './types';

interface SelectorOptions<Value> {
  debugKey?: string;
  volatile?: boolean;
  initialValue?: Value;
}

// read-only selector
export function selector<Value>(
  read: (stateAccess: StateReadAccess) => Value,
  options?: SelectorOptions<Value>,
): SelectorDefinition<Value>;
export function selector<Value>(
  read: (stateAccess: StateReadAccess) => SubscribableOrPromise<Value>,
  options?: SelectorOptions<Value>,
): SelectorDefinition<Value | EMPTY_TYPE>;
// writable derived selector
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => Value,
  write: (stateAccess: StateWriteAccess, update: Update) => void,
  options?: SelectorOptions<Value>,
): MutatableSelectorDefinition<Value, Update>;
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => SubscribableOrPromise<Value>,
  write: (stateAccess: StateWriteAccess, update: Update) => void,
  options?: SelectorOptions<Value>,
): MutatableSelectorDefinition<Value | EMPTY_TYPE, Update>;
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => Value | SubscribableOrPromise<Value>,
  write?:
    | ((stateAccess: StateWriteAccess, update: Update) => void)
    | SelectorOptions<Value>,
  options?: SelectorOptions<Value>,
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
      ...options,
    };
  }
  return {
    key: Symbol(),
    type: StateType.Selector,
    read,
    ...options,
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
      (isPromise(initialValue) || isSubscribable(initialValue)
        ? selectorDefinition.initialValue ?? EMPTY_VALUE
        : initialValue),
  );
  const onError = reportError(report);

  let initialValueSubscription: undefined | Unsubscribable;

  if (isPromise(initialValue) || isSubscribable(initialValue)) {
    initialValueSubscription = (isSubscribable(initialValue)
      ? initialValue
      : from(initialValue)
    ).subscribe(
      (nextValue: Value) => {
        value$.next(nextValue);
      },
      (error) =>
        reportError(report)(
          error,
          `Exception reading intial value for selector`,
        ),
    );
  }

  const subscription =
    // eslint-disable-next-line prefer-spread
    merge
      .apply(
        null,
        Array.from(dependencies).map(({ state }) => state.value$),
      )
      .pipe(
        map(() => selectorDefinition.read(publicStateAccess)),
        mergeMap((value) => {
          if (isSubscribable(value)) {
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

  const {
    useValue,
    subscription: valueHookSubscription,
  } = createUseValueHook(selectorDefinition.key, value$, (e) =>
    onError(e, `Exception in selector value stream`),
  );

  function onUnmount() {
    subscription.unsubscribe();
    valueHookSubscription.unsubscribe();
    initialValueSubscription?.unsubscribe();
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
