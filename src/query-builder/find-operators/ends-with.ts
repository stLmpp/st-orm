import { createFindOperator, DefaultFindOperator, FindOperator } from './find-operator.ts';

class EndsWithOperator extends DefaultFindOperator<string> implements FindOperator<string> {
  getValues(valueA?: string): [string, string?] {
    return [`%${valueA}`];
  }

  negationHandling(alias: string, valueA: string): string {
    return `${alias} NOT LIKE ${valueA}`;
  }

  expressionHandling(alias: string, valueA?: string): string {
    return `${alias} LIKE ${valueA}`;
  }
}

export const EndsWith = createFindOperator(EndsWithOperator);
