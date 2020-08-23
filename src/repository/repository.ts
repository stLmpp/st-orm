import { Type } from '../shared/type.ts';
import { Driver } from '../driver/driver.ts';
import { SelectQueryBuilder } from '../query-builder/query-builder.ts';
import { EntityMetadata } from '../entity/entity.ts';

export class Repository<T> {
  constructor(private entity: Type<T>, private entityMetadata: EntityMetadata, private driver: Driver) {}

  createQueryBuilder(alias?: string): SelectQueryBuilder<T> {
    return this.driver.createQueryBuilder().from(this.entity, alias ?? this.entityMetadata.name!);
  }
}
