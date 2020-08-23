import { Injectable } from '../injector/injectable.ts';
import { injector } from '../injector/injector.ts';
import { camelCase } from 'case';
import { IndexMetadata } from '../entity/indexes.ts';
import { sha1 } from './util.ts';

@Injectable()
export class DefaultNamingStrategy implements NamingStrategy {
  tableName(entityName: string): string {
    return camelCase(entityName);
  }
  columnName(name: string): string {
    return camelCase(name);
  }
  indexName(tableName: string, columns: string[], options?: IndexMetadata): string {
    const hashed = sha1(`${tableName}_${columns.join('_')}_${JSON.stringify(options)}`);
    return `IDX_${hashed}`.substring(0, 63);
  }
  joinColumnName(name: string, referencedColumn: string): string {
    return camelCase(`${referencedColumn}_${name}`);
  }
}

export const defaultNamingStrategy = injector.resolve(DefaultNamingStrategy);

export interface NamingStrategy {
  tableName(entityName: string): string;
  columnName(name: string): string;
  indexName(tableName: string, columns: string[], options?: IndexMetadata): string;
  joinColumnName(name: string, referencedColumn: string): string;
}
