import { createFindOperator, DefaultFindOperator } from './find-operator.ts';

export const Equals = createFindOperator<string>(DefaultFindOperator);
