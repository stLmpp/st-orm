import { createFindOperator, DefaultFindOperator, FindOperator } from './find-operator.ts';

class InOperator extends DefaultFindOperator<any[]> implements FindOperator<any[]> {
  expressionHandling(alias: string, valueA: string): string {
    return `${alias} IN ${valueA}`;
  }
  negationHandling(alias: string, valueA: string): string {
    return `${alias} NOT IN ${valueA}`;
  }
}

export const In = createFindOperator(InOperator);
