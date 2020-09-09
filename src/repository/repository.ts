import { ExecuteResult, PartialDeep, Primitive, Type } from '../shared/type.ts';
import { Driver } from '../driver/driver.ts';
import { OrderByDirection, SelectQueryBuilder } from '../query-builder/select-query-builder.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { isAnyObject, isArray, isDate, isNullOrUndefined, isPrimitive, isString, isUndefined } from 'is-what';
import { UpdateQueryBuilder } from '../query-builder/update-query-builder.ts';
import { DeleteQueryBuilder } from '../query-builder/delete-query-builder.ts';
import { InsertQueryBuilder } from '../query-builder/insert-query-builder.ts';
import { FindOperatorWhere, FindOperatorWhereKeys } from '../query-builder/find-operators/find-operator.ts';
import { flattenObject } from '../shared/flatten-object.ts';
import { isArrayEqual } from '../shared/util.ts';
import { StMap } from '../shared/map.ts';
import { Connection } from '../connection/connection.ts';
import { RelationCascade, RelationMetadata, RelationType } from '../entity/relation.ts';

export type FindConditions<T> = {
  [K in keyof T]?: T[K] extends Date
    ? Date | string | FindOperatorWhere<any>
    : T[K] extends Primitive
    ? T[K] | FindOperatorWhere<any>
    : T[K] extends Array<infer U>
    ? FindConditions<U>
    : T[K] extends Record<any, any>
    ? FindConditions<T[K]>
    : never;
};

export type FindOptionsOrder =
  | string
  | string[]
  | [string, OrderByDirection]
  | [string, OrderByDirection][]
  | Record<string, OrderByDirection>;

export interface FindOneOptions<T> {
  select?: string[];
  where?: FindConditions<T>;
  relations?: string[];
  order?: FindOptionsOrder;
  includeEagerRelations?: boolean;
}

export interface FindManyOptions<T> extends FindOneOptions<T> {
  offset?: number;
  limit?: number;
}

export const DEFAULT_FIND_OPTIONS: FindOneOptions<any> = {
  includeEagerRelations: true,
};

export class Repository<T> {
  constructor(
    private entity: Type<T>,
    private entityMetadata: EntityMetadata,
    private driver: Driver,
    private connection: Connection
  ) {
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

  createDeleteQueryBuilder(): DeleteQueryBuilder<T> {
    return this.driver.createDeleteQueryByulder(this.entity);
  }

  createInsertQueryBuilder(): InsertQueryBuilder<T> {
    return this.driver.createInsertQueryBuilder(this.entity);
  }

  private _getEntityAndColumnMetadata(path: string): [tableAlias: string, columnName: string] {
    const pathArray = path.split('__');
    if (pathArray.length === 1) {
      const columnMetadata = this.entityMetadata.columnsMetadata.get(path);
      if (!columnMetadata) {
        throw new Error(`Column ${this.#alias}.${path} not found`);
      }
      return [this.#alias, columnMetadata.dbName!];
    } else {
      const [relationKey, columnKey] = pathArray.splice(-2, 2);
      let parentEntityMetadata = this.entityMetadata;
      const tableAliasArray = [];
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
        tableAliasArray.push(entityMetadata.dbName!);
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
      const tableAlias = [this.#alias, ...tableAliasArray, entityMetadata.dbName!].join('__');
      return [tableAlias, columnMetadata.dbName!];
    }
  }

  private _findConditions(
    queryBuilder: SelectQueryBuilder<T> | UpdateQueryBuilder<T> | DeleteQueryBuilder<T>,
    conditions: FindConditions<T>
  ): void {
    const conditionsFlat = flattenObject(conditions, {
      separator: '__',
      exclude: (_, value) => isAnyObject(value) && isArrayEqual(Object.keys(value), FindOperatorWhereKeys),
    });
    for (const [key, value] of Object.entries(conditionsFlat)) {
      const [tableAlias, columnName] = this._getEntityAndColumnMetadata(key);
      queryBuilder.andWhere({ [columnName]: value }, tableAlias);
    }
  }

  private _includeRelations(queryBuilder: SelectQueryBuilder<T>, relations: string[]): void {
    relations = [...relations].sort();
    for (const relation of relations) {
      const relationArray = relation.split('.');
      let entityMetadata = this.entityMetadata;
      const alias: string[] = [this.#alias];
      for (const relationKey of relationArray) {
        const relationMetadata = entityMetadata.relationsMetadata.get(relationKey);
        if (!relationMetadata) {
          throw new Error(`Relation metadata not found for ${relation}`);
        }
        const relationEntityMetadata = this.#entitiesMap.get(relationMetadata.referenceType);
        if (!relationEntityMetadata) {
          throw new Error(`Entity metadata not found for relation ${relationMetadata.referenceType?.name}`);
        }
        entityMetadata = relationEntityMetadata;
        alias.push(entityMetadata.dbName!);
      }
      const clonedAlias = alias.slice(0, -1);
      const lastAlias = relationArray[relationArray.length - 1];
      queryBuilder.leftJoinAndSelect(`${clonedAlias.join('__')}.${lastAlias}`, alias.join('__'));
    }
  }

  private _includeOrder(queryBuilder: SelectQueryBuilder<T>, order: FindOptionsOrder): void {
    if (isString(order)) {
      const path = order.split('.').join('__');
      const [tableAlias, columnName] = this._getEntityAndColumnMetadata(path);
      queryBuilder.orderBy(`${tableAlias}_${columnName}`, OrderByDirection.asc);
    } else if (isArray(order)) {
      if (order.length === 2 && [OrderByDirection.asc, OrderByDirection.desc].includes(order[1] as any)) {
        const newOrder: [string, OrderByDirection] = order as [string, OrderByDirection];
        const path = newOrder[0].split('.').join('__');
        const [tableAlias, columnName] = this._getEntityAndColumnMetadata(path);
        queryBuilder.orderBy(`${tableAlias}_${columnName}`, newOrder[1]);
      } else {
        for (const orderOrTupple of order) {
          let path: string;
          let direction = OrderByDirection.asc;
          if (isArray(orderOrTupple)) {
            const [tuppleKey, tuppleDirection] = orderOrTupple;
            path = tuppleKey.split('.').join('__');
            direction = tuppleDirection;
          } else {
            path = orderOrTupple.split('.').join('__');
          }
          const [tableAlias, columnName] = this._getEntityAndColumnMetadata(path);
          queryBuilder.addOrderBy(`${tableAlias}_${columnName}`, direction);
        }
      }
    } else if (isAnyObject(order)) {
      for (const [key, direction] of Object.entries(order)) {
        const path = key.split('.').join('__');
        const [tableAlias, columnName] = this._getEntityAndColumnMetadata(path);
        queryBuilder.addOrderBy(`${tableAlias}_${columnName}`, direction);
      }
    }
  }

  private _includeFindOptionsDefault(qb: SelectQueryBuilder<T>, findOptions: FindOneOptions<T>): void {
    if (findOptions.includeEagerRelations) {
      qb.includeEagerRelations();
    }
    if (findOptions.relations?.length) {
      this._includeRelations(qb, findOptions.relations);
    }
    if (findOptions.where) {
      this._findConditions(qb, findOptions.where);
    }
    if (findOptions.order) {
      this._includeOrder(qb, findOptions.order);
    }
    // TODO include select (will need a refactor in the SelectQueryBuilder)
  }

  async findOne(id: number | string): Promise<T | undefined>;
  async findOne(id: number | string, findOptions: FindOneOptions<T>): Promise<T | undefined>;
  async findOne(findOptions: FindOneOptions<T>): Promise<T | undefined>;
  async findOne(
    idOrOptions: number | string | FindOneOptions<T>,
    findOptions?: FindOneOptions<T>
  ): Promise<T | undefined> {
    const qb = this.createSelectQueryBuilder(this.#alias);
    findOptions = { ...DEFAULT_FIND_OPTIONS, ...findOptions };
    if (!isAnyObject(idOrOptions)) {
      if ((this.entityMetadata.primaries ?? []).length > 1) {
        throw new Error('FindOne with ID is only supported with 1 primary key, use "where" instead');
      }
      for (const primary of this.entityMetadata.primaries ?? []) {
        qb.andWhere(`??.?? = ?`, [this.#alias, primary, idOrOptions]);
      }
    } else {
      findOptions = { ...findOptions, ...idOrOptions };
    }
    this._includeFindOptionsDefault(qb, findOptions);
    return qb.getOne();
  }

  async findMany(): Promise<T[]>;
  async findMany(ids: Array<number | string>): Promise<T[]>;
  async findMany(ids: Array<number | string>, findOptions: FindManyOptions<T>): Promise<T[]>;
  async findMany(findOptions: FindManyOptions<T>): Promise<T[]>;
  async findMany(
    idsOrOptions?: Array<number | string> | FindManyOptions<T>,
    findOptions?: FindManyOptions<T>
  ): Promise<T[]>;
  async findMany(
    idsOrOptions?: Array<number | string> | FindManyOptions<T>,
    findOptions?: FindManyOptions<T>
  ): Promise<T[]> {
    const qb = this.createSelectQueryBuilder(this.#alias);
    findOptions = { ...DEFAULT_FIND_OPTIONS, ...findOptions };
    if (isNullOrUndefined(idsOrOptions)) {
      return qb.getMany();
    } else if (isArray(idsOrOptions)) {
      if ((this.entityMetadata.primaries ?? []).length > 1) {
        throw new Error('FindMany with IDS is only supported with 1 primary key, use "where" instead');
      }
      for (const primary of this.entityMetadata.primaries ?? []) {
        qb.andWhere(`??.?? IN ?`, [this.#alias, primary, idsOrOptions]);
      }
    } else if (isAnyObject(idsOrOptions)) {
      findOptions = { ...findOptions, ...idsOrOptions };
    }
    this._includeFindOptionsDefault(qb, findOptions);
    if (!isNullOrUndefined(findOptions.offset)) {
      qb.offset(findOptions.offset);
    }
    if (!isNullOrUndefined(findOptions.limit)) {
      qb.limit(findOptions.limit);
    }
    return qb.getMany();
  }

  async findManyAndCount(): Promise<[T[], number]>;
  async findManyAndCount(ids: Array<number | string>): Promise<[T[], number]>;
  async findManyAndCount(ids: Array<number | string>, findOptions: FindManyOptions<T>): Promise<[T[], number]>;
  async findManyAndCount(findOptions: FindManyOptions<T>): Promise<[T[], number]>;
  async findManyAndCount(
    idsOrOptions?: Array<number | string> | FindManyOptions<T>,
    findOptions?: FindManyOptions<T>
  ): Promise<[T[], number]> {
    const entities = await this.findMany(idsOrOptions, findOptions);
    return [entities, entities.length];
  }

  private _insert(entity: PartialDeep<T>, entityMetadata: EntityMetadata): InsertQueryBuilder<any>[] {
    const builders: InsertQueryBuilder<any>[] = [];
    for (const [key, value] of Object.entries(entity as any)) {
      if (entityMetadata.relationsMetadata.has(key)) {
        const relationMetadata = entityMetadata.relationsMetadata.get(key)!;
        if (relationMetadata.owner && relationMetadata.cascadeOptions[RelationCascade.insert]) {
          const insertQueryBuilder = this.connection
            .getRepository(relationMetadata.referenceType!)
            .createInsertQueryBuilder();
          const relationEntityMetadata = this.#entitiesMap.get(relationMetadata.referenceType!)!;
          if (isArray(value)) {
            for (const insert of value) {
              insertQueryBuilder.addValues(insert);
            }
            builders.push(
              insertQueryBuilder,
              ...value.reduce((acc, item) => [...acc, ...this._insert(item, relationEntityMetadata)], [])
            );
          } else if (isAnyObject(value)) {
            insertQueryBuilder.addValues(value);
            builders.push(insertQueryBuilder, ...this._insert(value as any, relationEntityMetadata));
          }
        }
      }
    }
    return builders;
  }

  async insert(entity: PartialDeep<T>): Promise<T>;
  async insert(entities: PartialDeep<T>[]): Promise<T[]>;
  async insert(entityOrEntities: PartialDeep<T> | PartialDeep<T>[]): Promise<T | T[]> {
    const qb = this.createInsertQueryBuilder();
    const builders: InsertQueryBuilder<any>[] = [];
    if (isArray(entityOrEntities)) {
      for (const a of entityOrEntities) {
        qb.addValues(a as any);
      }
      builders.push(
        ...entityOrEntities.reduce((acc: any[], item) => [...acc, ...this._insert(item, this.entityMetadata)], [])
      );
    } else {
      qb.addValues(entityOrEntities as any);
      builders.push(...this._insert(entityOrEntities, this.entityMetadata));
    }
    builders.push(qb);
    builders.forEach(b => {
      b.getQueryAndParameters().forEach((q: any) => {
        console.log(q);
      });
    });
    return [];
  }

  getUpdateQueryBuilders(
    condition: number | string | Array<number | string> | FindConditions<T>,
    partial: PartialDeep<T>
  ): UpdateQueryBuilder<any>[] {
    const qb = this.createUpdateQueryBuilder(this.#alias);
    if (isArray(condition)) {
      if ((this.entityMetadata.primaries ?? []).length > 1) {
        throw new Error('Update with IDS is only supported with 1 primary key, use "where" instead');
      }
      for (const primary of this.entityMetadata.primaries ?? []) {
        qb.andWhere(`??.?? IN ?`, [this.#alias, primary, condition]);
      }
    } else if (!isAnyObject(condition)) {
      if ((this.entityMetadata.primaries ?? []).length > 1) {
        throw new Error('Update with IDS is only supported with 1 primary key, use "where" instead');
      }
      for (const primary of this.entityMetadata.primaries ?? []) {
        qb.andWhere(`??.?? = ?`, [this.#alias, primary, condition]);
      }
    } else {
      this._findConditions(qb, condition);
    }
    const set: Record<string, Primitive | Date> = {};
    const children: { relationMetadata: RelationMetadata; set: any }[] = [];
    for (const [key, value] of Object.entries(partial as any).filter(([_, v]) => !isUndefined(v))) {
      if (isPrimitive(value) || isDate(value)) {
        set[key] = value;
      } else {
        const relationMetadata = this.entityMetadata.relationsMetadata.get(key);
        if (relationMetadata?.cascadeOptions[RelationCascade.update]) {
          children.push({ relationMetadata, set: value });
        }
      }
    }
    const childQb = [];
    if (children.length) {
      for (const child of children) {
        const sets = isArray(child.set) ? child.set : [child.set];
        const entityMetadata = this.#entitiesMap.get(child.relationMetadata.referenceType);
        if (!entityMetadata) {
          throw new Error(`EntityMetadata not found for ${child.relationMetadata.referenceType?.name}`);
        }
        const primaries = entityMetadata.primaries ?? [];
        const childRepository = this.connection.getRepository(child.relationMetadata.referenceType!)!;
        for (const childSet of sets) {
          if (primaries.some(primary => isNullOrUndefined(childSet[primary]))) {
            throw new Error(`Child primary key is null or undefined ${child.relationMetadata.referenceType?.name}`);
          }
          const childConditions: FindConditions<any> = {};
          for (const primary of primaries) {
            childConditions[primary] = childSet[primary];
            childSet[primary] = undefined;
          }
          childQb.push(...childRepository.getUpdateQueryBuilders(childConditions, childSet));
        }
      }
    }
    qb.set(set as any);
    return [qb, ...childQb];
  }

  async update(id: number | string | Array<number | string>, partial: PartialDeep<T>): Promise<ExecuteResult>;
  async update(where: FindConditions<T>, partial: PartialDeep<T>): Promise<ExecuteResult>;
  async update(
    condition: number | string | Array<number | string> | FindConditions<T>,
    partial: PartialDeep<T>
  ): Promise<ExecuteResult> {
    const updateQbs = this.getUpdateQueryBuilders(condition, partial);
    return this.driver.transaction(async connection => {
      let executeResult: ExecuteResult = { affectedRows: 0 };
      for (const update of updateQbs) {
        const result = await connection.execute(...update.getQueryAndParameters());
        executeResult = {
          ...executeResult,
          affectedRows: (executeResult?.affectedRows ?? 0) + (result.affectedRows ?? 0),
        };
      }
      return executeResult;
    });
  }

  async getDeleteQueryBuilders(
    conditionOrEntity: number | string | Array<number | string> | T | T[] | FindConditions<T>
  ): Promise<DeleteQueryBuilder<any>[]> {
    const primaries = this.entityMetadata.primaries ?? [];
    const qbs: DeleteQueryBuilder<any>[] = [];
    let findConditions: FindConditions<T> = {};
    if (isArray(conditionOrEntity)) {
      if (primaries.length > 1) {
        throw new Error(`Delete with ID or Entity can't be used when the entity has more than 1 primary key`);
      }
      for (const condition of conditionOrEntity) {
        const qb = this.createDeleteQueryBuilder();
        for (const primary of primaries) {
          if (isPrimitive(condition)) {
            (findConditions as any)[primary] = condition;
            qb.andWhere({ [primary]: condition });
          } else {
            (findConditions as any)[primary] = (condition as any)[primary];
            qb.andWhere({ [primary]: (condition as any)[primary] });
          }
        }
        qbs.push(qb);
      }
    } else if (!isAnyObject(conditionOrEntity)) {
      if (primaries.length > 1) {
        throw new Error(`Delete with ID or Entity can't be used when the entity has more than 1 primary key`);
      }
      const qb = this.createDeleteQueryBuilder();
      for (const primary of primaries) {
        qb.andWhere({ [primary]: conditionOrEntity });
        (findConditions as any)[primary] = conditionOrEntity;
      }
      qbs.push(qb);
    } else {
      const qb = this.createDeleteQueryBuilder();
      if (
        conditionOrEntity instanceof this.entity &&
        primaries.every(primary => !isNullOrUndefined((conditionOrEntity as any)[primary]))
      ) {
        for (const primary of primaries) {
          qb.andWhere({ [primary]: (conditionOrEntity as any)[primary] });
          (findConditions as any)[primary] = (conditionOrEntity as any)[primary];
        }
      } else {
        qb.andWhere(conditionOrEntity as any);
        findConditions = { ...findConditions, ...conditionOrEntity };
      }
      qbs.push(qb);
    }
    const relations = this.entityMetadata.relationsMetadata.filter(
      (_, relationMetadata) => relationMetadata.cascadeOptions[RelationCascade.delete]
    );
    if (relations.size) {
      const entities = await this.findMany({ where: findConditions, includeEagerRelations: false });
      for (const [, relationMetadata] of relations) {
        for (const entity of entities) {
          if (
            (relationMetadata.joinColumns ?? []).every(
              joinColumn => !isNullOrUndefined((entity as any)[joinColumn.name!])
            )
          ) {
            if (
              (relationMetadata.type === RelationType.oneToOne && relationMetadata.owner) ||
              ![RelationType.oneToOne, RelationType.manyToOne].includes(relationMetadata.type)
            ) {
              const childRepo = this.connection.getRepository(relationMetadata.referenceType!);
              const childFindConditions: FindConditions<any> = {};
              for (const joinColumn of relationMetadata.joinColumns ?? []) {
                childFindConditions[joinColumn.referencedColumn!] = (entity as any)[joinColumn.name!];
              }
              qbs.unshift(...(await childRepo.getDeleteQueryBuilders(childFindConditions)));
            }
          }
        }
      }
    }
    return qbs;
  }

  async delete(id: number | string | Array<number | string>): Promise<ExecuteResult>;
  async delete(where: FindConditions<T>): Promise<ExecuteResult>;
  async delete(entity: T): Promise<ExecuteResult>;
  async delete(entities: T[]): Promise<ExecuteResult>;
  async delete(
    conditionOrEntity: number | string | Array<number | string> | T | T[] | FindConditions<T>
  ): Promise<ExecuteResult> {
    const deleteQbs = await this.getDeleteQueryBuilders(conditionOrEntity);
    return this.driver.transaction(async connection => {
      let executeResult: ExecuteResult = { affectedRows: 0 };
      for (const update of deleteQbs) {
        const result = await connection.execute(...update.getQueryAndParameters());
        executeResult = {
          ...executeResult,
          affectedRows: (executeResult?.affectedRows ?? 0) + (result.affectedRows ?? 0),
        };
      }
      return executeResult;
    });
  }
}
