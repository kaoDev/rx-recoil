import { BehaviorSubject, Observable } from 'rxjs';

export const EMPTY_VALUE = Symbol('EMPTY_VALUE');
export type EMPTY_TYPE = typeof EMPTY_VALUE;

export type StateValue<Value> = BehaviorSubject<Value>;

export type ReadonlyAsyncStateValue<Value> = Observable<Value>;
export type ReadonlySyncStateValue<Value> = Observable<Value> & {
  value: Value;
};

export interface InternalStateAccess {
  getFull<Value>(
    definition: StateDefinition<Value, any>,
    useId: symbol
  ): ReadOnlyState<Value> | ReadOnlyAsyncState<Value>;
  get<Value>(definition: SyncStateDefinition<Value, any>, useId: symbol): Value;
  getSource<Value>(
    definition: SyncStateDefinition<Value, any>,
    useId: symbol
  ): ReadonlySyncStateValue<Value>;
  set<Value, UpdateEvent>(
    definition: MutatableStateDefinition<Value, UpdateEvent>,
    useId: symbol,
    change: UpdateEvent
  ): void;
}

export interface InternalStateReadAccess {
  get<Value>(
    definition: StateDefinition<Value, any>,
    useId: symbol
  ): ReadOnlyState<Value> | ReadOnlyAsyncState<Value>;
}
export interface SyncStateReadAccess {
  get<Value>(definition: SyncStateDefinition<Value, any>): Value;
  getSource<Value>(
    definition: SyncStateDefinition<Value, any>
  ): ReadonlySyncStateValue<Value>;
}

export interface StateWriteAccess extends SyncStateReadAccess {
  set<Value, UpdateEvent>(
    definition: MutatableStateDefinition<Value, UpdateEvent>,
    change: UpdateEvent
  ): void;
}
export interface StateReadAccess {
  get<Value>(
    definition: StateDefinition<Value, any>
  ): ReadOnlyState<Value> | ReadOnlyAsyncState<Value>;
}

export enum StateType {
  Atom,
  Selector,
  AsyncSelector,
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
  get: (stateAccess: SyncStateReadAccess) => Value;
}
export interface AsyncSelectorDefinition<Value> extends BaseStateDefinition {
  type: StateType.AsyncSelector;
  get: (
    stateAccess: StateReadAccess
  ) => Observable<Value | EMPTY_TYPE> | Promise<Value | EMPTY_TYPE>;
}
export interface MutatableSelectorDefinition<Value, UpdateEvent>
  extends BaseStateDefinition {
  type: StateType.MutatableSelector;
  get: (stateAccess: SyncStateReadAccess) => Value;
  set: (stateAccess: StateWriteAccess, change: UpdateEvent) => void;
}

export interface ReadOnlyState<Value> extends BaseStateDefinition {
  useValue: () => Value;
  value$: ReadonlySyncStateValue<Value>;
}
export interface ReadOnlyAsyncState<Value> extends BaseStateDefinition {
  useValue: () => EMPTY_TYPE | Value;
  value$: ReadonlyAsyncStateValue<Value | EMPTY_TYPE>;
}

export interface MutatableState<Value, UpdateEvent>
  extends ReadOnlyState<Value> {
  useState: () => readonly [Value, (change: UpdateEvent) => void];
  dispatchUpdate: (value: UpdateEvent) => void;
}

export interface Atom<Value, UpdateEvent = Value>
  extends MutatableState<Value, UpdateEvent> {
  type: StateType.Atom;
}

export interface Selector<Value> extends ReadOnlyState<Value> {
  type: StateType.Selector;
}
export interface AsyncSelector<Value> extends ReadOnlyAsyncState<Value> {
  type: StateType.AsyncSelector;
}

export interface MutatableSelector<Value, UpdateEvent = Value>
  extends MutatableState<Value, UpdateEvent> {
  type: StateType.MutatableSelector;
}

export type MutatableStateDefinition<Value, UpdateEvent> =
  | AtomDefinition<Value, UpdateEvent>
  | MutatableSelectorDefinition<Value, UpdateEvent>;
export type ReadOnlyStateDefinition<Value> = SelectorDefinition<Value>;
export type SyncStateDefinition<Value, UpdateEvent> =
  | MutatableStateDefinition<Value, UpdateEvent>
  | ReadOnlyStateDefinition<Value>;

export type AsyncStateDefinition<Value> = AsyncSelectorDefinition<Value>;
export type StateDefinition<Value, UpdateEvent> =
  | SyncStateDefinition<Value, UpdateEvent>
  | AsyncSelectorDefinition<Value>;

export type RegisteredState<Value, UpdateEvent> =
  | Atom<Value, UpdateEvent>
  | Selector<Value>
  | AsyncSelector<Value>
  | MutatableSelector<Value, UpdateEvent>;
