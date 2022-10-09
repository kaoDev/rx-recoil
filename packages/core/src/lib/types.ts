import type { BehaviorSubject, Observable } from 'rxjs'

export type SubscribableOrPromise<T> = Observable<T> | PromiseLike<T>

export const EMPTY_VALUE = Symbol('EMPTY_VALUE')
export type EMPTY_TYPE = typeof EMPTY_VALUE

export type StateKey = symbol
export type UsageKey = symbol

export type StateValue<Value> = BehaviorSubject<Value>

export type ReadonlyStateValue<Value> = Observable<Value> & {
	value: Value
}

export interface InternalStateAccess {
	getStateObject<Value, UpdateEvent>(
		definition: StateDefinition<Value, any>,
		usageId: UsageKey,
	): InternalRegisteredState<Value, UpdateEvent>
	get<Value>(definition: StateDefinition<Value, any>, usageId: UsageKey): Value
	set<Value, UpdateEvent>(
		definition: MutatableStateDefinition<Value, UpdateEvent>,
		usageId: UsageKey,
		change: UpdateEvent,
	): void
}

export interface StateReadAccess {
	getStateObject<Value>(
		definition: StateDefinition<Value, any>,
	): ReadOnlyState<Value>
	get<Value>(definition: StateDefinition<Value, any>): Value
}

export interface StateWriteAccess extends StateReadAccess {
	set<Value, UpdateEvent>(
		definition: MutatableStateDefinition<Value, UpdateEvent>,
		change: UpdateEvent,
	): void
}

export enum StateType {
	Atom,
	Selector,
	MutatableSelector,
}

export interface BaseStateDefinition {
	key: StateKey
	debugKey?: string
	volatile?: boolean
}

export type UpdateFunction<Value, Update> = (
	state: Value,
	change: Update,
) => Value

type OptionalCleanup = void | (() => void) | Promise<void | (() => void)>

export interface AtomDefinition<Value, UpdateEvent>
	extends BaseStateDefinition {
	initialValue: Value | (() => Value)
	type: StateType.Atom
	update: UpdateFunction<Value, UpdateEvent>
	onMount?: (stateAccess: StateWriteAccess) => OptionalCleanup
	volatile?: boolean
}

export interface SelectorDefinition<Value> extends BaseStateDefinition {
	type: StateType.Selector
	read: (stateAccess: StateReadAccess) => Value | SubscribableOrPromise<Value>
	onMount?: (stateAccess: StateWriteAccess) => OptionalCleanup
	volatile?: boolean
	initialValue?: Value | EMPTY_TYPE | Promise<Value | EMPTY_TYPE>
}

export interface MutatableSelectorDefinition<Value, Update>
	extends BaseStateDefinition {
	type: StateType.MutatableSelector
	read: (stateAccess: StateReadAccess) => Value | SubscribableOrPromise<Value>
	write: (stateAccess: StateWriteAccess, change: Update) => void
	onMount?: (stateAccess: StateWriteAccess) => OptionalCleanup
	volatile?: boolean
	initialValue?: Value | EMPTY_TYPE | Promise<Value | EMPTY_TYPE>
}

export interface ReadOnlyState<Value> extends BaseStateDefinition {
	useValue: (synchronous?: boolean) => Exclude<Value, EMPTY_TYPE>
	useValueRaw: (synchronous?: boolean) => Value
	value$: ReadonlyStateValue<Value>
}

export interface MutatableState<Value, UpdateEvent>
	extends ReadOnlyState<Value> {
	dispatchUpdate: (value: UpdateEvent) => void
}

export type MutatableStateDefinition<Value, UpdateEvent> =
	| AtomDefinition<Value, UpdateEvent>
	| MutatableSelectorDefinition<Value, UpdateEvent>
export type ReadOnlyStateDefinition<Value> = SelectorDefinition<Value>
export type StateDefinition<Value, UpdateEvent> =
	| MutatableStateDefinition<Value, UpdateEvent>
	| ReadOnlyStateDefinition<Value>

export type RegisteredState<Value, UpdateEvent> =
	| ReadOnlyState<Value>
	| MutatableState<Value, UpdateEvent>

export type InternalRegisteredState<Value, UpdateEvent> = {
	state: RegisteredState<Value, UpdateEvent>
	dependencies?: Set<InternalRegisteredState<unknown, unknown>>
	onUnmount?: () => void
	refs: Set<UsageKey>
}

export type Unpacked<T> = T extends SubscribableOrPromise<infer V> ? V : T
