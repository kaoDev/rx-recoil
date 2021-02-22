import {
  AtomDefinition,
  InternalStateAccess,
  SelectorDefinition,
  StateDefinition,
  StateReadAccess,
  StateWriteAccess,
  SyncStateReadAccess,
} from './types';

export function createPublicSyncStateReadAccess(
  stateAccess: InternalStateAccess,
  useId: symbol
) {
  const publicStateAccess: SyncStateReadAccess = {
    getSource: (definition) => stateAccess.getSource(definition, useId),
    get: function get<Value>(
      definition: AtomDefinition<Value, unknown> | SelectorDefinition<Value>
    ) {
      const value$ = stateAccess.getSource(definition, useId);
      return value$.value;
    },
  };

  return publicStateAccess;
}

export function createPublicStateWriteAccess(
  stateAccess: InternalStateAccess,
  useId: symbol
) {
  const publicReadAccess = createPublicSyncStateReadAccess(stateAccess, useId);
  const publicStateAccess: StateWriteAccess = {
    ...publicReadAccess,
    set: (definition, change) => {
      stateAccess.set(definition, useId, change);
    },
  };

  return publicStateAccess;
}

export function createPublicAsyncStateReadAccess(
  stateAccess: InternalStateAccess,
  useId: symbol
) {
  const publicStateAccess: StateReadAccess = {
    get: function get<Value>(definition: StateDefinition<Value, unknown>) {
      return stateAccess.getFull(definition, useId);
    },
  };

  return publicStateAccess;
}
