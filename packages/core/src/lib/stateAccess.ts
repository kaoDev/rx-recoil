import {
	InternalStateAccess,
	MutatableStateDefinition,
	StateDefinition,
	StateReadAccess,
	StateWriteAccess,
	UsageKey,
} from './types'

export function createPublicStateReadAccess(
	stateAccess: InternalStateAccess,
	usageId: UsageKey,
) {
	const publicStateAccess: StateReadAccess = {
		getStateObject: function get<Value>(
			definition: StateDefinition<Value, unknown>,
		) {
			return stateAccess.getStateObject(definition, usageId).state
		},
		get: function get<Value>(definition: StateDefinition<Value, unknown>) {
			return stateAccess.get<Value>(definition, usageId)
		},
	}

	return publicStateAccess
}

export function createPublicStateWriteAccess(
	stateAccess: InternalStateAccess,
	usageId: UsageKey,
) {
	const publicReadAccess = createPublicStateReadAccess(stateAccess, usageId)
	const publicStateAccess: StateWriteAccess = {
		...publicReadAccess,
		set: function set<Value, UpdateEvent>(
			definition: MutatableStateDefinition<Value, UpdateEvent>,
			change: UpdateEvent,
		) {
			stateAccess.set(definition, usageId, change)
		},
	}

	return publicStateAccess
}
