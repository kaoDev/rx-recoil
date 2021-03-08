import { useEffect } from 'react';
import {
  BehaviorSubject,
  from,
  isObservable,
  merge,
  Observable,
  of,
} from 'rxjs';
import { map, mergeMap, tap } from 'rxjs/operators';
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
  InternalStateAccess,
  MutatableSelectorDefinition,
  MutatableState,
  ReadOnlyState,
  ReadonlyStateValue,
  SelectorDefinition,
  StateDefinition,
  StateReadAccess,
  StateType,
  StateWriteAccess,
} from './types';

// read-only selector
export function selector<Value>(
  read: (stateAccess: StateReadAccess) => Value
): SelectorDefinition<Value>;
export function selector<Value>(
  read: (stateAccess: StateReadAccess) => Promise<Value> | Observable<Value>
): SelectorDefinition<Value | EMPTY_TYPE>;
// writable derived selector
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => Value,
  write: (stateAccess: StateWriteAccess, update: Update) => void
): MutatableSelectorDefinition<Value, Update>;
export function selector<Value, Update>(
  read: (stateAccess: StateReadAccess) => Promise<Value> | Observable<Value>,
  write: (stateAccess: StateWriteAccess, update: Update) => void
): MutatableSelectorDefinition<Value | EMPTY_TYPE, Update>;

export function selector<Value, Update>(
  read: (
    stateAccess: StateReadAccess
  ) => Value | Promise<Value> | Observable<Value>,
  write?: (stateAccess: StateWriteAccess, update: Update) => void
): SelectorDefinition<Value> | MutatableSelectorDefinition<Value, Update> {
  if (write) {
    return {
      key: Symbol(),
      type: StateType.MutatableSelector,
      read,
      write,
    };
  }
  return {
    key: Symbol(),
    type: StateType.Selector,
    read,
  };
}

export function createSelector<Value, Update>(
  selectorDefinition:
    | SelectorDefinition<Value>
    | MutatableSelectorDefinition<Value, Update>,
  stateAccess: InternalStateAccess,
  usageId: symbol,
  report?: ErrorReporter
):
  | ReadOnlyState<Value | EMPTY_TYPE>
  | MutatableState<Value | EMPTY_TYPE, Update> {
  const dependencies = new Set<ReadonlyStateValue<any>>();

  function getSourceSubscribing<Value>(
    definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>
  ) {
    const value$ = stateAccess.getSource(definition, usageId);
    if (!dependencies.has(value$)) {
      dependencies.add(value$);
    }
    return value$;
  }

  const subscribingStateAccess: StateReadAccess = {
    getSource: getSourceSubscribing,
    getAsync: function getAsync<Value>(
      definition: StateDefinition<Value, any>
    ) {
      return stateAccess.getAsync(definition, usageId);
    },
    get: function get<Value>(
      definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>
    ) {
      const value$ = getSourceSubscribing(definition);
      return value$.value;
    },
  };

  const publicStateAccess = createPublicStateReadAccess(stateAccess, usageId);

  const initialValue = selectorDefinition.read(subscribingStateAccess);

  const value$ = new BehaviorSubject(
    isPromise(initialValue) || isObservable(initialValue)
      ? EMPTY_VALUE
      : initialValue
  );
  const onError = reportError(report);

  function useValue() {
    useEffect(() => {
      const subscription = merge(...dependencies)
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
          })
        )
        .subscribe(
          (nextValue: Value) => {
            value$.next(nextValue);
          },
          (error) =>
            reportError(report)(error, `Exception in selector value stream`)
        );

      return () => subscription.unsubscribe();
    }, []);

    return useObservablueValue(value$, onError);
  }

  let dispatchUpdate: undefined | ((change: Update) => void) = undefined;

  if (Object.prototype.hasOwnProperty.call(selectorDefinition, 'write')) {
    const publicStateAccess = createPublicStateWriteAccess(
      stateAccess,
      usageId
    );

    dispatchUpdate = function dispatchUpdate(change: Update) {
      (selectorDefinition as MutatableSelectorDefinition<Value, Update>).write(
        publicStateAccess,
        change
      );
    };
    return {
      useValue,
      value$,
      key: selectorDefinition.key,
      dispatchUpdate,
    };
  }

  return {
    useValue,
    value$,
    key: selectorDefinition.key,
  };
}
