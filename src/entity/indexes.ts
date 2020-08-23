import { entityStore } from '../store/entity-store.ts';
import { isArray } from 'is-what';
import { Statistics } from '../information-schema/statistics.entity.ts';
import { isNullOrUndefined } from 'is-what';

export enum IndexVisibility {
  visible = 'VISIBLE',
  invisible = 'INVISIBLE',
}

export interface IndexOptions {
  unique?: boolean;
  fulltext?: boolean;
  spatial?: boolean;
  comment?: string;
  visibility?: IndexVisibility;
}

export interface IndexMetadata extends IndexOptions {
  columns?: string[];
}

export function Index(options: IndexOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    entityStore.addIndex(target.constructor, options, propertyKey.toString());
  };
}

export function UniqueIndex(options: IndexOptions = {}): PropertyDecorator {
  return (target, propertyKey) => {
    entityStore.addIndex(target.constructor, { ...options, unique: true }, propertyKey.toString());
  };
}

export function Indexes(columns: string[] | Record<string, IndexOptions>): ClassDecorator {
  return target => {
    if (isArray(columns)) {
      entityStore.addIndex(target, { columns });
    } else {
      for (const [key, value] of Object.entries(columns)) {
        entityStore.addIndex(target, value, key);
      }
    }
  };
}

export function resolveIndex(
  databaseName: string,
  tableName: string,
  name: string,
  indexOptions: IndexMetadata,
  column?: string
): [string, any[]] {
  const params: any[] = [databaseName, tableName];
  let idxType = '';
  if (indexOptions.unique) {
    idxType = 'UNIQUE';
  } else if (indexOptions.fulltext) {
    idxType = 'FULLTEXT';
  } else if (indexOptions.spatial) {
    idxType = 'SPATIAL';
  }
  let columns = '';
  if (indexOptions.columns?.length) {
    columns = indexOptions.columns.map(() => '??').join(',');
    params.push(...indexOptions.columns);
  } else if (column) {
    columns = '??';
    params.push(column);
  }
  let index = `CREATE ${idxType} INDEX ${name} ON ??.??(${columns})`;
  if (indexOptions.comment) {
    index += ` COMMENT ?`;
    params.push(indexOptions.comment);
  }
  if (indexOptions.visibility) {
    index += ` ${indexOptions.visibility}`;
  }
  return [index, params];
}

export function indexHasChanged(oldIndex: Statistics, newIndex: IndexMetadata): boolean {
  return (
    (oldIndex.INDEX_COMMENT !== '' && oldIndex.INDEX_COMMENT !== newIndex.comment) ||
    !oldIndex.NON_UNIQUE !== !!newIndex.unique ||
    (oldIndex.INDEX_TYPE === 'FULLTEXT' && !newIndex.fulltext) ||
    (!isNullOrUndefined(oldIndex.IS_VISIBLE) &&
      (oldIndex.IS_VISIBLE === 'YES' ? IndexVisibility.visible : IndexVisibility.invisible) !== newIndex.visibility)
  );
}
