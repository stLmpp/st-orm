import { Driver } from '../driver/driver.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { baseWhere, getWhereStatement, QueryBuilder, SelectQueryBuilderFn, WhereConditions } from './query-builder.ts';
import { replaceParams } from 'sql-builder';
import {
  QueryBuilderWhere,
  QueryBuilderWhereOperator,
  QueryBuilderWhereParams,
  SelectQueryBuilder,
} from './select-query-builder.ts';
import { ConditionalKeys, ConditionalPick, ExecuteResult, Primitive, Statement, Type } from '../shared/type.ts';
import { isAnyObject } from 'is-what';

export class UpdateQueryBuilder<T> implements QueryBuilder {
  constructor(driver: Driver, entityMetadata: EntityMetadata, alias?: string) {
    this.#driver = driver;
    this.#entityMetadata = entityMetadata;
    this.#databaseName = driver.options.db!;
    this.#alias = alias ?? entityMetadata.dbName!;
  }

  readonly #driver: Driver;
  readonly #entityMetadata: EntityMetadata;
  readonly #alias: string;
  readonly #databaseName: string;

  #setStore: [keyof T, T[keyof T]][] = [];
  #whereStore: QueryBuilderWhere[] = [];

  update<U>(entity: Type<U>, alias?: string): UpdateQueryBuilder<U> {
    return this.#driver.createUpdateQueryBuilder(entity, alias);
  }

  set(update: Partial<ConditionalPick<T, Primitive | Date>>): this;
  set<K extends ConditionalKeys<T, Primitive | Date>>(column: K, value: T[K]): this;
  set<K extends ConditionalKeys<T, Primitive | Date>>(
    update: K | Partial<ConditionalPick<T, Primitive | Date>>,
    value?: T[K]
  ): this {
    if (isAnyObject(update)) {
      this.#setStore = Object.entries(update).reduce((acc: [keyof T, T[keyof T]][], [column, set]) => {
        return [...acc, [column as keyof T, set as any]];
      }, []);
    } else if (value) {
      this.#setStore = [[update, value]];
    }

    return this;
  }

  andSet(update: Partial<ConditionalPick<T, Primitive | Date>>): this;
  andSet<K extends ConditionalKeys<T, Primitive | Date>>(column: K, value: T[K]): this;
  andSet<K extends ConditionalKeys<T, Primitive | Date>>(
    update: K | Partial<ConditionalPick<T, Primitive | Date>>,
    value?: T[K]
  ): this {
    if (isAnyObject(update)) {
      const newSets: [keyof T, T[keyof T]][] = Object.entries(update).reduce(
        (acc: [keyof T, T[keyof T]][], [column, set]) => {
          return [...acc, [column as keyof T, set as any]];
        },
        []
      );
      this.#setStore.push(...newSets);
    } else if (value) {
      this.#setStore.push([update, value]);
    }

    return this;
  }

  private _where(
    condition: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[],
    operator = QueryBuilderWhereOperator.and
  ): QueryBuilderWhere[] {
    return baseWhere({
      condition,
      operator,
      params: params ?? this.#alias,
      createSelectQueryBuilder: () => this.#driver.createSelectQueryBuilder(),
    });
  }

  where(where: string, params?: QueryBuilderWhereParams | any[]): this;
  where(where: SelectQueryBuilderFn<string>): this;
  where(where: WhereConditions): this;
  where(
    where: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[]
  ): this {
    this.#whereStore = this._where(where, params);
    return this;
  }

  andWhere(where: string, params?: QueryBuilderWhereParams | any[]): this;
  andWhere(where: SelectQueryBuilderFn<string>): this;
  andWhere(where: WhereConditions): this;
  andWhere(
    where: string | SelectQueryBuilderFn<string> | WhereConditions,
    params?: QueryBuilderWhereParams | string | any[]
  ): this {
    this.#whereStore.push(...this._where(where, params));
    return this;
  }

  orWhere(where: string, params?: QueryBuilderWhereParams | any[]): this;
  orWhere(where: SelectQueryBuilderFn<string>): this;
  orWhere(where: WhereConditions): this;
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

  async execute(): Promise<ExecuteResult> {
    return this.#driver.execute(...this.getQueryAndParameters());
  }

  getQuery(): string {
    return replaceParams(...this.getQueryAndParameters());
  }

  getQueryAndParameters(): Statement {
    let statement = 'UPDATE ??.?? AS ?? SET ';
    const params: any[] = [this.#databaseName, this.#entityMetadata.dbName, this.#alias];
    for (const set of this.#setStore) {
      statement += ' ??.?? = ?,';
      params.push(this.#alias, ...set);
    }
    statement = statement.slice(0, -1);
    const [whereStatment, whereParams] = getWhereStatement(this.#whereStore);
    statement += whereStatment;
    params.push(...whereParams);
    return [statement, params];
  }
}
