import { useEffect, useState } from 'react';
import { BehaviorSubject } from 'rxjs';
import { ErrorReporter, reportError } from './reportError';
import { Atom, AtomDefinition, StateType, UpdateFunction } from './types';

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

  function useAtomState() {
    const [state, setState] = useState(() => value$.value);

    useEffect(() => {
      const subscription = value$.subscribe(
        (value) => {
          setState(value);
        },
        (error) => reportError(report)(error, `Exception in atom value stream`)
      );

      return () => subscription.unsubscribe();
    }, []);

    return [state, dispatchUpdate] as const;
  }

  function useValue() {
    return useAtomState()[0];
  }

  const atom: Atom<Value, UpdateEvent> = {
    useState: useAtomState,
    useValue,
    dispatchUpdate,
    value$,
    type: StateType.Atom,
    key: atomDefinition.key,
    debugKey: atomDefinition.debugKey,
  };

  return atom;
}
