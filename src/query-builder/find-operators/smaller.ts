import { createFindOperator, DefaultFindOperator, FindOperator } from './find-operator.ts';

class SmallerOperator extends DefaultFindOperator<any> implements FindOperator<any> {
  expressionHandling(alias: string, valueA?: string): string {
    return `${alias} < ${valueA}`;
  }
  negationHandling(alias: string, valueA?: string): string {
    return `NOT ${alias} < ${valueA}`;
  }
}

export const Smaller = createFindOperator(SmallerOperator);
