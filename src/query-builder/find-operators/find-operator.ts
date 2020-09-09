import { isUndefined } from 'is-what';
import { Statement } from '../../shared/type.ts';

export type TypeFindOperator<T> = { new (not?: boolean): FindOperator<T> };

export interface FindOperator<T> {
  not?: boolean;
  getValues(valueA?: T, valueB?: T): [T?, T?];
  negationHandling(alias: string, valueA?: string, valueB?: string): string;
  expressionHandling(alias: string, valueA?: string, valueB?: string): string;
}

export class DefaultFindOperator<T> implements FindOperator<T> {
  constructor(public not = false) {}

  getValues(valueA?: T, valueB?: T): [T?, T?] {
    return [valueA, valueB];
  }

  negationHandling(alias: string, valueA?: string): string {
    return `NOT ${alias} = ${valueA}`;
  }

  expressionHandling(alias: string, valueA?: string): string {
    return `${alias} = ${valueA}`;
  }
}

export type FindOperatorFn<T> = (valueA?: T, valueB?: T) => FindOperatorWhere<T>;

export interface FindOperatorWhere<T> {
  __findOperator__: FindOperator<T>;
  __valueA__?: T;
  __valueB__?: T;
}

export const FindOperatorWhereKeys: (keyof FindOperatorWhere<any>)[] = ['__findOperator__', '__valueA__', '__valueB__'];

export function createFindOperator<T>(operator: TypeFindOperator<T>): FindOperatorFn<T> {
  return (valueA?: T, valueB?: T) => ({
    __findOperator__: new operator(),
    __valueA__: valueA,
    __valueB__: valueB,
  });
}

export interface FindOperatorResolverArgs<T> extends FindOperatorWhere<T> {
  tableAlias: string;
  alias: string;
}

export function findOperatorResolver<T>({
  tableAlias,
  alias,
  __valueA__,
  __valueB__,
  __findOperator__,
}: FindOperatorResolverArgs<T>): Statement {
  const values = __findOperator__.getValues(__valueA__, __valueB__).filter(value => !isUndefined(value));
  if (__findOperator__.not) {
    return [__findOperator__.negationHandling('??.??', '?', '?'), [tableAlias, alias, ...values]];
  } else {
    return [__findOperator__.expressionHandling('??.??', '?', '?'), [tableAlias, alias, ...values]];
  }
}
