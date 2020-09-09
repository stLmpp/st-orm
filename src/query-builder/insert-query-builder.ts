import { QueryBuilder, SelectQueryBuilderFn } from './query-builder.ts';
import { Driver } from '../driver/driver.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { StMap } from '../shared/map.ts';
import { ExecuteResult, Statement, Type } from '../shared/type.ts';
import { SelectQueryBuilder } from './select-query-builder.ts';
import { isAnyObject, isArray, isFunction } from 'is-what';
import { replaceParams } from 'sql-builder';

export interface InsertQueryBuilderValue<T> {
  params?: any[];
  values?: Partial<T>;
  sql?: string;
}

export class InsertQueryBuilder<T> implements QueryBuilder {
  constructor(driver: Driver, entityMetadata: EntityMetadata) {
    this.#driver = driver;
    this.#entityMetadata = entityMetadata;
    this.#databaseName = driver.options.db!;
    this.#entitiesMap = driver.entitiesMap;
    this.#columnsStore = entityMetadata.columnsMetadata.reduce((acc: (keyof T)[], [columnKey, columnMetadata]) => {
      if (!columnMetadata.primary && !columnMetadata.nullable) {
        acc.push(columnKey as keyof T);
      }
      return acc;
    }, []);
  }
  readonly #driver: Driver;
  readonly #entityMetadata: EntityMetadata;
  readonly #databaseName: string;
  readonly #entitiesMap: StMap<any, EntityMetadata>;

  #columnsStore: (keyof T)[] = [];
  #valuesStore: InsertQueryBuilderValue<T>[] = [];

  into<U>(entity: Type<U>): InsertQueryBuilder<U> {
    return this.#driver.createInsertQueryBuilder(entity);
  }

  column(key: keyof T): this {
    this.#columnsStore = [key];
    return this;
  }

  addColumn(key: keyof T): this {
    this.#columnsStore.push(key);
    return this;
  }

  columns(keys: (keyof T)[]): this {
    this.#columnsStore = keys;
    return this;
  }

  addColumns(keys: (keyof T)[]): this {
    this.#columnsStore.push(...keys);
    return this;
  }

  values(value: Partial<T>): this;
  values(values: Partial<T>[]): this;
  values(callback: SelectQueryBuilderFn<SelectQueryBuilder<any>>): this;
  values(values: Partial<T> | Partial<T>[] | SelectQueryBuilderFn<SelectQueryBuilder<any>>): this {
    if (isFunction(values)) {
      const [sql, params] = values(this.#driver.createSelectQueryBuilder()).getQueryAndParameters();
      this.#valuesStore = [{ params, sql }];
    } else if (isArray(values)) {
      this.#valuesStore = values.map(value => ({ values: value }));
    } else if (isAnyObject(values)) {
      this.#valuesStore = [{ values }];
    } else {
      throw new Error(`"values" arg must be of type array, object or callback function`);
    }
    return this;
  }

  addValues(value: Partial<T>): this;
  addValues(values: Partial<T>[]): this;
  addValues(callback: SelectQueryBuilderFn<SelectQueryBuilder<any>>): this;
  addValues(values: Partial<T> | Partial<T>[] | SelectQueryBuilderFn<SelectQueryBuilder<any>>): this {
    if (isFunction(values)) {
      const [sql, params] = values(this.#driver.createSelectQueryBuilder()).getQueryAndParameters();
      this.#valuesStore.push({ params, sql });
    } else if (isArray(values)) {
      this.#valuesStore.push(...values.map(value => ({ values: value })));
    } else if (isAnyObject(values)) {
      this.#valuesStore.push({ values });
    } else {
      throw new Error(`"values" arg must be of type array, object or callback function`);
    }
    return this;
  }

  async execute(): Promise<ExecuteResult[]> {
    return this.#driver.transaction(async connection => {
      return Promise.all(this.getQueryAndParameters().map(sql => connection.execute(...sql)));
    });
  }

  getQuery(): string[] {
    return this.getQueryAndParameters().map(value => replaceParams(...value));
  }

  getQueryAndParameters(): Statement[] {
    let statement = 'INSERT INTO ??.?? ';
    const params: any[] = [this.#databaseName, this.#entityMetadata.dbName];
    if (this.#columnsStore.length) {
      statement += `(${this.#columnsStore.map(() => '??').join(',')}) `;
      params.push(...this.#columnsStore);
    }
    const statementsSql: Statement[] = [];
    for (const valueStore of this.#valuesStore) {
      if (valueStore.sql) {
        statementsSql.push([statement + valueStore.sql, [...params, ...(valueStore.params ?? [])]]);
      } else if (valueStore.values) {
        const [columns, values] = Object.entries(valueStore.values).reduce(
          (acc: [string[], any[]], [column, value]) => {
            if (!this.#entityMetadata.relationsMetadata.has(column)) {
              acc[0].push(column);
              acc[1].push(value);
            }
            return acc;
          },
          [[], []]
        );
        statementsSql.push([
          `INSERT INTO ??.?? (${columns.map(() => '??').join(',')}) VALUES (${values.map(() => '?').join(',')})`,
          [this.#databaseName, this.#entityMetadata.dbName!, ...columns, ...values],
        ]);
      }
    }
    return statementsSql;
  }
}
