import { QueryBuilderWhere, QueryBuilderWhereOperator, SelectQueryBuilder } from './select-query-builder.ts';
import { isAnyObject, isArray, isFunction, isPlainObject, isString } from 'is-what';
import { Primitive, Statement } from '../shared/type.ts';
import { findOperatorResolver, FindOperatorWhere } from './find-operators/find-operator.ts';

export interface QueryBuilder {
  getQuery(): string | string[];
  getQueryAndParameters(): Statement | Statement[];
}

export type SelectQueryBuilderFn<R = any, T = any> = (queryBuilder: SelectQueryBuilder<T>) => R;
export type WhereConditions = Record<
  string,
  Primitive | SelectQueryBuilderFn<SelectQueryBuilder<any>> | FindOperatorWhere<any>
>;

export interface WhereArgs {
  condition: string | SelectQueryBuilderFn<string> | WhereConditions;
  params?: Record<string, any> | any[] | string;
  operator?: QueryBuilderWhereOperator;
  createSelectQueryBuilder: () => SelectQueryBuilder<any>;
}

const PARAM_REGEX = /:(.+?)(?=(\s|$))/gmu;

export function baseWhere<T>({
  condition,
  operator: _operator,
  params,
  createSelectQueryBuilder,
}: WhereArgs): QueryBuilderWhere[] {
  const operator = _operator ?? QueryBuilderWhereOperator.and;
  if (isString(condition)) {
    const [newWhere, newParams] = queryBuilderReplaceParams(condition, params as any);
    return [{ where: newWhere, params: newParams, operator }];
  } else if (isFunction(condition)) {
    const where = condition(createSelectQueryBuilder());
    return [{ where, operator }];
  } else if (isAnyObject(condition)) {
    return Object.entries(condition).map(([key, value]) => {
      const where: QueryBuilderWhere = {
        where: '??.?? = ?',
        params: [params, key, value],
        operator,
      };
      if (isFunction(value)) {
        const [newStatement, newParams] = value(createSelectQueryBuilder()).getQueryAndParameters();
        where.where = `??.?? = (${newStatement})`;
        where.params = [params, key, ...newParams];
      } else if (isPlainObject(value)) {
        const { findOperator, valueA, valueB } = value;
        const [statement, _params] = findOperatorResolver({
          tableAlias: params as any,
          alias: key,
          valueA,
          valueB,
          findOperator,
        });
        where.where = statement;
        where.params = _params;
      }
      return where;
    });
  } else {
    throw new Error('"Where" must be of type string, callback function or object');
  }
}

export function queryBuilderReplaceParams(statement: string, params?: Record<string, any> | any[]): Statement {
  if (isArray(params)) {
    return [statement, params];
  }
  if (!statement.includes(':') || !params) {
    return [statement, []];
  }
  const matches = statement.match(PARAM_REGEX);
  if (!matches?.length) {
    return [statement, []];
  }
  const newParams = matches.map(match => params[match.slice(1)]);
  return [statement.replace(PARAM_REGEX, '?'), newParams];
}

export function getWhereStatement(whereStore: QueryBuilderWhere[]): Statement {
  let statement = '';
  const params: any[] = [];
  if (whereStore.length) {
    statement += ' WHERE ';
    for (let i = 0, len = whereStore.length; i < len; i++) {
      const where = whereStore[i];
      statement += ` ${where.where} `;
      params.push(...(where.params ?? []));
      const next = whereStore[i + 1];
      if (next) {
        statement += ` ${next.operator} `;
      }
    }
  }
  return [statement, params];
}
