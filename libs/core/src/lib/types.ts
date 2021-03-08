import { BehaviorSubject, Observable } from 'rxjs';

export const EMPTY_VALUE = Symbol('EMPTY_VALUE');
export type EMPTY_TYPE = typeof EMPTY_VALUE;

export type StateValue<Value> = BehaviorSubject<Value>;

export type ReadonlyStateValue<Value> = Observable<Value> & {
  value: Value;
};

export interface InternalStateAccess {
  getSource<Value>(
    definition: StateDefinition<Value, any>,
    useId: symbol
  ): ReadonlyStateValue<Value>;
  getAsync<Value>(
    definition: StateDefinition<Value, any>,
    useId: symbol
  ): ReadOnlyState<Value>;
  get<Value>(definition: StateDefinition<Value, any>, useId: symbol): Value;
  set<Value, UpdateEvent>(
    definition: MutatableStateDefinition<Value, UpdateEvent>,
    useId: symbol,
    change: UpdateEvent
  ): void;
}

export interface StateReadAccess {
  getSource<Value>(
    definition: StateDefinition<Value, any>
  ): ReadonlyStateValue<Value>;
  getAsync<Value>(
    definition: StateDefinition<Value, any>
  ): ReadOnlyState<Value>;
  get<Value>(definition: StateDefinition<Value, any>): Value;
}

export interface StateWriteAccess extends StateReadAccess {
  set<Value, UpdateEvent>(
    definition: MutatableStateDefinition<Value, UpdateEvent>,
    change: UpdateEvent
  ): void;
}

export enum StateType {
  Atom,
  Selector,
  MutatableSelector,
}

export interface BaseStateDefinition {
  key: symbol;
  debugKey?: string;
}

export type UpdateFunction<Value, Update> = (
  state: Value,
  change: Update
) => Value;

type OptionalCleanup = void | (() => void) | Promise<void | (() => void)>;

export interface AtomDefinition<Value, UpdateEvent>
  extends BaseStateDefinition {
  initialValue: Value;
  type: StateType.Atom;
  update: UpdateFunction<Value, UpdateEvent>;
  onMount?: (stateAccess: StateWriteAccess) => OptionalCleanup;
}

export interface SelectorDefinition<Value> extends BaseStateDefinition {
  type: StateType.Selector;
  read: (
    stateAccess: StateReadAccess
  ) => Value | Promise<Value> | Observable<Value>;
  onMount?: (stateAccess: StateWriteAccess) => OptionalCleanup;
}

export interface MutatableSelectorDefinition<Value, Update>
  extends BaseStateDefinition {
  type: StateType.MutatableSelector;
  read: (
    stateAccess: StateReadAccess
  ) => Value | Promise<Value> | Observable<Value>;
  write: (stateAccess: StateWriteAccess, change: Update) => void;
  onMount?: (stateAccess: StateWriteAccess) => OptionalCleanup;
}

export interface ReadOnlyState<Value> extends BaseStateDefinition {
  useValue: () => Value;
  value$: ReadonlyStateValue<Value>;
}

export interface MutatableState<Value, UpdateEvent>
  extends ReadOnlyState<Value> {
  dispatchUpdate: (value: UpdateEvent) => void;
}

export type MutatableStateDefinition<Value, UpdateEvent> =
  | AtomDefinition<Value, UpdateEvent>
  | MutatableSelectorDefinition<Value, UpdateEvent>;
export type ReadOnlyStateDefinition<Value> = SelectorDefinition<Value>;
export type StateDefinition<Value, UpdateEvent> =
  | MutatableStateDefinition<Value, UpdateEvent>
  | ReadOnlyStateDefinition<Value>;

export type RegisteredState<Value, UpdateEvent> =
  | ReadOnlyState<Value>
  | MutatableState<Value, UpdateEvent>;
