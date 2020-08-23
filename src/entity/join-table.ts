import { JoinColumnOptions } from './join-column.ts';
import { isArray } from 'is-what';
import { entityStore } from '../store/entity-store.ts';

export interface JoinTableOptions {
  name?: string;
  joinColumns?: JoinColumnOptions[];
  inverseJoinColumns?: JoinColumnOptions[];
}

export interface JoinTableOptionsSingleColumn extends JoinTableOptions {
  joinColumn?: JoinColumnOptions;
  inverseJoinColumn?: JoinColumnOptions;
}

export function JoinTable(options?: JoinTableOptionsSingleColumn | JoinTableOptionsSingleColumn[]): PropertyDecorator {
  let newOptions: JoinTableOptions[];
  if (isArray(options)) {
    newOptions = (options ?? []).map(option => {
      if (option.joinColumn) {
        option.joinColumns = [...(option.joinColumns ?? []), option.joinColumn];
      }
      if (option.inverseJoinColumn) {
        option.inverseJoinColumns = [...(option.inverseJoinColumns ?? []), option.inverseJoinColumn];
      }
      return {
        joinColumns: option.joinColumns,
        inverseJoinColumns: option.inverseJoinColumns,
        name: option.name,
      };
    });
  } else {
    options = { ...options };
    if (options.joinColumn) {
      options.joinColumns = [...(options.joinColumns ?? []), options.joinColumn];
    }
    if (options.inverseJoinColumn) {
      options.inverseJoinColumns = [...(options.inverseJoinColumns ?? []), options.inverseJoinColumn];
    }
    newOptions = [options];
  }
  return (target, propertyKey) => {
    entityStore.upsertRelation(target.constructor, propertyKey.toString(), {
      joinTables: newOptions,
      propertyKey: propertyKey.toString(),
    });
  };
}
