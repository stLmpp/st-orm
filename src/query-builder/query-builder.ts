import { isAnyObject, isArray, isFunction, isNullOrUndefined, isNumber, isString } from 'is-what';
import { EntityMetadata } from '../entity/entity.ts';
import { Type } from '../shared/type.ts';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { isType } from '../shared/util.ts';
import { replaceParams } from 'sql-builder';
import { getAlias } from './util.ts';
import { Driver } from '../driver/driver.ts';
import { plainToClass } from '../node-libs/class-transformer.ts';
import { ColumnMetadata } from '../entity/column.ts';
import { RelationMetadata, RelationType } from '../entity/relation.ts';
import uniqWith from 'http://deno.land/x/lodash@4.17.15-es/uniqWith.js';

export interface QueryBuilderSelect {
  selection: string;
  alias?: string;
  columnName?: string;
  tableAlias?: string;
  params?: any[];
  columnMetadata?: ColumnMetadata;
}

export interface QueryBuilderFrom {
  from: string;
  alias: string;
  fromEntity?: any;
  fromEntityMetadata?: EntityMetadata;
  params?: any[];
}

export type QueryBuilderWhereParams = Record<string, any>;

export enum QueryBuilderWhereOperator {
  and = 'AND',
  or = 'OR',
}

export interface QueryBuilderWhere {
  where: string;
  params?: any[];
  operator: QueryBuilderWhereOperator;
}

export interface QueryBuilderOrderBy {
  orderBy: string | number;
  direction?: OrderByDirection;
}

export enum OrderByDirection {
  asc = 'ASC',
  desc = 'DESC',
}

export enum QueryBuilderJoinType {
  innerJoin = 'INNER JOIN',
  leftJoin = 'LEFT JOIN',
}

export interface QueryBuilderJoin {
  from: string;
  alias: string;
  parentAlias?: string;
  realAlias?: string;
  type: QueryBuilderJoinType;
  fromEntity?: any;
  condition?: string;
  fromEntityMetadata?: EntityMetadata;
  params?: any[];
  propertyKey?: string;
  relationMetadata?: RelationMetadata;
}

interface QueryBuilderJoinFinalArgs {
  relationMeta: RelationMetadata;
  condition?: string;
  params?: Record<string, any>;
  tableAlias: string;
  alias: string;
  reference: Type;
  referenceMeta: EntityMetadata;
  includeSelect: boolean;
  type: QueryBuilderJoinType;
}

export class SelectQueryBuilder<T> {
  static PARAM_REGEX = /:(\w+)/g;

  constructor(
    private driver: Driver,
    private entitiesMap: Map<any, EntityMetadata>,
    private namingStrategy: NamingStrategy
  ) {
    this.#entitiesArray = [...entitiesMap.entries()];
  }

  #entitiesArray: [Type, EntityMetadata][];

  #selectStore: QueryBuilderSelect[] = [];
  #queryHasSelect = false;
  #distinctStore = false;
  #fromStore: QueryBuilderFrom[] = [];
  #joinStore: QueryBuilderJoin[] = [];
  #whereStore: QueryBuilderWhere[] = [];
  #limitStore?: number;
  #offsetStore?: number;
  #orderByStore: QueryBuilderOrderBy[] = [];

  private _createNewQueryBuilder<U = any>(): SelectQueryBuilder<U> {
    return new SelectQueryBuilder<U>(this.driver, this.entitiesMap, this.namingStrategy);
  }

  distinct(distinct = true): this {
    this.#distinctStore = distinct;
    return this;
  }

  private _select<U = any>(
    selection: string | string[] | ((queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>),
    alias?: string | string[]
  ): QueryBuilderSelect[] {
    if (isString(selection)) {
      return [{ selection, alias: getAlias(selection, alias as string) }];
    } else if (isArray(selection)) {
      return selection.map((select, index) => ({
        selection: select,
        alias: getAlias(select.replace('.', '_'), (alias as string[])?.[index]),
      }));
    } else if (isFunction(selection)) {
      if (!alias) {
        throw new Error('Select with callback needs an alias');
      } else {
        const newQueryBuilder = this._createNewQueryBuilder();
        const [query, params] = selection(newQueryBuilder).getQueryAndParameters();
        return [{ selection: `(${query})`, alias: alias as string, params }];
      }
    } else {
      throw new Error('selection must be a string, array or function');
    }
  }

  select<U = any>(calllback: (queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>, alias: string): this;
  select(selections: string[], aliases?: string[]): this;
  select(selection: string, alias?: string): this;
  select<U = any>(
    selection: string | string[] | ((queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>),
    alias?: string | string[]
  ): this {
    this.#selectStore = this._select(selection, alias);
    this.#queryHasSelect = true;
    return this;
  }

  addSelect<U = any>(calllback: (queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>, alias: string): this;
  addSelect(selections: string[], aliases?: string[]): this;
  addSelect(selection: string, alias?: string): this;
  addSelect<U = any>(
    selection: string | string[] | ((queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>),
    alias?: string | string[]
  ): this {
    this.#selectStore.push(...this._select(selection, alias));
    this.#queryHasSelect = true;
    return this;
  }

  includeNotSelectable(): this {
    if (this.#queryHasSelect) {
      return this;
    }
    for (const from of this.#fromStore) {
      if (from.fromEntityMetadata?.columnsMetadata) {
        for (const [, col] of from.fromEntityMetadata.columnsMetadata) {
          if (!col.select) {
            const name = this.namingStrategy.columnName(col.name!);
            this.#selectStore.push({ selection: '??.??', alias: `${from.alias}_${name}`, params: [from.alias, name] });
          }
        }
      }
    }
    return this;
  }

  excludeNotSelectable(): this {
    if (this.#queryHasSelect) {
      return this;
    }
    for (const from of this.#fromStore) {
      if (from.fromEntityMetadata?.columnsMetadata) {
        for (const [, col] of from.fromEntityMetadata.columnsMetadata) {
          if (!col.select) {
            const name = this.namingStrategy.columnName(col.name!);
            this.#selectStore = this.#selectStore.filter(select => select.alias !== `${from.alias}_${name}`);
          }
        }
      }
    }
    return this;
  }

  private _from<U = any>(
    entity: Type<U> | ((queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>) | string,
    alias: string
  ): QueryBuilderFrom {
    if (this.#fromStore.length) {
      this.#joinStore = [];
    }
    if (isString(entity)) {
      const entityMetadata = this.#entitiesArray.find(
        ([, meta]) => this.namingStrategy.tableName(meta.name!) === entity
      );
      if (!entityMetadata?.[1]) {
        return { from: entity, alias };
      } else {
        entity = entityMetadata[0];
      }
    }
    if (this.entitiesMap.has(entity)) {
      const entityMeta = this.entitiesMap.get(entity)!;
      if (!entityMeta.name) {
        throw new Error(`Entity ${(entity as any)?.name}, for some reason, doesn't have a name...`);
      }
      const tableName = this.namingStrategy.tableName(entityMeta.name);
      this.#selectStore.push(...this._getSelectableColumns(entityMeta, alias));
      return { from: '??', alias, fromEntity: entity, fromEntityMetadata: entityMeta, params: [tableName] };
    } else if (isFunction(entity) && !isType(entity)) {
      const newQueryBuilder = this._createNewQueryBuilder();
      const [table, params] = entity(newQueryBuilder).getQueryAndParameters();
      return { from: `(${table})`, alias, params };
    } else {
      throw new Error('entity must be of type Entity (class), string or function callback');
    }
  }

  from<U = any>(entity: Type<U>, alias: string): SelectQueryBuilder<U>;
  from<U = any>(
    callback: (queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>,
    alias: string
  ): SelectQueryBuilder<U>;
  from(tableName: string, alias: string): this;
  from<U = any>(
    entity: Type<U> | ((queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>) | string,
    alias: string
  ): SelectQueryBuilder<U> | this {
    this.#fromStore = [this._from(entity, alias)];
    return this;
  }

  addFrom<U = any>(entity: Type<U>, alias: string): this;
  addFrom<U = any>(callback: (queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>, alias: string): this;
  addFrom(tableName: string, alias: string): this;
  addFrom<U = any>(
    entity: Type<U> | ((queryBuilder: SelectQueryBuilder<U>) => SelectQueryBuilder<U>) | string,
    alias: string
  ): this {
    this.#fromStore.push(this._from(entity, alias));
    return this;
  }

  private _replaceParams(statement: string, params?: Record<string, any>): [string, any[]] {
    if (!statement.includes(':') || !params) {
      return [statement, []];
    }
    const matches = statement.match(SelectQueryBuilder.PARAM_REGEX);
    if (!matches?.length) {
      return [statement, []];
    }
    const newParams = matches.map(match => params[match.slice(1)]);
    return [statement.replace(SelectQueryBuilder.PARAM_REGEX, '?'), newParams];
  }

  private _where(
    where: string | ((queryBuilder: this) => this) | QueryBuilderWhereParams,
    params?: QueryBuilderWhereParams | string,
    operator = QueryBuilderWhereOperator.and
  ): QueryBuilderWhere[] {
    if (isString(where)) {
      const [newWhere, newParams] = this._replaceParams(where, params as QueryBuilderWhereParams);
      return [{ where: newWhere, params: newParams, operator }];
    } else if (isFunction(where)) {
      const [newWhere, newParams] = where(this).getQueryAndParameters();
      return [{ where: `(${newWhere})`, params: newParams, operator }];
    } else if (isAnyObject(where)) {
      return Object.entries(where).map(([key, value]) => ({
        where: `??.?? = ?`,
        params: [params, key, value],
        operator,
      }));
    } else {
      throw new Error('"Where" must be of type string, callback function or object');
    }
  }

  where(where: string, params?: QueryBuilderWhereParams): this;
  where(where: (queryBuilder: this) => this): this;
  where(where: QueryBuilderWhereParams, tableAlias: string): this;
  where(
    where: string | ((queryBuilder: this) => this) | QueryBuilderWhereParams,
    params?: QueryBuilderWhereParams | string
  ): this {
    this.#whereStore = this._where(where, params);
    return this;
  }

  andWhere(where: string, params?: QueryBuilderWhereParams): this;
  andWhere(where: (queryBuilder: this) => this): this;
  andWhere(where: QueryBuilderWhereParams, tableAlias: string): this;
  andWhere(
    where: string | ((queryBuilder: this) => this) | QueryBuilderWhereParams,
    params?: QueryBuilderWhereParams | string
  ): this {
    this.#whereStore.push(...this._where(where, params));
    return this;
  }

  orWhere(where: string, params?: QueryBuilderWhereParams): this;
  orWhere(where: (queryBuilder: this) => this): this;
  orWhere(where: QueryBuilderWhereParams, tableAlias: string): this;
  orWhere(
    where: string | ((queryBuilder: this) => this) | QueryBuilderWhereParams,
    params?: QueryBuilderWhereParams | string
  ): this {
    this.#whereStore.push(...this._where(where, params, QueryBuilderWhereOperator.or));
    return this;
  }

  limit(limit?: number): this {
    this.#limitStore = limit;
    return this;
  }

  offset(offset?: number): this {
    this.#offsetStore = offset;
    return this;
  }

  private _orderBy(
    orderBy: string | number | string[] | number[] | Record<string, OrderByDirection>,
    direction: OrderByDirection | OrderByDirection[]
  ): QueryBuilderOrderBy[] {
    if (isString(orderBy) || isNumber(orderBy)) {
      return [{ orderBy, direction: direction as OrderByDirection }];
    } else if (isArray(orderBy)) {
      return (orderBy as Array<string | number>).map((order, index) => ({
        orderBy: order,
        direction: (direction as OrderByDirection[])?.[index] ?? OrderByDirection.asc,
      }));
    } else if (isAnyObject(orderBy)) {
      return Object.entries(orderBy).map(([order, dir]) => ({ orderBy: order, direction: dir }));
    } else {
      throw new Error('OrderBy must be of type string, number, string[], number[] or object');
    }
  }

  orderBy(orderBy: string | number, direction: OrderByDirection): this;
  orderBy(orderBy: string[] | number[], direction: OrderByDirection[]): this;
  orderBy(orderBy: Record<string, OrderByDirection>): this;
  orderBy(
    orderBy: string | number | string[] | number[] | Record<string, OrderByDirection>,
    direction: OrderByDirection | OrderByDirection[] = OrderByDirection.asc
  ): this {
    this.#orderByStore = this._orderBy(orderBy, direction);
    return this;
  }

  addOrderBy(orderBy: string | number, direction: OrderByDirection): this;
  addOrderBy(orderBy: string[] | number[], direction: OrderByDirection[]): this;
  addOrderBy(orderBy: Record<string, OrderByDirection>): this;
  addOrderBy(
    orderBy: string | number | string[] | number[] | Record<string, OrderByDirection>,
    direction: OrderByDirection | OrderByDirection[] = OrderByDirection.asc
  ): this {
    this.#orderByStore.push(...this._orderBy(orderBy, direction));
    return this;
  }

  private _getSelectableColumns(entityMeta: EntityMetadata, alias: string): QueryBuilderSelect[] {
    const selection: QueryBuilderSelect[] = [];
    if (!this.#queryHasSelect) {
      for (const [, col] of entityMeta.columnsMetadata) {
        if (col.select) {
          const name = this.namingStrategy.columnName(col.name!);
          selection.push({
            selection: '??.??',
            alias: `${alias}_${name}`,
            params: [alias, name],
            tableAlias: alias,
            columnName: name,
            columnMetadata: col,
          });
        }
      }
    }
    return selection;
  }

  private _joinFinal({
    params,
    condition,
    relationMeta,
    tableAlias,
    alias,
    referenceMeta,
    reference,
    includeSelect,
    type,
  }: QueryBuilderJoinFinalArgs): [QueryBuilderJoin, QueryBuilderSelect[]] {
    let newCondition = '';
    let conditionParams = [];
    if (condition) {
      const [_condition, _conditionParams] = this._replaceParams(condition, params);
      newCondition = _condition;
      conditionParams = _conditionParams;
    } else {
      if (relationMeta.joinColumns?.length) {
        for (let i = 0, len = relationMeta.joinColumns.length; i < len; i++) {
          const joinColumn = relationMeta.joinColumns[i];
          newCondition += ' ??.?? = ??.?? ';
          conditionParams.push(tableAlias, joinColumn.name, alias, joinColumn.referencedColumn);
          if (i + 1 < relationMeta.joinColumns.length) {
            newCondition += ' AND ';
          }
        }
      }
    }
    return [
      {
        type,
        fromEntity: reference,
        fromEntityMetadata: referenceMeta,
        from: '??',
        alias: '??',
        params: [this.namingStrategy.tableName(referenceMeta!.name!), alias, ...conditionParams],
        condition: newCondition,
        propertyKey: relationMeta.propertyKey,
        realAlias: alias,
        relationMetadata: relationMeta,
        parentAlias: tableAlias,
      },
      includeSelect ? this._getSelectableColumns(referenceMeta!, alias) : [],
    ];
  }

  private _joinResolveReference(relationMeta: RelationMetadata): [Type, EntityMetadata] {
    const reference = relationMeta.referenceType;
    const referenceMeta = this.entitiesMap.get(reference);
    if (!reference || !referenceMeta) {
      throw new Error(`Could not find reference ${relationMeta.reference}`);
    }
    return [reference, referenceMeta];
  }

  private _joinByName(
    type: QueryBuilderJoinType,
    join: string,
    alias: string,
    condition?: string,
    params?: Record<string, any>,
    includeSelect = false
  ): [QueryBuilderJoin, QueryBuilderSelect[]] {
    const [tableAlias, relation] = join.split('.');
    if (!tableAlias || !relation) {
      throw new Error(`you're supposed to pass the join arg mate :)`);
    }
    const targetMeta = this.#fromStore.find(from => from.alias.toUpperCase() === tableAlias.toUpperCase())
      ?.fromEntityMetadata;
    const relationMeta = targetMeta?.relationsMetadata.get(relation);
    if (!relationMeta) {
      throw new Error(`Couldn't find relation "${join}"`);
    }
    const [reference, referenceMeta] = this._joinResolveReference(relationMeta);
    return this._joinFinal({
      alias,
      condition,
      includeSelect,
      params,
      reference,
      referenceMeta,
      relationMeta,
      tableAlias,
      type,
    });
  }

  private _joinByType(
    type: QueryBuilderJoinType,
    join: Type,
    alias: string,
    condition?: string,
    params?: Record<string, any>,
    includeSelect = false
  ): [QueryBuilderJoin, QueryBuilderSelect[]] {
    if (this.#fromStore.length > 1) {
      throw new Error(`It is only possible to join with type when there's only one "from" table`);
    }
    const from = this.#fromStore[0];
    if (!from.fromEntity || !from.fromEntityMetadata) {
      throw new Error(`Could not find metadata for ${from.alias}`);
    }
    let relationMeta: RelationMetadata | undefined;
    let referenceMeta: EntityMetadata | undefined;
    let reference: Type | undefined;
    for (const [, rel] of from.fromEntityMetadata.relationsMetadata) {
      const [_ref, _refMeta] = this._joinResolveReference(rel);
      if (_ref === join) {
        relationMeta = rel;
        referenceMeta = _refMeta;
        reference = _ref;
      }
    }
    if (!relationMeta || !referenceMeta || !reference) {
      throw new Error(`Couldn't find any relation from type ${join?.name ?? join}`);
    }
    return this._joinFinal({
      tableAlias: from.alias,
      relationMeta,
      referenceMeta,
      reference,
      params,
      includeSelect,
      condition,
      alias,
      type,
    });
  }

  private _joinByCallback(
    type: QueryBuilderJoinType,
    join: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any>
  ): [QueryBuilderJoin, QueryBuilderSelect[]] {
    const [query, newParams] = join(this._createNewQueryBuilder()).getQueryAndParameters();
    const [newCondition, conditionParams] = this._replaceParams(condition, params);
    return [
      {
        alias,
        condition: newCondition,
        from: `(${query})`,
        type,
        params: [...newParams, ...conditionParams],
      },
      [],
    ];
  }

  private _join(
    type: QueryBuilderJoinType,
    join: string | Type | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any>,
    includeSelect = false
  ): [QueryBuilderJoin, QueryBuilderSelect[]] {
    if (!this.#fromStore?.length) {
      throw new Error('Cannot determine relation without "from" table');
    }
    if (isString(join)) {
      return this._joinByName(type, join, alias, condition, params, includeSelect);
    } else if (isType(join)) {
      return this._joinByType(type, join, alias, condition, params, includeSelect);
    } else if (isFunction(join)) {
      if (!condition) {
        throw new Error('Condition is required when using join with callback');
      }
      return this._joinByCallback(type, join, alias, condition, params);
    } else {
      throw new Error('Join must be of type string, Type or callback function');
    }
  }

  innerJoinAndSelect(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoinAndSelect(joinEntity: Type, alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoinAndSelect(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any>
  ): this;
  innerJoinAndSelect(
    join: string | Type | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any>
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.innerJoin, join, alias, condition, params, true);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  innerJoin(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoin(joinEntity: Type, alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoin(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any>
  ): this;
  innerJoin(
    join: string | Type | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any>
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.innerJoin, join, alias, condition, params);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  leftJoinAndSelect(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoinAndSelect(joinEntity: Type, alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoinAndSelect(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any>
  ): this;
  leftJoinAndSelect(
    join: string | Type | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any>
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.leftJoin, join, alias, condition, params, true);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  leftJoin(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoin(joinEntity: Type, alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoin(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any>
  ): this;
  leftJoin(
    join: string | Type | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any>
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.leftJoin, join, alias, condition, params);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  async getRawMany<U = any>(): Promise<U[]> {
    return await this.driver.query(...this.getQueryAndParameters());
  }

  async getRawOne<U = any>(): Promise<U> {
    const result = await this.driver.query(...this.getQueryAndParameters());
    return result?.[0];
  }

  private _transformEntities(rawData: any[], one = false): T[] {
    if (!rawData?.length) {
      return [];
    }
    const table = this.#fromStore[0];
    if (!table) {
      return [];
    }
    let rawEntities = this._getRawUnique(rawData, table.alias);
    if (one) {
      rawEntities = [rawEntities[0]];
    }
    rawEntities = this._getJoinRecusive(table.alias, table.fromEntityMetadata!.relationsMetadata, rawData, rawEntities);
    return plainToClass(table.fromEntity as Type<T>, rawEntities);
  }

  private _getRawUnique(rawData: any[], alias: string): any[] {
    const selection = this.#selectStore.filter(select => select.tableAlias === alias);
    const primary = selection.filter(select => select.columnMetadata!.primary);
    const rawDataUnique = uniqWith(rawData, (valueA: any, valueB: any) =>
      primary.every(select => valueA[select.alias!] === valueB[select.alias!])
    );
    return rawDataUnique.map(raw => {
      return selection.reduce((acc, select) => {
        return { ...acc, [select.columnName!]: raw[select.alias!] };
      }, {});
    });
  }

  private _getJoinRecusive(
    alias: string,
    relationsMap: Map<string, RelationMetadata>,
    rawData: any[],
    rawEntities: any[]
  ): any[] {
    for (const [relationKey, relation] of relationsMap) {
      const join = this.#joinStore.find(j => j.propertyKey === relationKey && alias === j.parentAlias);
      if (join) {
        let joinRawEntities: any[] = this._getRawUnique(rawData, join.realAlias!);
        const joinTableMeta = this.entitiesMap.get(relation.referenceType);
        if (joinTableMeta) {
          joinRawEntities = this._getJoinRecusive(
            join.realAlias!,
            joinTableMeta.relationsMetadata,
            rawData,
            joinRawEntities
          );
        }
        const joinEntities: any[] = plainToClass(join.fromEntity, joinRawEntities, {});
        rawEntities = rawEntities.map(rawEntity => {
          const joinRelationEntities = joinEntities.filter(joinEntity => {
            return join.relationMetadata!.joinColumns!.every(
              joinColumn => rawEntity[joinColumn.referencedColumn!] === joinEntity[joinColumn.name!]
            );
          });
          return {
            ...rawEntity,
            [join.propertyKey!]:
              join.relationMetadata!.type === RelationType.oneToMany
                ? joinRelationEntities
                : joinRelationEntities?.[0] ?? null,
          };
        });
      }
    }
    return rawEntities;
  }

  async getOne(): Promise<T | undefined> {
    const raw = await this.getRawMany();
    return this._transformEntities(raw, true)?.[0];
  }

  async getMany(): Promise<T[]> {
    const raw = await this.getRawMany();
    return this._transformEntities(raw);
  }

  getQuery(): string {
    const [query, params] = this.getQueryAndParameters();
    return replaceParams(query, params);
  }

  getQueryAndParameters(): [string, any[]] {
    let query = 'SELECT ';
    if (this.#distinctStore) {
      query += 'DISTINCT ';
    }
    const params = [];
    for (const select of this.#selectStore) {
      query += ` ${select.selection} AS ??,`;
      params.push(...(select.params ?? []), select.alias ?? select.selection.replace('.', '_'));
    }
    if (!this.#selectStore.length) {
      query += ' * ';
    } else {
      query = query.slice(0, -1);
    }
    query += ' FROM ';
    for (const from of this.#fromStore) {
      query += ` ${from.from} AS ??,`;
      params.push(...(from.params ?? []), from.alias ?? from.fromEntityMetadata?.name);
    }
    query = query.slice(0, -1);
    if (this.#joinStore.length) {
      for (const join of this.#joinStore) {
        query += ` ${join.type} ${join.from} AS ${join.alias} ON (${join.condition})`;
        params.push(...(join.params ?? []));
      }
    }
    if (this.#whereStore.length) {
      query += ' WHERE ';
      for (let i = 0, len = this.#whereStore.length; i < len; i++) {
        const where = this.#whereStore[i];
        query += ` ${where.where} `;
        params.push(...(where.params ?? []));
        const next = this.#whereStore[i + 1];
        if (next) {
          query += ` ${next.operator} `;
        }
      }
    }
    if (this.#orderByStore.length) {
      query += ' ORDER BY ';
      for (const order of this.#orderByStore) {
        query += ` ?? ${order.direction},`;
        params.push(order.orderBy);
      }
      query = query.slice(0, -1);
    }
    if (!isNullOrUndefined(this.#limitStore)) {
      query += ' LIMIT ?';
      params.push(this.#limitStore);
      if (!isNullOrUndefined(this.#offsetStore)) {
        query += ' OFFSET ?';
        params.push(this.#offsetStore);
      }
    }
    // TODO LOGGER
    console.log('------- QUERY BEGIN -------');
    console.log(replaceParams(query, params));
    console.log('------- QUERY END -------');
    return [query, params];
  }
}
