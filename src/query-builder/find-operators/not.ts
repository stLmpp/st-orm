import { FindOperatorWhere } from './find-operator.ts';

export function Not({ findOperator, valueB, valueA }: FindOperatorWhere<any>): FindOperatorWhere<any> {
  findOperator.not = true;
  return { findOperator, valueA, valueB };
}
