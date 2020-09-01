import { createFindOperator, DefaultFindOperator, FindOperator } from './find-operator.ts';

class BetweenOperator extends DefaultFindOperator<any> implements FindOperator<any> {
  getValues(valueA: any, valueB?: any): [any, any] {
    return [valueA, valueB];
  }
  negationHandling(alias: string, valueA: string, valueB?: string): string {
    return `${alias} NOT BETWEEN ${valueA} AND ${valueB}`;
  }
  expressionHandling(alias: string, valueA: string, valueB?: string): string {
    return `${alias} BETWEEN ${valueA} AND ${valueB}`;
  }
}

export const Between = createFindOperator(BetweenOperator);
