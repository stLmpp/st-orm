import { entityStore } from '../store/entity.store.ts';
import { isArray } from 'is-what';

export interface JoinColumnOptions {
  name?: string;
  referencedColumn?: string;
}

export function JoinColumn(options?: JoinColumnOptions | JoinColumnOptions[]): PropertyDecorator {
  let joinColumns: JoinColumnOptions[] = [];
  if (!isArray(options)) {
    joinColumns = [{ ...options }];
  } else {
    joinColumns = options;
  }
  return (target, propertyKey) => {
    entityStore.upsertRelation(target.constructor, propertyKey.toString(), {
      joinColumns,
      propertyKey: propertyKey.toString(),
      owner: true,
    });
  };
}
