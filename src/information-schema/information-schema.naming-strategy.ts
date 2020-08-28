import { DefaultNamingStrategy } from '../shared/naming-strategy.ts';
import { injector } from '../injector/injector.ts';
import { Injectable } from '../injector/injectable.ts';
import { snakeCase } from 'case';

@Injectable()
export class InformationSchemaNamingStrategy extends DefaultNamingStrategy {
  columnName(name: string): string {
    return snakeCase(name).toUpperCase();
  }
  tableName(entityName: string): string {
    return snakeCase(entityName).toUpperCase();
  }
}

export const informationSchemaNamingStrategy = injector.resolve(InformationSchemaNamingStrategy);
