import { useEffect, useState } from 'react';
import { BehaviorSubject } from 'rxjs';
import { useObservablueValue } from './helpers';
import { ErrorReporter, reportError } from './reportError';
import {
  AtomDefinition,
  MutatableState,
  StateType,
  UpdateFunction,
} from './types';

const identity: UpdateFunction<any, any> = (_, change) => change;

export function atom<Value, UpdateEvent = Value>(
  initialValue: Value,
  {
    update = identity,
    debugKey,
  }: {
    update?: UpdateFunction<Value, UpdateEvent>;
    debugKey?: string;
  } = {}
): AtomDefinition<Value, UpdateEvent> {
  return {
    key: Symbol(),
    initialValue,
    type: StateType.Atom,
    update,
    debugKey,
  };
}

export function createAtom<Value, UpdateEvent = Value>(
  atomDefinition: AtomDefinition<Value, UpdateEvent>,
  report?: ErrorReporter
) {
  const value$ = new BehaviorSubject(atomDefinition.initialValue);

  function dispatchUpdate(change: UpdateEvent) {
    const current = value$.value;
    const next = atomDefinition.update(current, change);
    if (next !== current) {
      value$.next(next);
    }
  }

  const onError = reportError(report);

  function useValue() {
    return useObservablueValue(value$, onError);
  }

  const atom: MutatableState<Value, UpdateEvent> = {
    useValue,
    dispatchUpdate,
    value$,
    key: atomDefinition.key,
    debugKey: atomDefinition.debugKey,
  };

  return atom;
}
