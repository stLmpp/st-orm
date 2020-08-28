import { JoinColumnOptions } from './join-column.ts';
import { isArray } from 'is-what';
import { entityStore } from '../store/entity-store.ts';
import { Type } from '../shared/type.ts';

export interface JoinTableOptions {
  name?: string;
  joinColumns?: JoinColumnOptions[] | JoinColumnOptions;
  inverseJoinColumns?: JoinColumnOptions[] | JoinColumnOptions;
}

export interface JoinTableMetadata extends JoinTableOptions {
  joinColumns: JoinColumnOptions[];
  inverseJoinColumns: JoinColumnOptions[];
  type?: Type;
}

export function JoinTable(options: JoinTableOptions = {}): PropertyDecorator {
  const metadata: JoinTableMetadata = { name: options?.name, joinColumns: [{}], inverseJoinColumns: [{}] };
  if (options?.joinColumns) {
    metadata.joinColumns = isArray(options.joinColumns) ? options.joinColumns : [options.joinColumns];
  }
  if (options?.inverseJoinColumns) {
    metadata.inverseJoinColumns = isArray(options.inverseJoinColumns)
      ? options.inverseJoinColumns
      : [options.inverseJoinColumns];
  }
  return (target, propertyKey) => {
    entityStore.upsertRelation(target.constructor, propertyKey.toString(), {
      joinTable: metadata,
      propertyKey: propertyKey.toString(),
    });
  };
}
