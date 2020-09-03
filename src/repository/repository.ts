import { Primitive, Type } from '../shared/type.ts';
import { Driver } from '../driver/driver.ts';
import { OrderByDirection, SelectQueryBuilder } from '../query-builder/select-query-builder.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { isAnyObject } from 'is-what';
import { UpdateQueryBuilder } from '../query-builder/update-query-builder.ts';
import { DeleteQueryBuilder } from '../query-builder/delete-query-builder.ts';
import { InsertQueryBuilder } from '../query-builder/insert-query-builder.ts';

export type FindConditions<T> = {
  [K in keyof T]?: T[K] extends Date
    ? Date | string
    : T[K] extends Primitive
    ? T[K]
    : T[K] extends Array<infer U>
    ? FindConditions<U>
    : T[K] extends Record<any, any>
    ? FindConditions<T[K]>
    : never;
};

export interface FindOptions<T> {
  select?: string[];
  where?: FindConditions<T> | FindConditions<T>[];
  relations?: string[];
  order?: string | [string, OrderByDirection] | Partial<Record<keyof T, OrderByDirection>>;
}

export class Repository<T> {
  constructor(private entity: Type<T>, private entityMetadata: EntityMetadata, private driver: Driver) {
    this.#alias = this.entityMetadata.dbName!;
  }

  readonly #alias: string;

  createSelectQueryBuilder(alias?: string): SelectQueryBuilder<T> {
    return this.driver.createSelectQueryBuilder().from(this.entity, alias ?? this.entityMetadata.dbName!);
  }

  createUpdateQueryBuilder(alias?: string): UpdateQueryBuilder<T> {
    return this.driver.createUpdateQueryBuilder(this.entity, alias);
  }

  createDeleteQueryBuilder(alias?: string): DeleteQueryBuilder<T> {
    return this.driver.createDeleteQueryByulder(this.entity, alias);
  }

  createInsertQueryBuilder(): InsertQueryBuilder<T> {
    return this.driver.createInsertQueryBuilder(this.entity);
  }

  async findOne(id: number | string): Promise<T | undefined>;
  async findOne(id: number | string, findOptions: FindOptions<T>): Promise<T | undefined>;
  async findOne(findOptions: FindOptions<T>): Promise<T | undefined>;
  async findOne(idOrOptions: number | string | FindOptions<T>, findOptions?: FindOptions<T>): Promise<T | undefined> {
    const qb = this.createSelectQueryBuilder(this.#alias);
    if (!isAnyObject(idOrOptions)) {
      for (const primary of this.entityMetadata.primaries ?? []) {
        qb.andWhere(`??.?? = ?`, [this.#alias, primary, idOrOptions]);
      }
    }
    // TODO transfer this code to the entity manager maybe?
    return qb.getOne();
  }
}
