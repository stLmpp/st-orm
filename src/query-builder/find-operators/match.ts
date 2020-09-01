import { createFindOperator, DefaultFindOperator, FindOperator } from './find-operator.ts';

class MatchOperator extends DefaultFindOperator<string> implements FindOperator<string> {
  expressionHandling(alias: string, valueA: string): string {
    return `MATCH(${alias}) AGAINST (${valueA})`;
  }
  negationHandling(alias: string, valueA: string): string {
    return `NOT MATCH(${alias}) AGAINST (${valueA})`;
  }
}

export const Match = createFindOperator(MatchOperator);
