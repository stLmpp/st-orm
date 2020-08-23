import { DefaultNamingStrategy } from '../shared/naming-strategy.ts';
import { injector } from '../injector/injector.ts';
import { Injectable } from '../injector/injectable.ts';

@Injectable()
export class InformationSchemaNamingStrategy extends DefaultNamingStrategy {
  columnName(name: string): string {
    return name.toUpperCase();
  }
  tableName(entityName: string): string {
    return entityName.toUpperCase();
  }
}

export const informationSchemaNamingStrategy = injector.resolve(InformationSchemaNamingStrategy);
