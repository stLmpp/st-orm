import { ColumnMetadata } from './column.ts';
import { entityStore } from '../store/entity-store.ts';
import { isString, isAnyObject } from 'is-what';
import { IndexMetadata } from './indexes.ts';
import { RelationMetadata } from './relation.ts';

export interface EntityOptions {
  name?: string;
  connection?: string;
  sync?: boolean;
  comment?: string;
}

export interface EntityMetadata extends EntityOptions {
  columnsMetadata: Map<string, ColumnMetadata>;
  relationsMetadata: Map<string, RelationMetadata>;
  relationProperties?: Record<string, string>;
  indexes?: IndexMetadata[];
}

export function Entity(options?: EntityOptions): ClassDecorator;
export function Entity(name?: string, options?: EntityOptions): ClassDecorator;
export function Entity(nameOrOptions?: string | EntityOptions, options?: EntityOptions): ClassDecorator {
  if (isString(nameOrOptions)) {
    options = { ...options, name: nameOrOptions };
  } else if (isAnyObject(nameOrOptions)) {
    options = { ...nameOrOptions, ...options };
  }
  return target => {
    entityStore.upsert(target, {
      ...options,
      name: options?.name ?? target.name,
      connection: options?.connection ?? 'default',
      sync: options?.sync ?? true,
    });
  };
}
