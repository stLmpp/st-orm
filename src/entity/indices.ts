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
  dbName?: string;
  columnName?: string;
  tableName?: string;
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

export function Indices(columns: string[] | Record<string, IndexOptions>): ClassDecorator {
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

export function resolveIndex(databaseName: string, tableName: string, indexMetadata: IndexMetadata): [string, any[]] {
  const params: any[] = [databaseName, tableName];
  let idxType = '';
  if (indexMetadata.unique) {
    idxType = 'UNIQUE';
  } else if (indexMetadata.fulltext) {
    idxType = 'FULLTEXT';
  } else if (indexMetadata.spatial) {
    idxType = 'SPATIAL';
  }
  let columns = '';
  if (indexMetadata.columns?.length) {
    columns = indexMetadata.columns.map(() => '??').join(',');
    params.push(...indexMetadata.columns);
  } else if (indexMetadata.columnName) {
    columns = '??';
    params.push(indexMetadata.columnName);
  }
  let index = `CREATE ${idxType} INDEX ${indexMetadata.dbName} ON ??.??(${columns})`;
  if (indexMetadata.comment) {
    index += ` COMMENT ?`;
    params.push(indexMetadata.comment);
  }
  if (indexMetadata.visibility) {
    index += ` ${indexMetadata.visibility}`;
  }
  return [index, params];
}

export function indexHasChanged(oldIndex: Statistics, newIndex: IndexMetadata): boolean {
  return (
    (oldIndex.INDEX_COMMENT || undefined) !== newIndex.comment ||
    !oldIndex.NON_UNIQUE !== !!newIndex.unique ||
    (oldIndex.INDEX_TYPE === 'FULLTEXT' && !newIndex.fulltext) ||
    (!isNullOrUndefined(oldIndex.IS_VISIBLE) &&
      (oldIndex.IS_VISIBLE === 'YES' ? IndexVisibility.visible : IndexVisibility.invisible) !== newIndex.visibility)
  );
}
