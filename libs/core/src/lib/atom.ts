import { BehaviorSubject } from 'rxjs';
import { useObservablueValue } from './helpers';
import { ErrorReporter, reportError } from './reportError';
import {
  AtomDefinition,
  InternalRegisteredState,
  MutatableState,
  StateKey,
  StateType,
  UpdateFunction,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const identity: UpdateFunction<any, any> = (_, change) => change;

export function atom<Value, UpdateEvent = Value>(
  initialValue: Value,
  {
    update = identity,
    debugKey,
    volatile,
  }: {
    update?: UpdateFunction<Value, UpdateEvent>;
    debugKey?: string;
    volatile?: boolean;
  } = {},
): AtomDefinition<Value, UpdateEvent> {
  return {
    key: Symbol('ATO:' + debugKey),
    initialValue,
    type: StateType.Atom,
    update,
    debugKey,
    volatile,
  };
}

export function createAtom<Value, UpdateEvent = Value>(
  atomDefinition: AtomDefinition<Value, UpdateEvent>,
  stateSleepCache: Map<StateKey, unknown>,
  report?: ErrorReporter,
): InternalRegisteredState<Value, UpdateEvent> {
  const initialValueFromSleep = stateSleepCache.get(atomDefinition.key) as
    | Value
    | undefined;
  const value$ = new BehaviorSubject(
    initialValueFromSleep ?? atomDefinition.initialValue,
  );

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
    volatile: atomDefinition.volatile,
  };

  return { state: atom, refs: new Set() };
}
