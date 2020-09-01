import { createFindOperator, DefaultFindOperator, FindOperator } from './find-operator.ts';

class IsNullOperator extends DefaultFindOperator<never> implements FindOperator<never> {
  negationHandling(alias: string): string {
    return `${alias} IS NOT NULL`;
  }
  expressionHandling(alias: string): string {
    return `${alias} IS NULL`;
  }
}

export const IsNull = createFindOperator(IsNullOperator);
