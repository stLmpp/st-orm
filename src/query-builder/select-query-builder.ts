import { isAnyObject, isArray, isFunction, isNullOrUndefined, isNumber, isString } from 'is-what';
import { EntityMetadata } from '../entity/entity.ts';
import { Statement, Type } from '../shared/type.ts';
import { isType, uniqWith } from '../shared/util.ts';
import { replaceParams } from 'sql-builder';
import { getAlias } from './util.ts';
import { Driver } from '../driver/driver.ts';
import { plainToClass } from '../node-libs/class-transformer.ts';
import { ColumnMetadata } from '../entity/column.ts';
import { RelationMetadata, RelationType } from '../entity/relation.ts';
import { StMap } from '../shared/map.ts';
import { JoinColumnOptions } from '../entity/join-column.ts';
import { QueryBuilder, baseWhere, getWhereStatement, SelectQueryBuilderFn, WhereConditions } from './query-builder.ts';

export type KeyofJoin<T = any> = keyof Pick<
  SelectQueryBuilder<T>,
  'innerJoin' | 'innerJoinAndSelect' | 'leftJoin' | 'leftJoinAndSelect'
>;

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
  params?: Record<string, any> | any[];
  tableAlias: string;
  alias: string;
  reference: Type;
  referenceMeta: EntityMetadata;
  includeSelect: boolean;
  type: QueryBuilderJoinType;
}

export class SelectQueryBuilder<T> implements QueryBuilder {
  static PARAM_REGEX = /:(\w+)/g;

  constructor(driver: Driver, entitiesMap: StMap<any, EntityMetadata>) {
    this.#driver = driver;
    this.#entitiesMap = entitiesMap;
  }

  readonly #driver: Driver;
  readonly #entitiesMap: StMap<any, EntityMetadata>;

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
    return new SelectQueryBuilder<U>(this.#driver, this.#entitiesMap);
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
            const name = col.dbName!;
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
            const name = col.dbName!;
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
      const entityMetadata = this.#entitiesMap.find(([, meta]) => meta.dbName! === entity);
      if (!entityMetadata?.[1]) {
        return { from: entity, alias };
      } else {
        entity = entityMetadata[0];
      }
    }
    if (this.#entitiesMap.has(entity)) {
      const entityMeta = this.#entitiesMap.get(entity)!;
      if (!entityMeta.dbName) {
        throw new Error(`Entity ${(entity as any)?.name}, for some reason, doesn't have a name...`);
      }
      const tableName = entityMeta.dbName;
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

  private _replaceParams(statement: string, params?: Record<string, any> | any[]): Statement {
    if (isArray(params)) {
      return [statement, params];
    }
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
    condition: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[],
    operator = QueryBuilderWhereOperator.and
  ): QueryBuilderWhere[] {
    return baseWhere({
      condition,
      operator,
      params,
      createSelectQueryBuilder: () => this.#driver.createSelectQueryBuilder(),
    });
  }

  where(where: string, params?: QueryBuilderWhereParams | any[]): this;
  where(where: SelectQueryBuilderFn<string>): this;
  where(where: WhereConditions, tableAlias: string): this;
  where(
    where: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[]
  ): this {
    this.#whereStore = this._where(where, params);
    return this;
  }

  andWhere(where: string, params?: QueryBuilderWhereParams | any[]): this;
  andWhere(where: SelectQueryBuilderFn<string>): this;
  andWhere(where: WhereConditions, tableAlias: string): this;
  andWhere(
    where: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[]
  ): this {
    this.#whereStore.push(...this._where(where, params));
    return this;
  }

  orWhere(where: string, params?: QueryBuilderWhereParams | any[]): this;
  orWhere(where: SelectQueryBuilderFn<string>): this;
  orWhere(where: WhereConditions, tableAlias: string): this;
  orWhere(
    where: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[]
  ): this {
    this.#whereStore.push(...this._where(where, params, QueryBuilderWhereOperator.or));
    return this;
  }

  andExists(callback: SelectQueryBuilderFn<SelectQueryBuilder<any>>, not = false): this {
    return this.andWhere(qb => ` ${not ? 'NOT' : ''} EXISTS (${callback(qb).select('1').getQuery()})`);
  }

  orExists(callback: SelectQueryBuilderFn<SelectQueryBuilder<any>>, not = false): this {
    return this.orWhere(qb => ` ${not ? 'NOT' : ''} EXISTS (${callback(qb).select('1').getQuery()}) `);
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
          const name = col.dbName!;
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

  includeEagerRelations(joinType: QueryBuilderJoinType = QueryBuilderJoinType.leftJoin, select = true): this {
    if (!this.#fromStore.length) {
      throw new Error(`There must be a "from"`);
    }
    if (this.#fromStore.length > 1) {
      throw new Error(`There must be only one "from"`);
    }
    const from = this.#fromStore[0];
    if (!from.fromEntityMetadata) {
      throw new Error(`EntityMetadata was not found`);
    }
    let method: KeyofJoin = joinType === QueryBuilderJoinType.leftJoin ? 'leftJoin' : 'innerJoin';
    if (select) {
      method += 'AndSelect';
    }
    for (const [, relationMetadata] of from.fromEntityMetadata.relationsMetadata) {
      if (relationMetadata.eager) {
        this._includeEagerRelationsRecursively(from.alias, relationMetadata, method as KeyofJoin);
      }
    }
    return this;
  }

  private _includeEagerRelationsRecursively(
    alias: string,
    relationMetadata: RelationMetadata,
    method: KeyofJoin
  ): void {
    const relationEntityMetadata = this.#entitiesMap.get(relationMetadata.referenceType);
    if (!relationEntityMetadata) {
      return;
    }
    const relationAlias = `${alias}_${relationEntityMetadata.dbName!}`;
    this[method as KeyofJoin](`${alias}.${relationMetadata.propertyKey}`, relationAlias);
    if (relationEntityMetadata.relationsMetadata.size) {
      for (const [, relationMetadataInner] of relationEntityMetadata.relationsMetadata) {
        if (relationMetadataInner.eager) {
          this._includeEagerRelationsRecursively(relationAlias, relationMetadataInner, method);
        }
      }
    }
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
    }
    if (relationMeta.joinColumns?.length) {
      if (condition) {
        newCondition += ' AND ';
      }
      for (let i = 0, len = relationMeta.joinColumns.length; i < len; i++) {
        const joinColumn = relationMeta.joinColumns[i];
        newCondition += ' ??.?? = ??.?? ';
        conditionParams.push(tableAlias, joinColumn.name, alias, joinColumn.referencedColumn);
        if (i + 1 < relationMeta.joinColumns.length) {
          newCondition += ' AND ';
        }
      }
    } else if (relationMeta.type === RelationType.manyToMany && relationMeta.joinTable) {
      const relationMetadataMany = this.#entitiesMap.get(relationMeta.joinTable.type)!;
      for (let i = 0, len = relationMeta.joinTable.inverseJoinColumns.length; i < len; i++) {
        const joinColumn = relationMeta.joinTable.inverseJoinColumns[i];
        newCondition += ' ??.?? = ??.?? ';
        conditionParams.push(
          `${tableAlias}_${relationMetadataMany.dbName}`,
          joinColumn.name,
          alias,
          joinColumn.referencedColumn
        );
        if (i + 1 < relationMeta.joinTable.inverseJoinColumns.length) {
          newCondition += ' AND ';
        }
      }
      if (includeSelect) {
        const selectionsMany = this._getSelectableColumns(
          relationMetadataMany,
          `${tableAlias}_${relationMetadataMany.dbName}`
        );
        this.#selectStore.push(...selectionsMany);
      }
    }
    return [
      {
        type,
        fromEntity: reference,
        fromEntityMetadata: referenceMeta,
        from: '??',
        alias: '??',
        params: [referenceMeta!.dbName!, alias, ...conditionParams],
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
    const referenceMeta = this.#entitiesMap.get(reference);
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
    const [tableAlias, relation] = (join ?? '').split('.');
    if (!tableAlias || !relation) {
      throw new Error(`you're supposed to pass the join arg mate :)`);
    }
    const targetMeta =
      this.#fromStore.find(from => from.alias === tableAlias)?.fromEntityMetadata ??
      this.#joinStore.find(j => j.realAlias === tableAlias)?.fromEntityMetadata;
    const relationMeta = targetMeta?.relationsMetadata.get(relation);
    if (!relationMeta || !targetMeta) {
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
    join: [string, Type],
    alias: string,
    condition?: string,
    params?: Record<string, any> | any[],
    includeSelect = false
  ): [QueryBuilderJoin, QueryBuilderSelect[]] {
    const [tableAlias, joinType] = join;
    const from =
      this.#fromStore.find(fr => fr.alias === tableAlias) ?? this.#joinStore.find(j => j.realAlias === tableAlias);
    if (!from) {
      throw new Error(`Could not find alias "${tableAlias}"`);
    }
    if (!from.fromEntity || !from.fromEntityMetadata) {
      throw new Error(`Could not find metadata for ${from.alias}`);
    }

    const relationMetaMap = from.fromEntityMetadata.relationsMetadata.filter(
      (key, rel) => rel.referenceType === joinType
    );
    if (!relationMetaMap.size) {
      throw new Error(`Could not find any relation between alias "${tableAlias}" and "${joinType.name}"`);
    }
    if (relationMetaMap.size > 1) {
      throw new Error(`Found two relations between alias "${tableAlias}" and "${joinType.name}"`);
    }
    const [, relationMeta] = relationMetaMap.first()!;
    const referenceMeta = this.#entitiesMap.get(relationMeta?.referenceType);
    const reference = relationMeta?.referenceType;
    if (!relationMeta || !referenceMeta || !reference) {
      throw new Error(`Couldn't find any relation from type "${joinType.name}"`);
    }
    return this._joinFinal({
      tableAlias,
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
    params?: Record<string, any> | any[]
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
    join: string | [string, Type] | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any> | any[],
    includeSelect = false
  ): [QueryBuilderJoin, QueryBuilderSelect[]] {
    if (!this.#fromStore?.length) {
      throw new Error('Cannot determine relation without "from" table');
    }
    if (isString(join)) {
      return this._joinByName(type, join, alias, condition, params, includeSelect);
    } else if (isArray(join) && join.length === 2) {
      return this._joinByType(type, join, alias, condition, params, includeSelect);
    } else if (isFunction(join)) {
      if (!condition) {
        throw new Error('Condition is required when using join with callback');
      }
      return this._joinByCallback(type, join, alias, condition, params);
    } else {
      throw new Error('Join must be of type string, [alias, Type] or callback function');
    }
  }

  innerJoinAndSelect(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoinAndSelect(joinEntity: [string, Type], alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoinAndSelect(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any> | any[]
  ): this;
  innerJoinAndSelect(
    join: string | [string, Type] | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any> | any[]
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.innerJoin, join, alias, condition, params, true);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  innerJoin(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoin(joinEntity: [string, Type], alias: string, condition?: string, params?: Record<string, any>): this;
  innerJoin(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any> | any[]
  ): this;
  innerJoin(
    join: string | [string, Type] | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any> | any[]
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.innerJoin, join, alias, condition, params);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  leftJoinAndSelect(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoinAndSelect(joinEntity: [string, Type], alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoinAndSelect(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any> | any[]
  ): this;
  leftJoinAndSelect(
    join: string | [string, Type] | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any> | any[]
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.leftJoin, join, alias, condition, params, true);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  leftJoin(joinName: string, alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoin(joinEntity: [string, Type], alias: string, condition?: string, params?: Record<string, any>): this;
  leftJoin(
    callback: (queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>,
    alias: string,
    condition: string,
    params?: Record<string, any> | any[]
  ): this;
  leftJoin(
    join: string | [string, Type] | ((queryBuilder: SelectQueryBuilder<any>) => SelectQueryBuilder<any>),
    alias: string,
    condition?: string,
    params?: Record<string, any> | any[]
  ): this {
    const [joinOption, columns] = this._join(QueryBuilderJoinType.leftJoin, join, alias, condition, params);
    this.#joinStore.push(joinOption);
    this.#selectStore.push(...columns);
    return this;
  }

  async getRawMany<U = any>(): Promise<U[]> {
    return await this.#driver.query(...this.getQueryAndParameters());
  }

  async getRawOne<U = any>(): Promise<U> {
    const result = await this.#driver.query(...this.getQueryAndParameters());
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
    const rawDataFiltered = rawData.filter(value => primary.every(select => !isNullOrUndefined(value[select.alias!])));
    const rawDataUnique = uniqWith(rawDataFiltered, (valueA: any, valueB: any) =>
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
    relationsMap: StMap<string, RelationMetadata>,
    rawData: any[],
    rawEntities: any[]
  ): any[] {
    for (const [relationKey, relation] of relationsMap) {
      const join = this.#joinStore.find(j => j.propertyKey === relationKey && alias === j.parentAlias);
      if (join) {
        if (join.relationMetadata!.type === RelationType.manyToMany) {
          const manyEntity = this.#entitiesMap.get(join.relationMetadata!.joinTable!.type)!;
          let joinRawEntities: any[] = this._getRawUnique(rawData, join.realAlias!);
          const joinManyEntities: any[] = this._getRawUnique(rawData, `${join.parentAlias}_${manyEntity.dbName}`);
          const joinTableMeta = this.#entitiesMap.get(relation.referenceType);
          if (joinTableMeta) {
            joinRawEntities = this._getJoinRecusive(
              join.realAlias!,
              joinTableMeta.relationsMetadata,
              rawData,
              joinRawEntities
            );
          }
          const joinEntities: any[] = plainToClass(join.fromEntity, joinRawEntities);
          rawEntities = rawEntities.map(rawEntity => {
            const manyRelationEntities = joinManyEntities
              .filter(many =>
                join.relationMetadata!.joinTable!.joinColumns.every(
                  joinColumn => rawEntity[joinColumn.referencedColumn!] === many[joinColumn.name!]
                )
              )
              .map(many =>
                joinEntities.find(joinEntity =>
                  join.relationMetadata!.joinTable!.inverseJoinColumns.every(
                    joinColumn => joinEntity[joinColumn.referencedColumn!] === many[joinColumn.name!]
                  )
                )
              );
            return {
              ...rawEntity,
              [join.propertyKey!]: manyRelationEntities,
            };
          });
        } else {
          let joinRawEntities: any[] = this._getRawUnique(rawData, join.realAlias!);
          const joinTableMeta = this.#entitiesMap.get(relation.referenceType);
          if (joinTableMeta) {
            joinRawEntities = this._getJoinRecusive(
              join.realAlias!,
              joinTableMeta.relationsMetadata,
              rawData,
              joinRawEntities
            );
          }
          const joinEntities: any[] = plainToClass(join.fromEntity, joinRawEntities);
          /*const comparator =
            join.relationMetadata!.type === RelationType.oneToOne
              ? (rawEntity: any, joinEntity: any, joinColumn: JoinColumnOptions) =>
                  rawEntity[joinColumn.name!] === joinEntity[joinColumn.referencedColumn!]
              : (rawEntity: any, joinEntity: any, joinColumn: JoinColumnOptions) =>
                  rawEntity[joinColumn.referencedColumn!] === joinEntity[joinColumn.name!];*/
          const comparator = (rawEntity: any, joinEntity: any, joinColumn: JoinColumnOptions): boolean =>
            rawEntity[joinColumn.name!] === joinEntity[joinColumn.referencedColumn!];
          // TODO investigate this, it's weird :b
          rawEntities = rawEntities.map(rawEntity => {
            const joinRelationEntities = joinEntities.filter(joinEntity => {
              return join.relationMetadata!.joinColumns!.every(joinColumn =>
                comparator(rawEntity, joinEntity, joinColumn)
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

  getQueryAndParameters(): Statement {
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
        if (join.relationMetadata?.type === RelationType.manyToMany) {
          const manyReferenceMetadata = this.#entitiesMap.get(join.relationMetadata!.joinTable!.type);
          if (!manyReferenceMetadata || !join.relationMetadata.joinTable) {
            throw new Error(
              `Could not find metadata for ManyToMany ${join.parentAlias}.${join.relationMetadata.propertyKey}`
            );
          }
          const manyAlias = `${join.parentAlias}_${manyReferenceMetadata.dbName}`;
          query += ` ${join.type} ?? AS ?? ON (`;
          params.push(manyReferenceMetadata.dbName, manyAlias);
          for (let i = 0, len = join.relationMetadata.joinTable.joinColumns.length; i < len; i++) {
            const joinColumn = join.relationMetadata.joinTable.joinColumns[i];
            query += ' ??.?? = ??.?? ';
            params.push(manyAlias, joinColumn.name, join.parentAlias, joinColumn.referencedColumn);
            if (i + 1 < join.relationMetadata.joinTable.joinColumns.length) {
              query += ' AND ';
            }
          }
          query += ')';
        }
        query += ` ${join.type} ${join.from} AS ${join.alias} ON (${join.condition})`;
        params.push(...(join.params ?? []));
      }
    }
    const [whereStatement, whereParams] = getWhereStatement(this.#whereStore);
    query += whereStatement;
    params.push(...whereParams);
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
    /* eslint-disable no-console */
    console.log('------- QUERY BEGIN -------');
    console.log(replaceParams(query, params));
    console.log('------- QUERY END -------');
    /* eslint-enable no-console */
    return [query, params];
  }
}
