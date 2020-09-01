import { RequiredBy, Statement } from '../../shared/type.ts';

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
export type FindOperatorFnRequired<T> = (valueA: T, valueB?: T) => RequiredBy<FindOperatorWhere<T>, 'valueA'>;

export interface FindOperatorWhere<T> {
  findOperator: FindOperator<T>;
  valueA?: T;
  valueB?: T;
}

export function createFindOperator<T>(
  operator: TypeFindOperator<T>
): T extends never ? FindOperatorFn<T> : FindOperatorFnRequired<T> {
  return ((valueA?: T, valueB?: T) => ({
    findOperator: new operator(),
    valueA,
    valueB,
  })) as any;
}

export interface FindOperatorResolverArgs<T> extends FindOperatorWhere<T> {
  tableAlias: string;
  alias: string;
}

export function findOperatorResolver<T>({
  tableAlias,
  alias,
  valueA,
  valueB,
  findOperator,
}: FindOperatorResolverArgs<T>): Statement {
  const values = findOperator.getValues(valueA, valueB);
  if (findOperator.not) {
    return [findOperator.negationHandling('??.??', '?', '?'), [tableAlias, alias, ...values]];
  } else {
    return [findOperator.expressionHandling('??.??', '?', '?'), [tableAlias, alias, ...values]];
  }
}
