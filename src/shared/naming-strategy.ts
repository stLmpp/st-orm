import { Injectable } from '../injector/injectable.ts';
import { camelCase, snakeCase } from 'case';
import { IndexMetadata } from '../entity/indices.ts';
import { sha1 } from './util.ts';
import { RelationMetadata } from '../entity/relation.ts';

@Injectable()
export class DefaultNamingStrategy implements NamingStrategy {
  tableName(entityName: string): string {
    return snakeCase(entityName);
  }
  columnName(name: string): string {
    return camelCase(name);
  }
  indexName(tableName: string, columns: string[], options?: IndexMetadata): string {
    const optionsString = options ? JSON.stringify(options) : '';
    const hashed = sha1(`${tableName}_${columns.join('_')}_${optionsString}`);
    return `IDX_${hashed}`.substring(0, 63);
  }
  joinColumnName(name: string, referencedColumn: string): string {
    return camelCase(`${referencedColumn}_${name}`);
  }
  joinTableName(ownerTableName: string, tableName: string): string {
    return camelCase(`${ownerTableName}_${tableName}`);
  }
  foreignKeyName({ columns, options, referencedColumns, referencedTableName, tableName }: ForeignKeyNameArgs): string {
    const optionsString = options ? JSON.stringify(options) : '';
    const referencedColumnsString = referencedColumns?.length ? referencedColumns.join('_') : '';
    const hashed = sha1(
      `${tableName}_${columns.join('_')}_${referencedTableName}_${referencedColumnsString}_${optionsString}`
    );
    return `FK_${hashed}`.substring(0, 63);
  }
}

export interface ForeignKeyNameArgs {
  tableName: string;
  columns: string[];
  referencedTableName: string;
  referencedColumns?: string[];
  options?: RelationMetadata;
}

export interface NamingStrategy {
  tableName(entityName: string): string;
  columnName(name: string): string;
  indexName(tableName: string, columns: string[], options?: IndexMetadata): string;
  joinColumnName(name: string, referencedColumn: string): string;
  joinTableName(ownerTableName: string, tableName: string, ownerColumns: string[], columns: string[]): string;
  foreignKeyName(args: ForeignKeyNameArgs): string;
}
