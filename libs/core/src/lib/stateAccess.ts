import {
  InternalStateAccess,
  MutatableStateDefinition,
  StateDefinition,
  StateReadAccess,
  StateWriteAccess,
} from './types';

export function createPublicStateReadAccess(
  stateAccess: InternalStateAccess,
  usageId: symbol
) {
  const publicStateAccess: StateReadAccess = {
    getSource: function getSource<Value>(
      definition: StateDefinition<Value, unknown>
    ) {
      return stateAccess.getSource<Value>(definition, usageId);
    },
    getAsync: function get<Value>(definition: StateDefinition<Value, unknown>) {
      return stateAccess.getAsync(definition, usageId);
    },
    get: function get<Value>(definition: StateDefinition<Value, unknown>) {
      const value$ = stateAccess.getSource<Value>(definition, usageId);
      return value$.value;
    },
  };

  return publicStateAccess;
}

export function createPublicStateWriteAccess(
  stateAccess: InternalStateAccess,
  usageId: symbol
) {
  const publicReadAccess = createPublicStateReadAccess(stateAccess, usageId);
  const publicStateAccess: StateWriteAccess = {
    ...publicReadAccess,
    set: function set<Value, UpdateEvent>(
      definition: MutatableStateDefinition<Value, UpdateEvent>,
      change: UpdateEvent
    ) {
      stateAccess.set(definition, usageId, change);
    },
  };

  return publicStateAccess;
}
