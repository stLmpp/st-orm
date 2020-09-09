import { Driver } from '../driver/driver.ts';
import { EntityMetadata } from '../entity/entity.ts';
import {
  QueryBuilderWhere,
  QueryBuilderWhereOperator,
  QueryBuilderWhereParams,
  SelectQueryBuilder,
} from './select-query-builder.ts';
import { ExecuteResult, Statement, Type } from '../shared/type.ts';
import { baseWhere, getWhereStatement, QueryBuilder, SelectQueryBuilderFn, WhereConditions } from './query-builder.ts';
import { replaceParams } from 'sql-builder';

export class DeleteQueryBuilder<T> implements QueryBuilder {
  constructor(driver: Driver, entityMetadata: EntityMetadata) {
    this.#driver = driver;
    this.#entityMetadata = entityMetadata;
    this.#databaseName = driver.options.db!;
    this.#alias = entityMetadata.dbName!;
  }

  readonly #driver: Driver;
  readonly #entityMetadata: EntityMetadata;
  readonly #alias: string;
  readonly #databaseName: string;

  #whereStore: QueryBuilderWhere[] = [];

  from<U>(entity: Type<U>): DeleteQueryBuilder<U> {
    return this.#driver.createDeleteQueryByulder(entity);
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
    let statement = 'DELETE FROM ??.??';
    const params: any[] = [this.#databaseName, this.#entityMetadata.dbName];
    const [whereStatement, whereParams] = getWhereStatement(this.#whereStore);
    statement += whereStatement;
    params.push(...whereParams);
    return [statement, params];
  }
}
