import { FindOperatorWhere } from './find-operator.ts';

export function Not({ __findOperator__, __valueB__, __valueA__ }: FindOperatorWhere<any>): FindOperatorWhere<any> {
  __findOperator__.not = true;
  return { __findOperator__, __valueA__, __valueB__ };
}
