import { Primitive, Type } from '../shared/type.ts';
import { Driver } from '../driver/driver.ts';
import { OrderByDirection, SelectQueryBuilder } from '../query-builder/select-query-builder.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { isAnyObject } from 'is-what';
import { UpdateQueryBuilder } from '../query-builder/update-query-builder.ts';
import { DeleteQueryBuilder } from '../query-builder/delete-query-builder.ts';
import { InsertQueryBuilder } from '../query-builder/insert-query-builder.ts';
import { FindOperatorWhere } from '../query-builder/find-operators/find-operator.ts';
import { flattenObject } from '../shared/flatten-object.ts';
import { takeRight } from '../shared/util.ts';
import { StMap } from '../shared/map.ts';
import { ColumnMetadata } from '../entity/column.ts';

export type FindConditions<T> = {
  [K in keyof T]?: T[K] extends Date
    ? Date | string | FindOperatorWhere<Date | string>
    : T[K] extends Primitive
    ? T[K] | FindOperatorWhere<T[K]>
    : T[K] extends Array<infer U>
    ? FindConditions<U>
    : T[K] extends Record<any, any>
    ? FindConditions<T[K]>
    : never;
};

export interface FindOptions<T> {
  select?: string[];
  where?: FindConditions<T>;
  relations?: string[];
  order?: string | [string, OrderByDirection] | Partial<Record<keyof T, OrderByDirection>>;
}

export class Repository<T> {
  constructor(private entity: Type<T>, private entityMetadata: EntityMetadata, private driver: Driver) {
    this.#alias = this.entityMetadata.dbName!;
    this.#entitiesMap = this.driver.entitiesMap;
  }

  readonly #alias: string;
  readonly #entitiesMap: StMap<any, EntityMetadata>;

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

  private _getEntityAndColumnMetadata(path: string): [EntityMetadata, ColumnMetadata] {
    const pathArray = path.split('__');
    if (pathArray.length === 1) {
      const columnMetadata = this.entityMetadata.columnsMetadata.get(path);
      if (!columnMetadata) {
        throw new Error(`Column ${this.#alias}.${path} not found`);
      }
      return [this.entityMetadata, columnMetadata];
    } else {
      if (pathArray.length === 2) {
        pathArray.unshift(this.#alias);
      }
      const [relationKey, columnKey] = pathArray.splice(-2, 2);
      let parentEntityMetadata = this.entityMetadata;
      for (const relationProperty of pathArray) {
        const relationMetadata = parentEntityMetadata.relationsMetadata.get(relationProperty);
        if (!relationMetadata) {
          throw new Error(`Could not find metadata for relation ${relationProperty}`);
        }
        const entityMetadata = this.#entitiesMap.get(relationMetadata.referenceType);
        if (!entityMetadata) {
          throw new Error(`Could not find metadata for entity ${relationMetadata.referenceType?.name}`);
        }
        parentEntityMetadata = entityMetadata;
      }
      const relationMetadata = parentEntityMetadata!.relationsMetadata.get(relationKey);
      if (!relationMetadata) {
        throw new Error(`Could not find relation metadata for ${relationKey}`);
      }
      const entityMetadata = this.#entitiesMap.get(relationMetadata.referenceType);
      if (!entityMetadata) {
        throw new Error(`Could not find entity metadata for ${relationMetadata.referenceType?.name}`);
      }
      const columnMetadata = entityMetadata.columnsMetadata.get(columnKey);
      if (!columnMetadata) {
        throw new Error(`Could not find column metadata for ${columnKey}`);
      }
      return [entityMetadata, columnMetadata];
    }
  }

  private _findConditions(queryBuilder: SelectQueryBuilder<T>, conditions: FindConditions<T>): void {
    const conditionsFlat = flattenObject(conditions, '__');
    // TODO complete using the _getEntityAndColumnMetadata
    for (const [key, value] of Object.entries(conditionsFlat)) {
      const aliases = takeRight(key.split('__'), 3);
      if (aliases.length === 1) {
        queryBuilder.andWhere({ [key]: value }, this.#alias);
      } else if (aliases.length === 2) {
        const [propertyNameRelation, propertyName] = aliases;
        const relationMetadata = this.entityMetadata.relationsMetadata.get(propertyNameRelation);
        if (!relationMetadata) {
          throw new Error(`Could not find relation between "${this.#alias}" and "${propertyNameRelation}"`);
        }
        const entityRelationMetadata = this.#entitiesMap.get(relationMetadata.referenceType);
        if (!entityRelationMetadata) {
          throw new Error(`Could not find metadata for ${this.#alias}.${propertyNameRelation}`);
        }
        const columnMetadata = entityRelationMetadata.columnsMetadata.get(propertyName);
        if (!columnMetadata) {
          throw new Error(`Could not find metadata for ${key}`);
        }
        queryBuilder.andWhere({ [columnMetadata.dbName!]: value }, `${this.#alias}__${entityRelationMetadata.dbName}`);
      } else {
      }
    }
  }

  async findOne(id: number | string): Promise<T | undefined>;
  async findOne(id: number | string, findOptions: FindOptions<T>): Promise<T | undefined>;
  async findOne(findOptions: FindOptions<T>): Promise<T | undefined>;
  async findOne(idOrOptions: number | string | FindOptions<T>, findOptions?: FindOptions<T>): Promise<T | undefined> {
    const qb = this.createSelectQueryBuilder(this.#alias);
    findOptions = { ...findOptions };
    if (!isAnyObject(idOrOptions)) {
      for (const primary of this.entityMetadata.primaries ?? []) {
        qb.andWhere(`??.?? = ?`, [this.#alias, primary, idOrOptions]);
      }
    } else {
      findOptions = { ...findOptions, ...idOrOptions };
    }
    if (findOptions.where) {
      this._findConditions(qb, findOptions.where);
    }
    console.log(qb.getQuery());
    return undefined;
  }
}
